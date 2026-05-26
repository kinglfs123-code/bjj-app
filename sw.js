// ═══════════════════════════════════════════════════════════════════════
//   Garage Training — Service Worker
//   Cache strategies:
//     • HTML       → Network-first (sempre tenta a versão fresca)
//     • JS/CSS     → Stale-while-revalidate (mostra o cache, atualiza em bg)
//     • Imagens    → Cache-first com fallback de rede
//     • Supabase   → Network-only (nunca cacheia API)
//
//   Bump VERSION quando quiser invalidar todos os caches.
// ═══════════════════════════════════════════════════════════════════════

const VERSION = 'v1.0.1';
const CACHE_STATIC = `garage-static-${VERSION}`;
const CACHE_PAGES  = `garage-pages-${VERSION}`;
const CACHE_IMG    = `garage-img-${VERSION}`;

// Recursos pré-cacheados na instalação (essenciais pra abrir offline)
const PRECACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/cadastro.html',
  '/offline.html',
  '/app.css',
  '/app.js',
  '/db.js',
  '/auth.js',
  '/config.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// ─── INSTALAR ──────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[sw] Install', VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      // Cache-busts: força que cada GET seja feito do server na instalação
      return cache.addAll(
        PRECACHE.map(url => new Request(url, { cache: 'reload' }))
      );
    }).then(() => self.skipWaiting()) // Ativa imediatamente
  );
});

// ─── ATIVAR — Limpa caches velhos ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[sw] Activate', VERSION);
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys
          .filter(k => !k.endsWith(VERSION))   // mantém só o atual
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // toma controle de abas abertas
  );
});

// ─── HELPERS ──────────────────────────────────────────────────────────
function isHTMLRequest(req) {
  return req.mode === 'navigate' || 
         req.destination === 'document' || 
         req.headers.get('accept')?.includes('text/html');
}

function isStaticAsset(url) {
  return /\.(css|js|json|woff2?|ttf|otf)$/i.test(url.pathname);
}

function isImage(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname);
}

function isSupabaseAPI(url) {
  return url.hostname.endsWith('.supabase.co') || 
         url.hostname.endsWith('.supabase.in');
}

function isCacheable(url) {
  return url.origin === self.location.origin && url.protocol.startsWith('http');
}

// ─── ESTRATÉGIAS DE CACHE ─────────────────────────────────────────────

// Network-first: tenta rede, cai pra cache, fallback pra offline.html
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback pra HTML offline
    if (isHTMLRequest(req)) {
      const offline = await cache.match('/offline.html');
      if (offline) return offline;
    }
    throw err;
  }
}

// Stale-while-revalidate: serve do cache (rápido), atualiza em background
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || networkPromise || (await networkPromise);
}

// Cache-first: tenta cache, cai pra rede
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

// ─── FETCH ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Só GETs são cacheáveis
  if (req.method !== 'GET') return;
  
  const url = new URL(req.url);
  
  // Supabase API: nunca cacheia (dados precisam ser frescos)
  if (isSupabaseAPI(url)) return;
  
  // Não-mesma-origem que não seja CDN conhecida: deixa rolar
  if (!isCacheable(url)) {
    // CDN do Supabase JS / fonts / tabler icons → stale-while-revalidate
    if (url.hostname === 'cdn.jsdelivr.net' || 
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com') {
      event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
    }
    return;
  }
  
  // HTML → network-first (sempre quer a versão atualizada)
  if (isHTMLRequest(req)) {
    event.respondWith(networkFirst(req, CACHE_PAGES));
    return;
  }
  
  // Imagens → cache-first
  if (isImage(url)) {
    event.respondWith(cacheFirst(req, CACHE_IMG));
    return;
  }
  
  // CSS/JS/JSON/Fonts → stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
    return;
  }
  
  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
});

// ─── MENSAGENS (forçar update) ─────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
