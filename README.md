# webdav4freefr

webdav4freefr 是一款极致轻量的单文件 **PHP WebDAV 服务**与**可视化文件管理器**。本项目经过深度精简与重构，**专为 Free.fr 免费空间量身定制**。它内置 HTTP Basic Auth 安全鉴权与操作日志记录，能够完美适应 Free.fr 的底层环境与资源限制，帮助您零成本打造出稳定、私密的轻量级个人云盘。

## ✨ 核心特性 (Features)

* **多用户 Basic Auth 登录**
  * 通过 `index.php` 中的 `$auth_users` 数组进行静态配置。
  * 允许添加多个拥有各自独立密码的用户账号，安全可靠。
* **完整的 WebDAV 支持**
  * 完美支持各大主流客户端（如 AList、RaiDrive、Finder 等）。
  * 支持方法：`OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, COPY, MOVE, LOCK, UNLOCK`。
* **操作日志 (可选)**
  * 每日操作日志自动记录到 `./logs/YYYY-MM-DD.log`。
  * 可以在 Web 界面中通过 `?log_action=download` 下载日志，或 `?log_action=clear` 清空日志。

---

## 🚀 一、 部署基本步骤 (free.fr)

free.fr 提供了免费的 PHP 运行环境，非常适合部署该项目。具体步骤如下：

1. **下载源码**：下载本项目的全部源码并解压到本地。
2. **上传文件**：通过 [在线FTP (https://net2ftp.alwaysdata.net)](https://net2ftp.alwaysdata.net/)，将除了 `worker.js` 之外的**所有代码文件**直接上传到 free.fr 的根目录。
3. **初始登录**：文件上传完毕后，你可以直接使用默认账号 `admin`，默认密码 `admin888` 登录访问。
4. **修改密码（强烈建议）**：为了安全起见，请通过浏览器访问 `http://{你的用户名}.free.fr/gen.php`，输入你想要设置的明文新密码，生成并复制专用的密文哈希串。
5. **配置新账号**：使用代码编辑器或直接在 FTP 端编辑 `index.php` 文件，找到大概第 20 行的 `$auth_users` 数组：
   ```php
   $auth_users = [
       '你的用户名' => '你刚刚复制的密文密码'
   ];
   ```
   修改完成后保存并覆盖上传。至此，您的专属网盘就已经部署完成了！

---

## 🔗 二、 使用 WebDAV 服务（以 AList / OpenList 为例）

配置完成后，您可以非常方便地将其挂载到第三方工具（如 AList）中：

1. 登录 AList 后台，进入 **存储 -> 添加**。
2. 选择驱动类型为 **WebDAV**。
3. 填写挂载路径和备注名称。
4. 关键配置项填写如下：
   * **WebDAV 路径 (URL)**：`http://{你的用户名}.free.fr/index.php` (请务必带上 `/index.php` 后缀)
   * **用户名**：你在 `index.php` 中配置的账号名。
   * **密码**：你在 `gen.php` 界面输入的**明文密码**（注意不是密文）。
5. 保存即可成功挂载。

---

## 🌐 三、 通过 Cloudflare Worker 反向代理绑定自定义域名与 HTTPS

Free.fr 原生仅提供 HTTP 服务且国内直连存在网络瓶颈。本项目提供了经过深度定制与 RFC 4918 规范优化的 Cloudflare Worker 反代适配器，支持全自动为网盘套上安全 HTTPS 证书与自定义域名。

### 🌟 Worker 核心特性与适配优势
* **ES Modules 现代架构**：采用 Cloudflare 官方推荐的 `export default { async fetch }` 标准构建。
* **自定义域名全自动识别**：无需手动硬编码代理域名，无论绑定任意自定义域名还是使用 `*.workers.dev`，脚本均能全自动自适应识别。
* **WebDAV RFC 4918 协议深度兼容**：
  * **修复 `MOVE`/`COPY` 报错**：自动双向重写 `Destination` 目标头，彻底杜绝文件重命名和移动时的 `502 Bad Gateway`。
  * **207 Multi-Status XML 域名重写**：目录遍历输出的 XML 中的源站裸域自动替换为代理域名，防止客户端断联或 Mixed Content。
  * **Windows 原生驱动器映射兼容**：内置 `MS-Author-Via: DAV` 响应头，完美支持 Windows 资源管理器直接挂载。
* **流式零缓冲直通**：保持流式传输管道，支持 WebDAV 客户端突破 10MB 限制上传大文件。

---

### 🛠️ 部署步骤

1. **修改源站域名**：
   打开项目根目录下的 `worker.js`，只需修改顶部的唯一源站常量：
   ```javascript
   // 替换为你实际的 free.fr 域名（例如 niuxun.free.fr）
   const DEFAULT_TARGET_DOMAIN = '{你的用户名}.free.fr';
   ```
   *(注：无需配置 Worker 代理域名，脚本会自动动态识别当前访问域名；亦可在 Cloudflare 后台 **Settings -> Variables** 中配置环境变量 `TARGET_DOMAIN` 覆盖)*

2. **创建与部署 Worker**：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，在左侧导航栏进入 **Workers & Pages**。
   - 点击 **Create Application** -> **Create Worker**，命名后点击部署。
   - 部署完成后点击 **Edit code** 进入代码编辑器。
   - 将修改好的 `worker.js` 全选并覆盖到 Cloudflare 编辑器中，点击右上角的 **Save and Deploy (保存并部署)**。

3. **绑定自定义域名**：
   - 进入该 Worker 的 **Settings** -> **Domains & Routes** -> **Add -> Custom Domain**。
   - 输入您准备好的域名（例如 `dav.yourdomain.com`），根据向导完成 DNS 绑定。

部署完成后，即可使用安全的 `https://你的域名/index.php` 访问 Web 控制台或作为 WebDAV 地址挂载使用！

---

## 💡 四、关于 Free.fr 的文件上传限制说明

Free.fr 作为一个免费共享空间，其底层的 PHP 环境有着非常严格的资源限制（通常 `upload_max_filesize` 和 `post_max_size` 均为 10MB，且 `max_execution_time` 为 30 秒）。

针对这些限制，本项目的两种上传方式会有截然不同的表现：

### 1. 原生 Web UI 上传（浏览器操作）
* **表现**：严格受限于 10MB。
* **原因**：Web 界面使用的是标准的 HTML 表单 POST 上传。这种方式会经过 PHP 引擎的完整解析，一旦文件超过 `post_max_size` (10MB)，请求会立刻被 PHP 核心拦截并丢弃。

### 2. 挂载 WebDAV 服务上传（如使用 AList / OpenList）
* **表现**：可以**突破 10MB 的限制**，最高可达接近 **100MB**。
* **原因**：第三方 WebDAV 客户端上传文件使用的是原生 HTTP `PUT` 二进制流。`webdav4freefr` 的底层代码（`Dav::PUT`）巧妙地使用了 `php://input` 数据流直写磁盘的方式，完全绕过了 PHP 表单解析引擎的拦截。
* **为什么是 100MB？**：这并非 Free.fr 的限制，而是如果您使用了 Cloudflare Worker 进行反代，Cloudflare 免费版的单次请求载荷 (Payload) 上限为 100MB。
* **注意事项**：由于 `max_execution_time` (30秒) 依然生效，要成功“偷渡” 100MB 的大文件，要求您的 WebDAV 客户端到 Free.fr 之间的网络传输速度足够快（大于 3.5MB/s），以确保在 30 秒内传输完毕，否则进程仍会被强行终止。
