// RODE service worker: caches only static assets. API and navigations always go to the network,
// so production data is never served from cache and offline writes are never faked.
const CACHE = "rode-static-v1";
const OFFLINE_HTML = `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RODE - Offline</title>
<body style="font-family:sans-serif;background:#F8FAFC;color:#0F172A;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:24px"><h1 style="color:#0A2463">Anda sedang offline</h1>
<p>Data produksi tidak dapat disimpan atau ditampilkan tanpa koneksi ke server.</p>
<button onclick="location.reload()" style="background:#0A2463;color:#fff;border:0;padding:12px 20px;border-radius:8px">Coba lagi</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  }
});
