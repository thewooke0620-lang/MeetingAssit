// 회의 통역 도우미 서비스 워커: 폰에 설치한 앱이 빨리 열리고, 인터넷이 잠깐 없어도 화면은 뜨게 한다
// 앱 파일(같은 주소의 화면·아이콘)만 다룬다. Soniox·Claude·Groq·Supabase 요청은 건드리지 않는다
const CACHE = "meetingassit-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./fonts/SpoqaHanSansNeo-Regular.woff2", "./fonts/SpoqaHanSansNeo-Medium.woff2", "./fonts/SpoqaHanSansNeo-Bold.woff2", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // 화면(html)은 늘 새로 받아 최신 버전을 쓰고, 안 되면 저장해 둔 것을 보여 준다
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put("./index.html", copy));
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  // 아이콘 등은 저장해 둔 것을 먼저 쓴다
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
