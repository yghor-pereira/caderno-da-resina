/* ---------- cache local por usuário, com fila de envio ----------
   Tudo o que o produtor grava vai primeiro para cá (funciona sem sinal) e entra na fila.
   nuvem.js esvazia a fila quando há conexão e traz o que mudou em outros aparelhos. */
const PREFIXO = 'caderno-resina-v2:';
const armPadrao = () => globalThis.localStorage;

function abrir(userId, arm=armPadrao()){
  let d = null;
  try { d = JSON.parse(arm.getItem(PREFIXO+userId)); } catch(e) {}
  d ||= {linhas:{}, fila:[], cursor:{}};
  return {userId, arm, linhas:d.linhas, fila:d.fila, cursor:d.cursor, meta:d.meta||{}};
}
function persistir(L){
  try { L.arm.setItem(PREFIXO+L.userId, JSON.stringify({linhas:L.linhas, fila:L.fila, cursor:L.cursor, meta:L.meta})); } catch(e) {}
}
const naFila = (L, tabela, id) => L.fila.some(([t,i])=>t===tabela && i===id);

/* grava (mesclando com o que já existe) e enfileira para envio; regravar limpa um erro antigo */
function guardar(L, tabela, linha){
  const tab = L.linhas[tabela] ??= {};
  const nova = {...tab[linha.id], ...linha};
  delete nova._erro;
  tab[linha.id] = nova;
  if (!naFila(L, tabela, linha.id)) L.fila.push([tabela, linha.id]);
  return nova;
}
function gravar(L, tabela, linha){ const n = guardar(L, tabela, linha); persistir(L); return n; }
/* muitas linhas de uma vez (ex.: dados de exemplo), salvando o cache uma vez só */
function gravarLote(L, itens){ for (const [t,l] of itens) guardar(L, t, l); persistir(L); }
/* exclusão lógica: o registro continua existindo com deleted_at, para a exclusão chegar aos outros aparelhos */
function excluir(L, tabela, id){ excluirLote(L, [[tabela, id]]); }
function excluirLote(L, itens){
  const agora = new Date().toISOString();
  gravarLote(L, itens.filter(([t,id])=>L.linhas[t]?.[id]).map(([t,id])=>[t, {id, deleted_at:agora}]));
}
function definirMeta(L, meta){ Object.assign(L.meta, meta); persistir(L); }
/* a versão do servidor traz só updated_at e user_id a mais quando nada mudou de fato */
const igual = (local, remota) => !!local && Object.entries(remota).every(([k,v]) =>
  k==='updated_at' || k==='user_id' || JSON.stringify(v ?? null)===JSON.stringify(local[k] ?? null));
/* cursor da busca: última linha recebida na ordem (updated_at, id).
   Caches antigos guardavam só o texto de updated_at: vira {t, id:null}. */
function cursorDe(L, tabela){
  const c = L.cursor[tabela];
  return typeof c==='string' ? {t:c, id:null} : c || null;
}
/* linhas que chegaram do servidor; o que ainda está na fila é mais novo e fica.
   Devolve quantas mudaram de verdade (as próprias gravações voltando não contam). */
function mesclar(L, tabela, remotas){
  const tab = L.linhas[tabela] ??= {};
  let n = 0;
  for (const r of remotas) {
    if (!naFila(L, tabela, r.id)) { if (!igual(tab[r.id], r)) n++; tab[r.id] = r; }
    const c = cursorDe(L, tabela);
    if (!c || r.updated_at > c.t || (r.updated_at===c.t && (c.id==null || r.id > c.id))) L.cursor[tabela] = {t:r.updated_at, id:r.id};
  }
  persistir(L);
  return n;
}
/* apagados já enviados não precisam ficar no aparelho (a busca só traz o que mudou depois do cursor) */
function compactar(L){
  for (const [tabela, tab] of Object.entries(L.linhas))
    for (const [id, l] of Object.entries(tab)) if (l.deleted_at && !naFila(L, tabela, id)) delete tab[id];
  persistir(L);
}
const pendentes = L => L.fila.length;
function tirarDaFila(L, tabela, ids){
  const s = new Set(ids);
  L.fila = L.fila.filter(([t,i])=>!(t===tabela && s.has(i)));
  persistir(L);
}
function marcarErro(L, tabela, id, msg){
  const l = L.linhas[tabela]?.[id];
  if (l) l._erro = msg;
  tirarDaFila(L, tabela, [id]);
}
const ativas = (L, tabela) => Object.values(L.linhas[tabela]||{}).filter(l=>!l.deleted_at);
const erros = L => Object.entries(L.linhas).flatMap(([tabela,tab])=>Object.values(tab).filter(l=>l._erro).map(linha=>({tabela, linha})));

const ultimoUsuario = (arm=armPadrao()) => { try { return arm.getItem(PREFIXO+'ultimo'); } catch(e) { return null; } };
const definirUltimo = (userId, arm=armPadrao()) => { try { userId ? arm.setItem(PREFIXO+'ultimo', userId) : arm.removeItem(PREFIXO+'ultimo'); } catch(e) {} };

export { abrir, gravar, gravarLote, excluir, excluirLote, definirMeta, compactar, cursorDe, mesclar, pendentes, tirarDaFila, marcarErro, ativas, erros, ultimoUsuario, definirUltimo };
