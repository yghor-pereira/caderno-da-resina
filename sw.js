/* Caderno da Resina: guarda a casca do app para abrir sem internet.
   Arquivos do app: rede primeiro (pega a versão nova quando há sinal), cache como reserva.
   Biblioteca e fontes: cache primeiro. Supabase e consultas de CNPJ passam direto. */
const CACHE = 'caderno-v2';
const CASCA = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icone.svg',
  ...['app','config','estado','exemplo','graficos','ie','local','mapa','nfe','nuvem','regras','telas','util'].map(m => `js/${m}.js`)];
const EXTERNOS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'];
const CACHE_PRIMEIRO = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CASCA);
    await Promise.all(EXTERNOS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(redePrimeiro(req));
  else if (CACHE_PRIMEIRO.includes(url.hostname)) e.respondWith(cachePrimeiro(req));
});
async function redePrimeiro(req){
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    return (await c.match(req, {ignoreSearch:true})) || (req.mode === 'navigate' && await c.match('index.html')) || Response.error();
  }
}
async function cachePrimeiro(req){
  const c = await caches.open(CACHE);
  const salvo = await c.match(req);
  if (salvo) return salvo;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
