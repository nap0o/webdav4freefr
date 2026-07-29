// 定义需要替换的旧域名和新域名
const TARGET_DOMAIN = '{用户名}.free.fr';
const WORKER_DOMAIN = '{你的域名.com}';
const TARGET_URL = 'http://' + TARGET_DOMAIN;
const WORKER_URL = 'https://' + WORKER_DOMAIN;

// 重写所有 HTML 属性中的 URL
class AttributeRewriter {
    constructor(attributeName) {
        this.attributeName = attributeName;
    }

    element(element) {
        const attribute = element.getAttribute(this.attributeName);
        if (attribute) {
            if (attribute.includes(TARGET_DOMAIN)) {
                element.setAttribute(
                    this.attributeName,
                    attribute.replace(new RegExp(TARGET_URL, 'g'), WORKER_URL)
                );
            }
        }
    }
}

// 重写所有文本内容中的 URL，主要用于处理内联脚本等
class TextRewriter {
    constructor() { }

    text(text) {
        if (text.text.includes(TARGET_DOMAIN)) {
            text.replace(text.text.replace(new RegExp(TARGET_URL, 'g'), WORKER_URL));
        }
    }
}

// 监听所有传入的请求
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);

    const targetUrl = new URL(url.pathname + url.search, TARGET_URL);

    const headers = new Headers(request.headers);
    headers.set('X-Proxy-Host', url.host);
    headers.set('X-Proxy-Proto', url.protocol.replace(':', ''));

    const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'manual'
    });

    let response = await fetch(newRequest);

    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location && location.includes(TARGET_DOMAIN)) {
            const newLocation = location.replace(TARGET_URL, WORKER_URL);
            response = new Response(response.body, response);
            response.headers.set('location', newLocation);
            return response;
        }
    }

    let newResponse = new Response(response.body, response);
    newResponse.headers.set('access-control-allow-origin', '*');

    const contentType = newResponse.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
        return new HTMLRewriter()
            .on('a', new AttributeRewriter('href'))
            .on('link', new AttributeRewriter('href'))
            .on('script', new AttributeRewriter('src'))
            .on('img', new AttributeRewriter('src'))
            .on('img', new AttributeRewriter('srcset'))
            .on('form', new AttributeRewriter('action'))
            .on('script', new TextRewriter())
            .transform(newResponse);
    }

    return newResponse;
}