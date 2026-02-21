// ===================== 配置区域 =====================
const ENABLE_IMAGE_CACHE = true; 
const BLOCK_MSG = 'Access Denied: Please use custom domain.';
// ====================================================

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, ctx); // 修复 1：把 ctx 传进去，不然缓存功能会报错
  }
};

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  // 安全策略：禁止默认 workers.dev 域名访问
  if (url.hostname.endsWith('.workers.dev') || url.hostname.endsWith('.pages.dev')) {
    return new Response(BLOCK_MSG, { status: 403 });
  }

  // CORS 处理
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

  // 从路径中解析目标地址，实现动态反代多个服务器
  const targetPath = url.pathname.slice(1) + url.search;
  
  if (!targetPath || !targetPath.startsWith('http')) {
    return new Response('使用方式: https://你的自定义域名/https://emby服务器地址', {status: 400});
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetPath);
  } catch(e) {
    return new Response('无效的目标地址格式', {status: 400});
  }

  // 构造新的请求 (已取消白名单保护，允许反代任意接在后缀的地址)
  const newRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual' 
  });

  // 伪装头部信息，让 Emby 以为是真实用户直接访问
  newRequest.headers.set('Host', targetUrl.host);
  newRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP'));
  newRequest.headers.delete('Referer'); 

  // 图片缓存逻辑
  const isImage = targetUrl.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || 
                  targetUrl.pathname.includes('/Images/') || 
                  targetUrl.pathname.includes('/Primary');

  // 如果开启了缓存，并且是 GET 请求的图片，先看边缘节点有没有缓存
  if (ENABLE_IMAGE_CACHE && isImage && request.method === 'GET') {
    const cache = caches.default;
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse; 
    }
  }

  try {
    // 修复 2：在 Cloudflare Worker 中，标准的 fetch 会自动处理 WebSocket (ws/wss) 的升级透传
    // 所以不需要手动去写 WebSocketPair 的复杂逻辑了
    const response = await fetch(newRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*'); 

    // 如果拿到的是图片，并且响应成功，存入 CF 边缘节点缓存
    if (ENABLE_IMAGE_CACHE && isImage && response.status === 200) {
      newHeaders.set('Cache-Control', 'public, max-age=86400');
      
      const responseToCache = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
      
      // 克隆一份给用户返回
      const responseForClient = responseToCache.clone();
      
      // ctx 正常传递后，这里就不会报错了
      ctx.waitUntil(caches.default.put(request, responseToCache));
      return responseForClient;
    }

    // 针对非图片的普通请求或视频流，直接返回
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (e) {
    return new Response(`反代连接失败: ${e.message}`, { status: 500 });
  }
}
