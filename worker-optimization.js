// ===================== 配置区域 =====================
const ENABLE_IMAGE_CACHE = true; // 开启图片强制缓存
const ENABLE_API_CACHE = true;   // 开启 API 丝滑微缓存
const API_CACHE_TTL = 10;        // API 缓存时间(秒)，建议 5-10
// ====================================================

// --- 新增：首页伪装 HTML 内容 (一比一还原你的截图) ---
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

// 匹配 Emby 的静态图片路径 (强制缓存 1 年)
const STATIC_REGEX = /(\.(jpg|jpeg|png|gif|svg|webp)|(\/Images\/(Primary|Backdrop|Logo|Thumb|Banner|Art)))/i;
// 匹配慢速加载的 API (微缓存解决转圈圈)
const API_CACHE_REGEX = /(\/Items\/Resume|\/Users\/.*\/Items)/i;
// 匹配视频流路径 (绝对不缓存，防止 CF 报错断流)
const VIDEO_REGEX = /(\/Videos\/|\/Items\/.*\/Download|\/Items\/.*\/Stream)/i;

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, ctx);
  }
};

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  // 1. CORS 处理 (允许跨域)
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

  // 2. 解析你拼接的动态目标地址
  const targetPath = url.pathname.slice(1) + url.search;
  
  // [黑科技]：如果没有带后缀目标地址，或者格式明显不对，直接返回伪装的 HTML 引导页
  if (!targetPath || targetPath === '/' || !targetPath.includes('.')) {
    // 自动把 HTML 里的 CURRENT_HOST 替换成你当前的 CF 域名
    const html = HOME_PAGE_HTML.replaceAll('CURRENT_HOST', url.host);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  // [黑科技]：智能补全协议 (兼容直接写 域名:端口 的情况)
  let finalTargetStr = targetPath;
  if (!finalTargetStr.startsWith('http')) {
    finalTargetStr = 'http://' + finalTargetStr;
  }

  let targetUrl;
  try {
    targetUrl = new URL(finalTargetStr);
  } catch(e) {
    // 如果别人瞎填导致解析报错了，也不要抛出任何文字异常，继续弹首页，死不承认自己是个反代
    const html = HOME_PAGE_HTML.replaceAll('CURRENT_HOST', url.host);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  // 3. 构建新的请求头，伪装成直接访问服务器
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

  // 判断当前请求属于什么类型
  const isImage = STATIC_REGEX.test(targetUrl.pathname);
  const isApiCacheable = API_CACHE_REGEX.test(targetUrl.pathname);
  const isVideo = VIDEO_REGEX.test(targetUrl.pathname);
  const isGetReq = request.method === 'GET';

  // 4. 尝试从 CF 边缘节点读取缓存
  const cache = caches.default;
  if ((isImage && ENABLE_IMAGE_CACHE) || (isApiCacheable && ENABLE_API_CACHE)) {
    if (isGetReq) {
      const cachedResponse = await cache.match(newRequest);
      if (cachedResponse) {
        return cachedResponse; // 命中缓存，瞬间返回！
      }
    }
  }

  // 5. 没命中缓存，老老实实去源服务器请求数据
  try {
    const response = await fetch(newRequest);
    const resHeaders = new Headers(response.headers);
    resHeaders.set('Access-Control-Allow-Origin', '*'); 

    // 视频流特殊处理：打死不缓存，且强制关闭连接防止卡死
    if (isVideo) {
      resHeaders.set('Connection', 'close');
      return new Response(response.body, { status: response.status, headers: resHeaders });
    }

    // 6. 拿到数据后，如果是图片或 API，暴力改写响应头，强行塞进 CF 缓存里
    if (response.status === 200 && isGetReq) {
      
      if (isImage && ENABLE_IMAGE_CACHE) {
        // 图片：删掉不让缓存的头，强行缓存 1 年
        resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        resHeaders.delete('Pragma');
        resHeaders.delete('Expires');
        
        const responseToCache = new Response(response.body, { status: response.status, headers: resHeaders });
        ctx.waitUntil(cache.put(newRequest, responseToCache.clone()));
        return responseToCache;
        
      } else if (isApiCacheable && ENABLE_API_CACHE) {
        // API：强行缓存 10 秒
        resHeaders.set('Cache-Control', `public, max-age=${API_CACHE_TTL}`);
        
        const responseToCache = new Response(response.body, { status: response.status, headers: resHeaders });
        ctx.waitUntil(cache.put(newRequest, responseToCache.clone()));
        return responseToCache;
      }
    }

    // 普通请求（比如网页 HTML、登录请求等），直接放行
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders
    });

  } catch (e) {
    return new Response(`服务器开小差了: ${e.message}`, { status: 502 });
  }
}
