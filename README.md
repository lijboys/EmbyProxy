# Emby-Cloudflare-Workers-Proxy
一个基于Cloudflare Workers的Emby反代工具，支持WebSocket实时功能、黑名单控制，仅需拼接目标Emby地址即可一键反代，适配个人Emby服务器的远程访问需求。


## ✨ 功能特性
- 支持HTTP/HTTPS协议的Emby服务器反代
- 完整WebSocket支持：保障Emby收藏、追新、播放同步等实时功能
- 黑名单控制：仅屏蔽指定域名，无需手动添加白名单，配置更省心
- 自动端口识别：支持默认端口（443/80）省略、非默认端口（如8096）显式拼接
- 跨域兼容：适配Emby Web/客户端的跨域访问需求
- 重定向自动处理：目标服务器重定向请求自动转换为Worker地址


## 🚀 部署指南（Cloudflare Workers）
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入「Workers & Pages」
2. 点击「创建应用程序」→「创建Worker」，输入Worker名称后点击「部署」
3. 部署完成后，点击「编辑代码」，删除默认代码，粘贴本项目的 [worker.js](worker.js) 代码
4. （可选）修改代码中 `BLOCKED_DOMAINS` 数组，添加需要屏蔽的域名（留空则不屏蔽）
5. 点击「保存并部署」，获取Worker域名（如 `your-emby-proxy.workers.dev`）


## ⚙️ 配置说明
代码中仅需修改以下配置项（位于代码顶部）：
```javascript
// 黑名单：禁止反代的域名，留空则不屏蔽任何域名
const BLOCKED_DOMAINS = [
  'malicious.com', // 示例：需屏蔽的域名
  'spam-emby.com'
];
```


## 📖 使用方法
在Worker域名后直接拼接目标Emby服务器地址（含协议、域名/IP、端口）：
```
https://你的Worker域名/https://你的Emby域名:端口
```

### 示例
- Emby使用默认HTTPS端口（443）：
  ```
  https://your-emby-proxy.workers.dev/https://emby.yourdomain.com
  ```
- Emby使用非默认端口（如8096）：
  ```
  https://your-emby-proxy.workers.dev/https://emby.yourdomain.com:8096
  ```


## ❓ 常见问题
### 1. 报错「521: Web server is down」
- 直接访问目标Emby地址，确认服务器是否正常启动
- 检查Emby端口是否被防火墙/安全组放行
- 确认Worker访问格式的协议（HTTP/HTTPS）与Emby服务器一致


### 2. 播放视频卡顿/速度慢
- 降低Emby客户端的「远程播放质量」（如1080P→720P）
- 开启Emby服务器的硬件转码功能
- 更换Cloudflare优选节点（调整自定义域的CNAME指向）
- 在Worker代码中添加静态资源缓存（参考项目Issues中的缓存配置）


### 3. WebSocket功能失效
- 确认代码中已包含WebSocket处理逻辑（本项目默认支持）
- 检查Emby服务器是否开启WebSocket服务（Emby默认开启）


## ⚠️ 免责声明
- 本工具仅用于**个人合法拥有的Emby服务器远程访问**
- 禁止使用本工具访问未经授权、侵权的Emby资源，或绕过合法的地域/访问限制
- 使用者需遵守所在地区法律法规及Cloudflare、Emby的服务协议


## 📄 许可证
MIT License
