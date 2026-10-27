/* Caderno da Resina: guarda a casca do app para abrir sem internet.
   Arquivos do app: rede primeiro (pega a versão nova quando há sinal), cache como reserva.
   Biblioteca e fontes: cache primeiro. Supabase e consultas de CNPJ passam direto. */
const CACHE = 'caderno-v2';
const CASCA = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icone.svg',
  ...['app','config','estado','exemplo','graficos','ie','local','mapa','nfe','nuvem','regras','telas','util'].map(m => `js/${m}.js`)];
const BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const CACHE_PRIMEIRO = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CASCA);
    /* sem a biblioteca o app não sincroniza ao abrir sem sinal: se falhar, a instalação falha
       e o navegador tenta de novo na próxima visita (o service worker anterior continua valendo) */
    await guardarBiblioteca(c);
    await self.skipWaiting();
  })());
});
/* a biblioteca vem em vários módulos (supabase-js importa auth-js, postgrest-js…); guarda todos
   já na instalação, porque na primeira visita a página importa antes de o service worker assumir */
async function guardarBiblioteca(c){
  const vistos = new Set(), fila = [BIBLIOTECA];
  while (fila.length) {
    const u = fila.shift();
    if (vistos.has(u)) continue;
    vistos.add(u);
    const r = await fetch(u, {cache:'no-cache'});
    if (!r.ok) throw new Error(`biblioteca não baixou: ${u} (${r.status})`);
    const texto = await r.clone().text();
    await c.put(u, r);
    for (const [, dep] of texto.matchAll(/["'](\/npm\/[^"']+)["']/g)) fila.push(new URL(dep, u).href);
  }
}
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
  const c = await caches.open(CACHE), chave = semRecarga(req.url);
  const salvo = await c.match(chave);
  if (salvo) return salvo;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(chave, r.clone());
  return r;
}
/* conectar() repete o import da biblioteca com ?r=…: é o mesmo arquivo, guardado sem o sufixo */
function semRecarga(u){
  const x = new URL(u);
  if (!x.searchParams.has('r')) return u;
  x.searchParams.delete('r');
  return x.href;
}
