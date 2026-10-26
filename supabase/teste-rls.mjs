// Verifica o isolamento entre contas (RLS). Uso:
//   SUPABASE_URL=... SUPABASE_ANON=... A_EMAIL=... A_SENHA=... B_EMAIL=... B_SENHA=... node supabase/teste-rls.mjs
const { SUPABASE_URL: URL, SUPABASE_ANON: ANON, A_EMAIL, A_SENHA, B_EMAIL, B_SENHA } = process.env;
const h = tok => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });
async function entrar(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: h(ANON), body: JSON.stringify({ email, password }) });
  const j = await r.json(); if (!j.access_token) throw new Error('login falhou: ' + JSON.stringify(j)); return j;
}
const rest = (tok, path, init = {}) => fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...h(tok), Prefer: 'return=representation', ...(init.headers || {}) } });
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhas++; };

const A = await entrar(A_EMAIL, A_SENHA), B = await entrar(B_EMAIL, B_SENHA);
const id = crypto.randomUUID(), ie = String(Date.now()).slice(-10);
const criada = await rest(A.access_token, 'fazendas', { method: 'POST', body: JSON.stringify({ id, nome: 'Fazenda do A', ie, uf: 'PR' }) });
ok(criada.status === 201, `A cria a própria fazenda (HTTP ${criada.status})`);
const vistaA = await (await rest(A.access_token, `fazendas?id=eq.${id}`)).json();
ok(vistaA.length === 1, 'A lê a própria fazenda');
const vistaB = await (await rest(B.access_token, `fazendas?id=eq.${id}`)).json();
ok(Array.isArray(vistaB) && vistaB.length === 0, 'B não lê a fazenda de A');
const upd = await (await rest(B.access_token, `fazendas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ nome: 'invadida' }) })).json();
ok(Array.isArray(upd) && upd.length === 0, 'B não altera a fazenda de A');
const roubo = await rest(B.access_token, 'fazendas', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), user_id: A.user.id, nome: 'em nome de A', ie: ie + '9', uf: 'PR' }) });
ok(roubo.status >= 400, `B não grava linha em nome de A (HTTP ${roubo.status})`);
const disp = await (await rest(B.access_token, 'rpc/ie_disponivel', { method: 'POST', body: JSON.stringify({ p_ie: ie }) })).json();
ok(disp === false, 'ie_disponivel diz a B que a IE de A está ocupada');
const dup = await rest(B.access_token, 'fazendas', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), nome: 'Duplicada', ie, uf: 'PR' }) });
const dupj = await dup.json();
ok(dup.status === 409 && dupj.code === '23505', `IE repetida em outra conta é recusada com 23505 (HTTP ${dup.status})`);
const del = await rest(A.access_token, `fazendas?id=eq.${id}`, { method: 'DELETE' });
const ainda = await (await rest(A.access_token, `fazendas?id=eq.${id}`)).json();
ok(ainda.length === 1, `exclusão física não é permitida ao cliente (HTTP ${del.status})`);
const anon = await (await fetch(`${URL}/rest/v1/fazendas?select=id`, { headers: h(ANON) })).json();
ok(Array.isArray(anon) ? anon.length === 0 : true, 'visitante sem login não lê fazendas');
const perfil = await (await rest(A.access_token, 'perfis')).json();
ok(perfil.length === 1 && perfil[0].nome === 'Teste A', 'perfil criado no cadastro com o nome dos metadados');
process.exit(falhas ? 1 : 0);
