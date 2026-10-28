// Verifica a gravação das métricas de uso no servidor com uma conta comum (COMUM) e a de exemplo.
//   SUPABASE_URL=... SUPABASE_ANON=... COMUM_EMAIL=... COMUM_SENHA=... node supabase/teste-metricas.mjs
// Grava eventos com o marcador props.teste = true; apague depois com:
//   delete from public.eventos where props->>'teste' = 'true'; delete from public.sessoes where dispositivo = 'teste';
const E = process.env, URL = E.SUPABASE_URL, ANON = E.SUPABASE_ANON;
const h = tok => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhas++; };
async function entrar(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: h(ANON), body: JSON.stringify({ email, password }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`login de ${email} falhou: ${j.msg}`); return j;
}
const rpc = (tok, corpo) => fetch(`${URL}/rest/v1/rpc/registrar_uso`, { method: 'POST', headers: h(tok), body: JSON.stringify(corpo) });
const agora = Date.now(), iso = t => new Date(t).toISOString();

const com = await entrar(E.COMUM_EMAIL, E.COMUM_SENHA);
const sessao = { id: crypto.randomUUID(), inicio: iso(agora - 60e3), ultimo_sinal: iso(agora), segundos_ativos: 99999, dispositivo: 'teste' };
const ev = (evento, extra = {}) => ({ id: crypto.randomUUID(), sessao_id: sessao.id, evento, tela: 'inicio', props: { teste: true }, criado_em: iso(agora), ...extra });
const lote = { p_eventos: [ev('page_view'), ev('feature_used'), ev('Evento Inválido!'), ev('login', { criado_em: iso(agora + 86400e3) })], p_sessoes: [sessao] };

const r1 = await rpc(com.access_token, lote);
ok(r1.status === 200 && (await r1.json()) === 3, `usuário comum envia um lote; o evento fora do formato é descartado (HTTP ${r1.status})`);
const r2 = await rpc(com.access_token, lote);
ok(r2.status === 200 && (await r2.json()) === 0, 'reenviar o mesmo lote não duplica');
for (const t of ['eventos', 'sessoes']) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: h(com.access_token) });
  ok(r.status === 401 || r.status === 403, `usuário comum não lê ${t} (HTTP ${r.status})`);
  const w = await fetch(`${URL}/rest/v1/${t}`, { method: 'POST', headers: h(com.access_token), body: JSON.stringify({ id: crypto.randomUUID() }) });
  ok(w.status === 401 || w.status === 403, `usuário comum não grava direto em ${t} (HTTP ${w.status})`);
}
const ra = await rpc(ANON, lote);
ok(ra.status >= 400, `visitante sem login não envia métricas (HTTP ${ra.status})`);
const grande = await rpc(com.access_token, { p_eventos: Array.from({ length: 501 }, () => ev('page_view')), p_sessoes: [] });
ok(grande.status >= 400, `lote com mais de 500 eventos é recusado (HTTP ${grande.status})`);
if (E.DEMO_EMAIL) {
  const demo = await entrar(E.DEMO_EMAIL, E.DEMO_SENHA);
  const rd = await rpc(demo.access_token, { p_eventos: [ev('page_view', { sessao_id: null })], p_sessoes: [] });
  ok(rd.status === 200, 'conta de exemplo envia (o servidor marca is_demo)');
}
console.log(`INFO  sessão de teste ${sessao.id}: confira no SQL que segundos_ativos ficou em até 120 e is_demo = false`);
process.exit(falhas ? 1 : 0);
