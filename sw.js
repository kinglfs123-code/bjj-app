// Service Worker AUTO-DESTRUIÇÃO
// Quando este script é carregado, ele se autodestrói e limpa todo cache
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // 1. Apagar todos os caches
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      
      // 2. Desregistrar este service worker
      await self.registration.unregister();
      
      // 3. Forçar reload de todas as abas abertas
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});

// Não interceptar nenhum fetch — passa direto pra rede
self.addEventListener('fetch', (e) => {
  // Não faz nada, deixa o browser lidar normalmente
});
