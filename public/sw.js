const CACHE = 'cortex-gym-tracking-v3'
const PREVIOUS_CACHE = 'cortex-gym-tracking-v2'
const API_CACHE = 'cortex-api-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![CACHE, PREVIOUS_CACHE, API_CACHE].includes(k)).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function saveResponse(cacheName, request, response) {
  return caches.open(cacheName).then((c) => c.put(request, response.clone())).catch(() => {})
}

function networkFirst(event, cacheName, fallback) {
  const network = fetch(event.request).then((response) => {
    if (!response.ok) throw new Error('Server unavailable')
    return response
  })
  event.waitUntil(network.then((response) => saveResponse(cacheName, event.request, response)).catch(() => {}))
  event.respondWith(network.catch(async () =>
    (await caches.match(event.request)) || (fallback && await caches.match(fallback)) || Response.error()
  ))
}

function usableAsset(request, response) {
  if (!response || !response.ok) return false
  const mime = response.headers.get('Content-Type') || ''
  if (request.destination === 'script') return /(?:java|ecma)script/i.test(mime)
  if (request.destination === 'style') return mime.includes('text/css')
  return true
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return

  if (url.pathname.startsWith('/api/')) {
    networkFirst(e, API_CACHE)
    return
  }

  // A fresh document must reference the current build's hashed scripts.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    networkFirst(e, CACHE, './index.html')
    return
  }

  // Keep valid assets available while refreshing them in the background.
  const refresh = fetch(e.request).then((response) => {
    if (usableAsset(e.request, response)) e.waitUntil(saveResponse(CACHE, e.request, response))
    return response
  }).catch(() => undefined)
  e.waitUntil(refresh.then(() => undefined))
  e.respondWith(caches.match(e.request).then(async (cached) =>
    usableAsset(e.request, cached) ? cached : (await refresh) || Response.error()
  ))
})
