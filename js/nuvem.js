/* ---------- Supabase: login e sincronização do cache local ---------- */
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';
import { mesclar, tirarDaFila, marcarErro, erros, compactar } from './local.js';

/* pais antes dos filhos, por causa das chaves estrangeiras */
const ORDEM = ['perfis','fazendas','talhoes','ramais','contagens','estrias','coletas','vendas','recebimentos','lancamentos','compromissos','compradores'];
const PAGINA = 1000;

/* erro de banco tem código SQL (5 caracteres) ou PGRST; sem código é rede */
const ehDeDado = e => /^[0-9A-Z]{5}$/.test(e?.code||'') || (/^PGRST/.test(e?.code||'') && e.code!=='PGRST301');
const ehSessao = e => e?.code==='PGRST301' || e?.status===401 || /jwt/i.test(e?.message||'');
function mensagem(tabela, e){
  if (e.code==='23505' && tabela==='fazendas') return 'Esta Inscrição Estadual já está cadastrada em outra conta.';
  return 'Não foi possível salvar: '+(e.message||e.code);
}

function criarNuvem(cliente, L){
  const preparar = (tabela, l) => {
    const {updated_at, _erro, ...r} = l;
    return tabela==='perfis' ? r : {...r, user_id:L.userId};
  };
  async function upsert(tabela, rows){
    try { return (await cliente.from(tabela).upsert(rows)).error || null; }
    catch(e) { return {message:String(e?.message||e)}; }
  }
  /* envia a fila; para no primeiro sinal de falta de rede ou de sessão vencida */
  async function enviar(){
    for (const tabela of ORDEM) {
      const ids = L.fila.filter(([t])=>t===tabela).map(([,id])=>id);
      if (!ids.length) continue;
      const rows = ids.map(id=>preparar(tabela, L.linhas[tabela][id]));
      const e = await upsert(tabela, rows);
      if (!e) { tirarDaFila(L, tabela, ids); continue; }
      if (ehSessao(e)) return {offline:false, sessao:false, erros:erros(L).length};
      if (!ehDeDado(e)) return {offline:true, erros:erros(L).length};
      /* um registro com problema derruba o lote: reenvia um a um para achar o culpado */
      for (const row of rows) {
        const e1 = await upsert(tabela, [row]);
        if (!e1) tirarDaFila(L, tabela, [row.id]);
        else if (e1.code==='23503') continue;   // o registro pai ainda não está no banco (ex.: fazenda com erro): espera na fila
        else if (ehDeDado(e1)) marcarErro(L, tabela, row.id, mensagem(tabela, e1));
        else return {offline:!ehSessao(e1), sessao:!ehSessao(e1), erros:erros(L).length};
      }
    }
    return {offline:false, erros:erros(L).length};
  }
  /* traz tudo o que mudou desde a última busca, tabela por tabela */
  async function buscar(){
    let mudou = 0;
    for (const tabela of ORDEM) {
      const todas = [];
      for (let de=0; ; de+=PAGINA) {
        let q = cliente.from(tabela).select('*');
        if (L.cursor[tabela]) q = q.gt('updated_at', L.cursor[tabela]);
        let res;
        try { res = await q.order('updated_at').range(de, de+PAGINA-1); }
        catch(e) { return {offline:true}; }
        if (res.error) return ehSessao(res.error) ? {offline:false, sessao:false} : {offline:!ehDeDado(res.error)};
        todas.push(...res.data);
        if (res.data.length < PAGINA) break;
      }
      if (todas.length) mudou += mesclar(L, tabela, todas);
    }
    return {offline:false, mudou};
  }
  let rodando = null;
  /* envia e depois busca; chamadas simultâneas reaproveitam a mesma execução */
  function sincronizar(){
    return rodando ??= (async () => {
      try {
        const r = await enviar();
        if (r.offline || r.sessao===false) return {ok:false, ...r};
        const b = await buscar();
        if (!b.offline && b.sessao!==false) compactar(L);
        return {ok:!b.offline && b.sessao!==false, offline:!!b.offline, sessao:b.sessao, mudou:b.mudou||0, erros:erros(L).length};
      } finally { rodando = null; }
    })();
  }
  return {enviar, buscar, sincronizar};
}

/* ---------- cliente real e login ---------- */
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let cliente = null;
async function conectar(){
  if (cliente) return cliente;
  const { createClient } = await import(CDN);
  cliente = createClient(SUPABASE_URL, SUPABASE_ANON, {auth:{persistSession:true, autoRefreshToken:true, storageKey:'caderno-resina-auth'}});
  return cliente;
}
function erroAuth(e){
  const m = (e?.message||'')+' '+(e?.code||'');
  if (/invalid.*credentials|invalid_credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already.*registered|user_already_exists|already exists/i.test(m)) return 'Já existe uma conta com este e-mail. Use Entrar.';
  if (/password/i.test(m) && /6|short|weak/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/fetch|network|load failed/i.test(m) || !navigator.onLine) return 'Sem internet: o primeiro acesso precisa de conexão.';
  return 'Não foi possível entrar agora ('+(e?.message||'erro')+').';
}
async function entrar(email, senha){
  try {
    const c = await conectar();
    const { data, error } = await c.auth.signInWithPassword({email, password:senha});
    if (error) throw error;
    return data.user;
  } catch(e) { throw new Error(erroAuth(e)); }
}
async function cadastrar(nome, email, senha, modulos){
  try {
    const c = await conectar();
    const { data, error } = await c.auth.signUp({email, password:senha, options:{data:{nome, modulos}}});
    if (error) throw error;
    if (!data.session) throw new Error('Conta criada, mas sem sessão. Tente entrar.');
    return data.user;
  } catch(e) { throw new Error(e.message?.startsWith('Conta criada') ? e.message : erroAuth(e)); }
}
async function sair(){ try { await (await conectar()).auth.signOut({scope:'local'}); } catch(e) {} }
/* sessão salva neste aparelho (funciona sem rede: não valida no servidor) */
async function sessao(){
  try { return (await (await conectar()).auth.getSession()).data.session; } catch(e) { return null; }
}
async function ieDisponivel(ie, ignorar){
  try {
    const { data, error } = await (await conectar()).rpc('ie_disponivel', {p_ie:ie, p_ignorar:ignorar||null});
    return error ? null : data;
  } catch(e) { return null; }   // sem rede: não dá para saber agora
}

export { ORDEM, criarNuvem, conectar, entrar, cadastrar, sair, sessao, ieDisponivel };
