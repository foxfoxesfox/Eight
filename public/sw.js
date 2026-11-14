// Makes Eight open with no network. Pages are fetched fresh when online; built files have hashed names, so a cached copy is always right.
const CACHE = 'eight-v1'

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const page = await fetch('/', { cache: 'no-cache' })
    const html = await page.clone().text()
    await cache.put('/', page)
    // The scripts and styles the page asks for, so the very first visit is enough to work offline.
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|svg|webmanifest))"/g)].map(m => m[1])
    await cache.addAll(assets)
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    if (request.mode === 'navigate') {
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put('/', fresh.clone())
        return fresh
      } catch {
        return (await cache.match('/')) ?? Response.error()
      }
    }
    const hit = await cache.match(request)
    if (hit) return hit
    const fresh = await fetch(request)
    if (fresh.ok) cache.put(request, fresh.clone())
    return fresh
  })())
})
