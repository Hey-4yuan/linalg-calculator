/* 线性代数计算器 · Service Worker
 * 策略：
 *   - 页面导航（HTML）：network-first，离线回退缓存，避免发版后看到旧页面
 *   - 带 hash 的静态资源：cache-first（文件名变了自然会重新取）
 *   - 跨域请求（OCR 模型接口）：一律不拦截，直接走网络
 *
 * __SW_VERSION__ 由 scripts/make-pages.mjs 在构建时替换为时间戳，
 * 版本变化会清掉旧缓存。
 */
const VERSION = "__SW_VERSION__";
const CACHE = `linalg-${VERSION}`;
const CACHE_PREFIX = "linalg-";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 单个资源失败不应导致整个安装失败
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // OCR 等跨域请求不接管

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put("./index.html", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = (await caches.match("./index.html")) || (await caches.match("./"));
          return cached || new Response("离线，且没有可用缓存", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      if (resp && resp.status === 200 && resp.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    })(),
  );
});
