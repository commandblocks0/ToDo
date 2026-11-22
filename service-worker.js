const CACHE = "todo-v5";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
      fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();

              caches.open(CACHE).then((cache) => {
                cache.put(event.request, copy);
              });
            }

            return response;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(event.request);

            if (cachedResponse) return cachedResponse;

            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }

            return new Response("Offline", {
              status: 503,
              headers: {
                "Content-Type": "text/plain"
              }
            });
          })
  );
});