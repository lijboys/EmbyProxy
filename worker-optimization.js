// ===================== 配置区域 =====================
const ENABLE_IMAGE_CACHE = true; // 开启强力图片缓存 (海报秒开)
const ENABLE_API_CACHE = true;   // 开启 API 丝滑微缓存 (解决转圈圈)
const API_CACHE_TTL = 10;        // API 缓存时间(秒)
// ====================================================

// --- 首页伪装 HTML 内容 (防扫描利器) ---
const HOME_PAGE_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚀 使用指南</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; color: #333; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    h1 { color: #0066ff; font-size: 28px; margin-bottom: 30px; }
    h2 { color: #0066ff; font-size: 22px; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .code-block { background: #fdf6f7; border-left: 4px solid #0066ff; padding: 12px 15px; margin: 15px 0; border-radius: 4px; font-family: monospace; color: #d63384; font-size: 15px; overflow-x: auto; white-space: nowrap; }
    .warning-box { background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; padding: 20px; margin-top: 40px; }
    .warning-box p { color: #c53030; margin: 0; font-weight: bold; line-height: 1.8; }
    .underline { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 使用指南</h1>
    <h2>通用格式</h2>
    <div class="code-block">https://CURRENT_HOST/你的域名:端口</div>
    <div class="code-block">https://CURRENT_HOST/http://你的域名:端口</div>
    <div class="code-block">https://CURRENT_HOST/https://你的域名:端口</div>

    <h2>HTTP 示例</h2>
    <div class="code-block">https://CURRENT_HOST/http://emby.com</div>

    <h2>HTTPS 示例</h2>
    <div class="code-block">https://CURRENT_HOST/https://emby.com</div>

    <div class="warning-box">
      <p>⚠️ 严正警告：</p>
      <p>添加服后 <span class="underline">务必手动测试</span> 是否可用。禁止未经测试大批量添加，导致服务器报错刷屏、恶意占用资源者，<span class="underline">直接封禁 IP，不予通知！</span></p>
    </div>
  </div>
</body>
</html>
`;

// 正则匹配规则
const STATIC_REGEX = /(\.(jpg|jpeg|png|gif|svg|webp)|(\/Images\/(Primary|Backdrop|Logo|Thumb|Banner|Art)))/i;
const API_CACHE_REGEX = /(\/Items\/Resume|\/Users\/.*\/Items)/i;
const VIDEO_REGEX = /(\/Videos\/|\/Items\/.*\/Download|\/Items\/.*\/Stream)/i;

// 使用现代 ES 模块语法
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, ctx);
  }
};

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  // 1. 跨域 OPTIONS 处理
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // 2. 目标地址解析与伪装页拦截
  const targetPath = url.pathname.slice(1) + url.search;
  
  if (!targetPath || targetPath === '/' || !targetPath.includes('.')) {
    const html = HOME_PAGE_HTML.replaceAll('CURRENT_HOST', url.host);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  let finalTargetStr = targetPath.startsWith('http') ? targetPath : 'http://' + targetPath;
  let targetUrl;
  try {
    targetUrl = new URL(finalTargetStr);
  } catch(e) {
    const html = HOME_PAGE_HTML.replaceAll('CURRENT_HOST', url.host);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  // ==========================================
  // 3. WebSocket 专属处理逻辑 (融合了你老代码的精髓)
  // ==========================================
  if (request.headers.get('Upgrade') === 'websocket') {
    const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsTargetUrl = `${wsProtocol}//${targetUrl.host}${targetUrl.pathname}${targetUrl.search}`;
    const clientSocket = new WebSocketPair();
    const [client, server] = Object.values(clientSocket);

    try {
      const targetSocket = new WebSocket(wsTargetUrl);
      targetSocket.accept();
      targetSocket.addEventListener('message', event => server.send(event.data));
      server.addEventListener('message', event => targetSocket.send(event.data));
      targetSocket.addEventListener('close', event => server.close(event.code, event.reason));
      server.addEventListener('close', event => targetSocket.close(event.code, event.reason));
      targetSocket.addEventListener('error', e => server.close(1011, e.message));
      server.addEventListener('error', e => targetSocket.close(1011, e.message));
    } catch (e) {
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // 4. 构建普通 HTTP 请求头 (防盗链与真实IP透传)
  const newHeaders = new Headers(request.headers);
  newHeaders.set('Host', targetUrl.host);
  newHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP'));
  newHeaders.delete('Referer'); 
  newHeaders.delete('cf-connecting-ip');
  
  const newRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: newHeaders,
    body: request.body,
    redirect: 'manual' 
  });

  const isImage = STATIC_REGEX.test(targetUrl.pathname);
  const isApiCacheable = API_CACHE_REGEX.test(targetUrl.pathname);
  const isVideo = VIDEO_REGEX.test(targetUrl.pathname);
  const isGetReq = request.method === 'GET';

  // 5. 读缓存
  const cache = caches.default;
  if ((isImage && ENABLE_IMAGE_CACHE) || (isApiCacheable && ENABLE_API_CACHE)) {
    if (isGetReq) {
      const cachedResponse = await cache.match(newRequest);
      if (cachedResponse) return cachedResponse; 
    }
  }

  // 6. 回源请求与写缓存 (暴力缓存机制)
  try {
    const response = await fetch(newRequest);
    const resHeaders = new Headers(response.headers);
    resHeaders.set('Access-Control-Allow-Origin', '*'); 

    if (isVideo) {
      resHeaders.set('Connection', 'close');
      return new Response(response.body, { status: response.status, headers: resHeaders });
    }

    if (response.status === 200 && isGetReq) {
      if (isImage && ENABLE_IMAGE_CACHE) {
        resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        resHeaders.delete('Pragma');
        resHeaders.delete('Expires');
        const responseToCache = new Response(response.body, { status: response.status, headers: resHeaders });
        ctx.waitUntil(cache.put(newRequest, responseToCache.clone()));
        return responseToCache;
      } else if (isApiCacheable && ENABLE_API_CACHE) {
        resHeaders.set('Cache-Control', `public, max-age=${API_CACHE_TTL}`);
        const responseToCache = new Response(response.body, { status: response.status, headers: resHeaders });
        ctx.waitUntil(cache.put(newRequest, responseToCache.clone()));
        return responseToCache;
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders
    });

  } catch (e) {
    return new Response(`服务器开小差了: ${e.message}`, { status: 502 });
  }
}
