// Verifica o acesso de administrador e o bloqueio de contas. Precisa de três contas de teste:
// ADMIN (cadastrada em public.admins), COMUM e ALVO (contas comuns; ALVO é bloqueada e desbloqueada).
// Sem ADMIN_EMAIL, roda só as verificações de usuário comum e visitante.
//   SUPABASE_URL=... SUPABASE_ANON=... ADMIN_EMAIL=... ADMIN_SENHA=... COMUM_EMAIL=... COMUM_SENHA=... \
//   ALVO_EMAIL=... ALVO_SENHA=... node supabase/teste-admin.mjs
const E = process.env, URL = E.SUPABASE_URL, ANON = E.SUPABASE_ANON;
const h = tok => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhas++; };
async function token(corpo) {
  const tipo = corpo.refresh_token ? 'refresh_token' : 'password';
  const r = await fetch(`${URL}/auth/v1/token?grant_type=${tipo}`, { method: 'POST', headers: h(ANON), body: JSON.stringify(corpo) });
  return { status: r.status, ...(await r.json()) };
}
const entrar = async (email, password) => { const j = await token({ email, password }); if (!j.access_token) throw new Error(`login de ${email} falhou: ${j.msg}`); return j; };
const rest = (tok, path, init = {}) => fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...h(tok), ...(init.headers || {}) } });
const acao = (tok, corpo) => fetch(`${URL}/functions/v1/admin-acoes`, { method: 'POST', headers: h(tok), body: JSON.stringify(corpo) });

const adm = E.ADMIN_EMAIL ? await entrar(E.ADMIN_EMAIL, E.ADMIN_SENHA) : null, com = await entrar(E.COMUM_EMAIL, E.COMUM_SENHA);
const alvo = await entrar(E.ALVO_EMAIL, E.ALVO_SENHA);

// usuário comum
ok(await (await rest(com.access_token, 'rpc/eh_admin', { method: 'POST', body: '{}' })).json() === false, 'eh_admin() é falso para o usuário comum');
for (const t of ['admins', 'auditoria']) {
  const r = await rest(com.access_token, `${t}?select=*`);
  ok(r.status === 401 || r.status === 403, `usuário comum não lê ${t} (HTTP ${r.status})`);
}
await rest(com.access_token, `perfis?id=eq.${com.user.id}`, { method: 'PATCH', body: JSON.stringify({ bloqueado: true, is_demo: true, trocar_senha: true }) });
const [p] = await (await rest(com.access_token, `perfis?id=eq.${com.user.id}&select=bloqueado,is_demo,trocar_senha`)).json();
ok(p && !p.bloqueado && !p.is_demo && !p.trocar_senha, 'usuário comum não altera bloqueado, is_demo nem trocar_senha do próprio perfil');
const rc = await acao(com.access_token, { acao: 'bloquear', alvo: alvo.user.id, motivo: 'teste' });
ok(rc.status === 403, `usuário comum não chama admin-acoes (HTTP ${rc.status})`);
const rs = await rest(com.access_token, 'rpc/encerrar_sessoes', { method: 'POST', body: JSON.stringify({ p_user: alvo.user.id }) });
ok(rs.status >= 400, `usuário comum não encerra sessões de outra conta (HTTP ${rs.status})`);
for (const [f, corpo] of [['admin_usuarios', {}], ['admin_usuario', { p_id: alvo.user.id }]]) {
  const r = await rest(com.access_token, `rpc/${f}`, { method: 'POST', body: JSON.stringify(corpo) });
  ok(r.status === 403, `usuário comum não chama ${f} (HTTP ${r.status})`);
}
const st = await rest(com.access_token, 'rpc/senha_trocada', { method: 'POST', body: '{}' });
ok(st.status < 300, `senha_trocada só mexe na própria conta e não falha sem marca (HTTP ${st.status})`);
const ra = await acao(ANON, { acao: 'bloquear', alvo: alvo.user.id, motivo: 'teste' });
ok(ra.status === 401, `visitante sem login não chama admin-acoes (HTTP ${ra.status})`);

// admin
if (!adm) { console.log('INFO  sem ADMIN_EMAIL: verificações de admin puladas'); process.exit(falhas ? 1 : 0); }
ok(await (await rest(adm.access_token, 'rpc/eh_admin', { method: 'POST', body: '{}' })).json() === true, 'eh_admin() é verdadeiro para o admin');
ok((await acao(adm.access_token, { acao: 'bloquear', alvo: alvo.user.id, motivo: '' })).status === 400, 'bloquear sem motivo é recusado');
ok((await acao(adm.access_token, { acao: 'bloquear', alvo: adm.user.id, motivo: 'teste' })).status === 400, 'admin não bloqueia a própria conta');
const rb = await acao(adm.access_token, { acao: 'bloquear', alvo: alvo.user.id, motivo: 'teste automatizado' });
const jb = await rb.json();
ok(rb.status === 200, `admin bloqueia a conta (HTTP ${rb.status}, ${jb.sessoes_encerradas} sessões encerradas)`);
const l1 = await token({ email: E.ALVO_EMAIL, password: E.ALVO_SENHA });
ok(!l1.access_token && /banned/i.test(`${l1.error_code} ${l1.msg}`), `conta bloqueada não entra (${l1.error_code}: ${l1.msg})`);
const l2 = await token({ refresh_token: alvo.refresh_token });
ok(!l2.access_token, `conta bloqueada não renova o acesso (${l2.error_code}: ${l2.msg})`);
const r3 = await rest(alvo.access_token, 'perfis?select=id');
console.log(`INFO  token de acesso já emitido, antes de expirar: HTTP ${r3.status}`);
const rd = await acao(adm.access_token, { acao: 'desbloquear', alvo: alvo.user.id, motivo: 'fim do teste' });
ok(rd.status === 200, `admin desbloqueia (HTTP ${rd.status})`);
ok(!!(await token({ email: E.ALVO_EMAIL, password: E.ALVO_SENHA })).access_token, 'conta desbloqueada volta a entrar');

// lista e detalhe
const lista = await (await rest(adm.access_token, 'rpc/admin_usuarios', { method: 'POST', body: '{}' })).json();
const linha = Array.isArray(lista) && lista.find(u => u.id === alvo.user.id);
ok(!!linha && 'sessoes' in linha && 'segundos' in linha && linha.email === E.ALVO_EMAIL, `admin lista os usuários (${Array.isArray(lista) ? lista.length : 0})`);
const det = await (await rest(adm.access_token, 'rpc/admin_usuario', { method: 'POST', body: JSON.stringify({ p_id: alvo.user.id }) })).json();
ok(det?.usuario?.id === alvo.user.id && det.dados && Array.isArray(det.acessos) && det.auditoria?.some(a => a.acao === 'bloquear'),
  'detalhe traz usuário, quantidades, acessos e a auditoria (com o bloqueio)');
ok(!JSON.stringify(det.dados).match(/valor|descr|nome/), 'detalhe mostra só quantidades, sem valores nem descrições');

// senha temporária
const rt = await acao(adm.access_token, { acao: 'senha_temporaria', alvo: alvo.user.id, motivo: 'esqueceu a senha' });
const jt = await rt.json();
ok(rt.status === 200 && /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(jt.senha || ''), 'admin gera senha temporária e recebe a senha uma vez');
ok(!(await token({ email: E.ALVO_EMAIL, password: E.ALVO_SENHA })).access_token, 'a senha antiga deixa de valer');
const tmp = await token({ email: E.ALVO_EMAIL, password: jt.senha });
ok(!!tmp.access_token, 'a senha temporária entra');
const [pt] = await (await rest(tmp.access_token, `perfis?id=eq.${alvo.user.id}&select=trocar_senha`)).json();
ok(pt?.trocar_senha === true, 'o perfil fica marcado para trocar a senha');
const nova = await fetch(`${URL}/auth/v1/user`, { method: 'PUT', headers: h(tmp.access_token), body: JSON.stringify({ password: E.ALVO_SENHA }) });
await rest(tmp.access_token, 'rpc/senha_trocada', { method: 'POST', body: '{}' });
const [pt2] = await (await rest(tmp.access_token, `perfis?id=eq.${alvo.user.id}&select=trocar_senha`)).json();
ok(nova.status === 200 && pt2?.trocar_senha === false, 'depois de trocar a senha, a marca sai do perfil');
const det2 = await (await rest(adm.access_token, 'rpc/admin_usuario', { method: 'POST', body: JSON.stringify({ p_id: alvo.user.id }) })).json();
ok(!JSON.stringify(det2.auditoria).includes(jt.senha), 'a senha temporária não aparece na auditoria');
process.exit(falhas ? 1 : 0);
