/* Skill Gaming World safety-first service worker.
 * It intentionally does not cache authenticated, gameplay, ledger, eligibility,
 * or jurisdiction responses. Offline gameplay is not supported because the
 * server remains authoritative for moves and official time.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network behavior remains browser-native. No API or gameplay state is cached.
});
