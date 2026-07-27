const CACHE_NAME = 'rota360-pwa-v29';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalação: Precacheia os arquivos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch((err) => console.log('SW cache skip:', url, err)))
      );
    })
  );
  self.skipWaiting();
});

// Ativação: Remove caches antigos, reivindica clientes e força recarregamento das abas ativas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('SW: Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
    .then(() => self.clients.claim())
    .then(() => {
      // Envia uma mensagem para todas as janelas abertas para recarregarem a página imediatamente
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          try {
            client.postMessage({ type: 'FORCE_RELOAD', version: CACHE_NAME });
          } catch (err) {
            console.error('Falha ao enviar postMessage para o cliente:', err);
          }
        });
      });
    })
  );
});

// Interceptação de requisições com estratégia híbrida
self.addEventListener('fetch', (event) => {
  // Ignorar requisições que não sejam GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Estratégia Network-First para Páginas (HTML), Manifest e API routes
  // Isso garante que mudanças no código (como remoção de botões) apareçam instantaneamente se o usuário estiver online
  if (
    event.request.mode === 'navigate' || 
    url.pathname === '/' || 
    url.pathname === '/index.html' || 
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Se obtivermos uma resposta válida, atualizamos o cache
          if (response && response.status === 200 && response.type === 'basic') {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return response;
        })
        .catch(() => {
          // Se falhar (offline), tenta buscar do cache
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Se nem no cache estiver, serve o index.html como fallback para navegação
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html') || caches.match('/');
            }
          });
        })
    );
    return;
  }

  // 2. Estratégia Stale-While-Revalidate para outros arquivos (JS, CSS, Imagens)
  // Serve do cache imediatamente para máxima velocidade, mas busca atualização em segundo plano
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Ignora erros de rede na atualização em segundo plano
      });

      return cached || fetchPromise;
    })
  );
});
