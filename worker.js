/**
 * Cloudflare Worker - WebDAV 反向代理与协议适配器
 * 针对 Free.fr 虚拟主机与 EasyWebDAV (index.php) 进行深度定制与优化
 */

// 默认配置（支持通过 Cloudflare Worker 环境变量覆盖）
const DEFAULT_TARGET_DOMAIN = '{用户名}.free.fr';
const DEFAULT_TARGET_PROTOCOL = 'http:';

// WebDAV 与 CORS 允许的请求方法
const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, MKCOL, PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS, HEAD';

// WebDAV 与 CORS 允许的请求报头
const ALLOWED_HEADERS = 'Authorization, Content-Type, Depth, Destination, If-Match, If-None-Match, Lock-Token, Overwrite, Timeout, X-Requested-With, Cache-Control, Range';

// 允许客户端读取的响应报头
const EXPOSED_HEADERS = 'DAV, ETag, Lock-Token, Content-Length, Content-Range, Content-Type, Last-Modified, Date';

/**
 * 重写 HTML 元素属性中的 URL
 */
class AttributeRewriter {
    constructor(attributeName, targetOrigin, workerOrigin) {
        this.attributeName = attributeName;
        this.targetOrigin = targetOrigin;
        this.workerOrigin = workerOrigin;
    }

    element(element) {
        const attribute = element.getAttribute(this.attributeName);
        if (attribute && attribute.includes(this.targetOrigin)) {
            element.setAttribute(
                this.attributeName,
                attribute.replaceAll(this.targetOrigin, this.workerOrigin)
            );
        }
    }
}

/**
 * 重写 HTML 文本内容中的源站 URL（如内联脚本、样式等）
 */
class TextRewriter {
    constructor(targetOrigin, workerOrigin) {
        this.targetOrigin = targetOrigin;
        this.workerOrigin = workerOrigin;
    }

    text(textChunk) {
        if (textChunk.text && textChunk.text.includes(this.targetOrigin)) {
            textChunk.replace(textChunk.text.replaceAll(this.targetOrigin, this.workerOrigin));
        }
    }
}

/**
 * 为响应头应用跨域资源共享 (CORS) 与安全配置
 */
function applyCorsHeaders(headers, requestOrigin) {
    headers.set('Access-Control-Allow-Origin', requestOrigin || '*');
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Max-Age', '86400');
}

export default {
    /**
     * Worker 请求主入口 (Fetch Event Handler)
     * @param {Request} request 客户端原始请求
     * @param {Record<string, string>} env 环境变量
     * @param {ExecutionContext} ctx 执行上下文
     * @returns {Promise<Response>} 响应对象
     */
    async fetch(request, env, ctx) {
        const clientUrl = new URL(request.url);

        // 动态解析源站域名（优先使用环境变量，其次使用默认常量）
        const targetDomain = (env && env.TARGET_DOMAIN) || DEFAULT_TARGET_DOMAIN;
        const targetProtocol = (env && env.TARGET_PROTOCOL) || DEFAULT_TARGET_PROTOCOL;
        const targetOrigin = `${targetProtocol}//${targetDomain}`;

        // 全自动动态识别当前 Worker 代理的协议与主机名（自适应自定义域名与 workers.dev）
        const workerHost = clientUrl.host;
        const workerProtocol = clientUrl.protocol;
        const workerOrigin = `${workerProtocol}//${workerHost}`;

        const requestOrigin = request.headers.get('Origin') || '';

        // 1. 拦截预检与握手请求 (OPTIONS)，返回 WebDAV 标准能力、CORS 响应与 Windows 兼容头
        if (request.method === 'OPTIONS') {
            const preflightHeaders = new Headers();
            applyCorsHeaders(preflightHeaders, requestOrigin);
            preflightHeaders.set('DAV', '1, 2');
            preflightHeaders.set('Allow', ALLOWED_METHODS);
            // 兼容 Windows 资源管理器 WebClient 映射驱动器
            preflightHeaders.set('MS-Author-Via', 'DAV');
            preflightHeaders.set('Content-Length', '0');
            return new Response(null, { status: 200, headers: preflightHeaders });
        }

        // 2. 构造源站请求 URL
        const targetUrl = new URL(clientUrl.pathname + clientUrl.search, targetOrigin);

        // 3. 处理请求头转发
        const newHeaders = new Headers(request.headers);

        // 传递标准反向代理与真实客户端 IP 头（便于 index.php 进行日志与审计记录）
        const clientIp = request.headers.get('cf-connecting-ip') || '';
        if (clientIp) {
            newHeaders.set('X-Forwarded-For', clientIp);
            newHeaders.set('X-Real-IP', clientIp);
        }
        newHeaders.set('X-Forwarded-Host', workerHost);
        newHeaders.set('X-Forwarded-Proto', workerProtocol.replace(':', ''));
        newHeaders.set('X-Proxy-Host', workerHost);
        newHeaders.set('X-Proxy-Proto', workerProtocol.replace(':', ''));

        // 4. WebDAV 关键特性：重写 Destination 请求头 (MOVE / COPY 动词必须)
        // WebDAV 规范中 Destination 头必须是绝对 URI，客户端会带上 Worker 的公网域名
        // 必须将其重写为源站的域名与协议，否则 Free.fr 后端解析比对失败会直接返回 502 Bad Gateway
        const rawDestination = request.headers.get('Destination');
        if (rawDestination) {
            try {
                const destUrl = new URL(rawDestination);
                // 替换协议与主机名映射到源站，并显式清空端口防止源站比对失败
                destUrl.protocol = targetProtocol;
                destUrl.host = targetDomain;
                destUrl.port = '';
                newHeaders.set('Destination', destUrl.toString());
            } catch {
                // 若解析失败，采用字符串全局替换方案保底
                newHeaders.set(
                    'Destination',
                    rawDestination.replaceAll(workerOrigin, targetOrigin)
                );
            }
        }

        // 5. 构造转发请求：保持 request.body 流式传输直通，不截断、不缓冲，支持大文件上传
        const init = {
            method: request.method,
            headers: newHeaders,
            redirect: 'manual'
        };

        // 仅在非 GET/HEAD 请求且存在 body 时挂载请求体
        if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
            init.body = request.body;
        }

        const originRequest = new Request(targetUrl.toString(), init);

        // 6. 请求源站服务器
        let originResponse;
        try {
            originResponse = await fetch(originRequest);
        } catch (err) {
            return new Response(`源站网关连接异常: ${err.message}`, {
                status: 502,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }

        // 规范处理：HTTP 204, 205, 304 严禁携带 Body，否则 Fetch API 会抛出 TypeError
        const isNullBodyStatus = originResponse.status === 204 || originResponse.status === 205 || originResponse.status === 304;
        const safeBody = isNullBodyStatus ? null : originResponse.body;

        // 7. 处理 3xx 重定向响应 (Location 头改写为 Worker 域名)
        if (originResponse.status >= 300 && originResponse.status < 400) {
            const location = originResponse.headers.get('Location');
            if (location) {
                const redirectHeaders = new Headers(originResponse.headers);
                try {
                    const locUrl = new URL(location, targetOrigin);
                    // 仅当重定向目标指向源站自身时重写为 Worker 域名
                    if (locUrl.host === targetDomain) {
                        locUrl.protocol = workerProtocol;
                        locUrl.host = workerHost;
                    }
                    redirectHeaders.set('Location', locUrl.toString());
                } catch {
                    redirectHeaders.set('Location', location.replaceAll(targetOrigin, workerOrigin));
                }
                applyCorsHeaders(redirectHeaders, requestOrigin);
                return new Response(safeBody, {
                    status: originResponse.status,
                    statusText: originResponse.statusText,
                    headers: redirectHeaders
                });
            }
        }

        const contentType = originResponse.headers.get('Content-Type') || '';

        // 8. 处理 WebDAV 207 Multi-Status 与 XML 响应 (重写 <D:href> 等源站暴露链接)
        if (originResponse.status === 207 || contentType.includes('xml')) {
            const rawXml = await originResponse.text();
            // 将 XML 内部泄露的源站 URL 和域名全面替换为 Worker 代理地址
            const replacedXml = rawXml
                .replaceAll(targetOrigin, workerOrigin)
                .replaceAll(targetDomain, workerHost);

            const xmlHeaders = new Headers(originResponse.headers);
            applyCorsHeaders(xmlHeaders, requestOrigin);
            // 确保 WebDAV 私密 XML 响应不被客户端随意缓存
            xmlHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            // 必须删除原有的长度与编码头，避免替换后长度变化导致客户端解析截断或解压失败
            xmlHeaders.delete('Content-Length');
            xmlHeaders.delete('Content-Encoding');

            return new Response(replacedXml, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: xmlHeaders
            });
        }

        // 9. 处理 HTML 网页控制台 (利用 HTMLRewriter 深度替换资源路径)
        if (contentType.includes('text/html')) {
            const htmlHeaders = new Headers(originResponse.headers);
            applyCorsHeaders(htmlHeaders, requestOrigin);
            // 移除 Content-Length，交由流式传输自动处理分块
            htmlHeaders.delete('Content-Length');

            const modifiedResponse = new Response(safeBody, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: htmlHeaders
            });

            return new HTMLRewriter()
                .on('a', new AttributeRewriter('href', targetOrigin, workerOrigin))
                .on('link', new AttributeRewriter('href', targetOrigin, workerOrigin))
                .on('script', new AttributeRewriter('src', targetOrigin, workerOrigin))
                .on('img', new AttributeRewriter('src', targetOrigin, workerOrigin))
                .on('img', new AttributeRewriter('srcset', targetOrigin, workerOrigin))
                .on('form', new AttributeRewriter('action', targetOrigin, workerOrigin))
                .on('script', new TextRewriter(targetOrigin, workerOrigin))
                .transform(modifiedResponse);
        }

        // 10. 处理普通文件下载/上传等其他响应 (流式直传，零内存开销)
        const responseHeaders = new Headers(originResponse.headers);
        applyCorsHeaders(responseHeaders, requestOrigin);

        return new Response(safeBody, {
            status: originResponse.status,
            statusText: originResponse.statusText,
            headers: responseHeaders
        });
    }
};