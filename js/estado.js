import { uid, hoje, safraIni, diff } from './util.js';
import { usarDados, CORES_ENT } from './regras.js';
import { exemplo } from './exemplo.js';
import { apagarCache, abrir, gravar, gravarLote, excluirLote, definirMeta, pendentes, erros, definirUltimo, ativas } from './local.js';
import { linha, dadosParaLinhas, fazendasDe, entidadesDe, montarDados, linhasDaFazenda } from './mapa.js';
import { abrirMetricas, fecharMetricas, apagarMetricas, track, enviarMetricas } from './metricas.js';
import { SUSPENSA, criarNuvem, conectar, sessao, sair as sairNuvem } from './nuvem.js';

/* ---------- funções do app (cada usuário liga e desliga em Conta) ---------- */
const MODS = [
  {k:'caixa', n:'Financeiro e fluxo previsto', d:'Contas a pagar e a receber, saldos das contas bancárias e projeção de saldo'},
  {k:'floresta', n:'Floresta e operações', d:'Talhões, ramais, contagem de árvores, apontamento de estria e coleta, perdas'},
  {k:'producao', n:'Produção e produtividade', d:'kg por mês, kg/árvore, g/estria e comparação entre safras', req:'floresta'},
  {k:'vendas', n:'Vendas e recebimentos', d:'Preço livre de Funrural, compradores e valores a receber'},
  {k:'nfe', n:'Emissão de NF-e', d:'Nota fiscal da venda (simulada no protótipo)', req:'vendas'},
  {k:'resultado', n:'Custo e margem', d:'Custo por kg e por árvore, margem e lucro'}
];
const MOD_PADRAO = Object.fromEntries(MODS.map(m=>[m.k,true]));
/* abas do rodapé → função que precisa estar ligada (Fazendas aparece com Floresta ou Produção) */
const NAV_MOD = {caixa:'caixa', vendas:'vendas', resultado:'resultado'};
/* telas da aba Fazendas: usam os dados da fazenda aberta (E.fazSel) */
const TELAS_FAZ = ['floresta','producao','perdas','fazenda'];
const vazio = () => ({demo:false, regime:'funrural', saldoInicial:0, ideal:14, entidade:null, fazenda:null, fazendas:[], talhoes:[], estrias:[], producao:[], perdas:[],
  vendas:[], caixa:[], comp:[], todas:{vendas:[], caixa:[], comp:[]}, compradores:{}});

usarDados(vazio());

/* ---------- estado da tela ---------- */
const CUR = safraIni(hoje());
const E = {atual:'login', safraSel:CUR, tipoLanc:'d', modoCaixa:'real', talSel:null, flMode:'ramais', ramSel:null, opTipo:'estria', apTal:null, apSel:null,
  lMode:'entrar', lAviso:'', lErro:'', senhaTrocada:null, admin:false, fazSel:null, fazEdit:null, entEdit:null, limparPend:null, aberta:null, confirmar:null, editar:null, sairPend:false,
  sel:null,   // seleção para mover em lote: {tab, ids:Set}
  render:()=>{}, mostrarSync:()=>{}};

/* ---------- sessão: usuário logado e o cache local dele ----------
   O financeiro é global; os filtros do topo (CPF/CNPJ e fazenda) ficam no cache do usuário (meta.entidade, meta.fazenda).
   A aba Fazendas abre uma fazenda de cada vez (E.fazSel). */
const SES = {L:null, sync:'ok', nuvem:null};
let versao = 0, memo = {v:-1, u:null}, memoFaz = {v:-1, d:{}};
function usuario(){
  if (!SES.L) return null;
  if (memo.v===versao) return memo.u;
  const p = SES.L.linhas.perfis?.[SES.L.userId], entidades = entidadesDe(SES.L), fazendas = fazendasDe(SES.L);
  const entidadeSel = entidades.some(e=>e.id===SES.L.meta.entidade) ? SES.L.meta.entidade : null;
  const fazendaSel = fazendas.some(f=>f.id===SES.L.meta.fazenda) ? SES.L.meta.fazenda : null;
  memo = {v:versao, u:{id:SES.L.userId, email:SES.L.meta.email||'', nome:p?.nome || SES.L.meta.nome || '',
    modulos:p?.modulos || MOD_PADRAO, entidades, fazendas, entidadeSel, fazendaSel,
    global: montarDados(SES.L, {entidade:entidadeSel, fazenda:fazendaSel}),
    trocarSenha:!!p?.trocar_senha && E.senhaTrocada!==SES.L.userId}};
  return memo.u;
}
/* dados de uma fazenda (aba Fazendas): operação e o financeiro ligado a ela */
function dadosFazenda(fid){
  if (!SES.L || !fid) return null;
  if (memoFaz.v!==versao) memoFaz = {v:versao, d:{}};
  return memoFaz.d[fid] ??= montarDados(SES.L, {fazenda:fid});
}
const fazAtual = () => usuario()?.fazendas.find(f=>f.id===E.fazSel) || null;
const mod = k => !!usuario()?.modulos?.[k];
/* S de cada tela: as da aba Fazendas usam a fazenda aberta; as outras, o global com os filtros do topo */
const dadosTela = () => (TELAS_FAZ.includes(E.atual) && fazAtual() ? dadosFazenda(E.fazSel) : usuario()?.global) || vazio();
/* remonta S a partir do cache depois de qualquer mudança */
function recarregar(){ versao++; usarDados(dadosTela()); }
/* filtros do topo: CPF/CNPJ e fazenda (null = todos), guardados por usuário neste aparelho */
function definirFiltro(campo, id){
  if (!SES.L) return;
  definirMeta(SES.L, {[campo]:id||null});
  track('feature_used', {funcao: campo==='entidade' ? 'entidade_filtrada' : 'fazenda_filtrada', todos:!id});
  recarregar(); E.render();
}
const definirEntidade = id => definirFiltro('entidade', id);
const nomeEnt = e => e ? (e.apelido || e.nome) : 'Sem CPF/CNPJ';
const entPadrao = () => { const es = usuario()?.entidades||[]; return es.find(e=>e.padrao) || es[0] || null; };
/* emitente sugerido: o CPF/CNPJ do filtro do topo; senão o padrão */
const emitentePadrao = () => { const u = usuario(); return u?.entidades.find(e=>e.id===u.entidadeSel && e.ativo) || entPadrao(); };
/* inscrição sugerida para a venda: a do emitente na UF da fazenda; senão a primeira ativa dele */
function inscricaoPara(ent, fazenda){
  const is = (ent?.inscricoes||[]).filter(i=>i.ativo);
  return is.find(i=>i.uf===fazenda?.uf) || is[0] || null;
}
/* conta sugerida: a primeira conta ativa do CPF/CNPJ */
const contaPara = ent => ent?.contas.find(c=>c.ativo) || null;

function abrirSessao(userId, meta={}){
  SES.L = abrir(userId); SES.nuvem = null; SES.sync = 'ok'; E.fazSel = null;
  definirUltimo(userId);
  if (meta.email) definirMeta(SES.L, meta);
  abrirMetricas(userId);
  recarregar();
}
async function fecharSessao(){
  clearTimeout(timer);
  SES.L = null; SES.nuvem = null; E.fazSel = null;   // primeiro: uma sincronização em andamento para de gravar
  fecharMetricas();
  definirUltimo(null);
  recarregar();
  await sairNuvem();
}
/* conta suspensa por um administrador: sai, apaga o cache deste aparelho e avisa na entrada */
async function suspender(userId){
  if (SES.L?.userId===userId) await fecharSessao(); else await sairNuvem();
  apagarCache(userId); apagarMetricas(userId); definirUltimo(null);
  E.lErro = SUSPENSA; E.lAviso = ''; E.lMode = 'entrar'; E.atual = 'login';
  E.render();
}
function abrirFazenda(fid){ E.fazSel = fid; E.sel = null; recarregar(); }

/* ---------- gravações: cache local + fila; a sincronização vem logo depois ---------- */
/* métrica de cada gravação: só o tipo e a tabela (e a quantidade, num lote), nunca o conteúdo */
function medir(itens, tipo){
  const n = {};
  for (const [t,l] of itens) {
    const ev = tipo || (!SES.L.linhas[t]?.[l.id] ? 'record_created' : l.deleted_at ? 'record_deleted' : 'record_updated');
    n[ev+' '+t] = (n[ev+' '+t]||0) + 1;
  }
  for (const [k, qtd] of Object.entries(n)) { const [ev, tabela] = k.split(' '); track(ev, qtd>1 ? {tabela, qtd} : {tabela}); }
}
function salvar(tabela, l){ medir([[tabela, l]]); gravar(SES.L, tabela, l); recarregar(); E.render(); agendar(); }
/* {metrica:false}: lotes que não são registros do produtor (dados de exemplo, limpeza) */
function salvarLote(itens, {metrica=true}={}){ if (metrica) medir(itens); gravarLote(SES.L, itens); recarregar(); E.render(); agendar(); }
function apagar(itens){ medir(itens.filter(([t,id])=>SES.L.linhas[t]?.[id]).map(([t,id])=>[t,{id}]), 'record_deleted'); excluirLote(SES.L, itens); recarregar(); E.render(); agendar(); }
/* apaga todos os registros da fazenda; o cadastro fica, sem saldo inicial e sem marca de exemplo */
function limparFazenda(fid){
  const agora = new Date().toISOString();
  track('feature_used', {funcao:'limpar_fazenda'});
  salvarLote([...linhasDaFazenda(SES.L, fid).map(([t,id])=>[t,{id, deleted_at:agora}]), ['fazendas',{id:fid, demo:false, saldo_inicial:0}]], {metrica:false});
}

/* ---------- sincronização ---------- */
let timer = null, ultErros = 0;
function agendar(ms=2000){ clearTimeout(timer); timer = setTimeout(sincronizar, ms); E.mostrarSync(); }
async function sincronizar(){
  if (!SES.L) return {ok:false};
  const L = SES.L;
  if (!navigator.onLine) { SES.sync='offline'; E.mostrarSync(); return {ok:false, offline:true}; }
  SES.sync = 'enviando'; E.mostrarSync();
  let r;
  try {
    const s = await sessao();
    if (s.estado==='bloqueado') { await suspender(L.userId); return {ok:false, bloqueado:true}; }
    if (s.estado==='offline') r = {ok:false, offline:true};
    else if (s.estado!=='ok' || s.session.user.id!==L.userId) r = {ok:false, sessao:false};
    else {
      SES.nuvem ??= criarNuvem(await conectar(), L, {ativo:()=>SES.L===L}); r = await SES.nuvem.sincronizar();
      if (!r.offline && r.sessao!==false && !r.parado) enviarMetricas(await conectar());   // não espera: métrica nunca atrasa os dados
    }
  } catch(e) { r = {ok:false, offline:true}; }
  if (SES.L!==L) return r;           // trocou de usuário no meio do caminho
  const nErros = erros(L).length;
  SES.sync = r.offline ? 'offline' : r.sessao===false ? 'sessao' : nErros ? 'erro' : 'ok';
  if (r.mudou || nErros!==ultErros) { recarregar(); E.render({seguro:true}); }
  ultErros = nErros;
  E.mostrarSync();
  return r;
}
const nPendentes = () => SES.L ? pendentes(SES.L) : 0;
const listaErros = () => SES.L ? erros(SES.L) : [];

/* ---------- cadastro completo: depois de uma sincronização bem-sucedida ----------
   O servidor cria o CPF padrão no cadastro e a migração cria a conta principal. Aqui o aparelho cobre o que ainda faltar. */
function completarCadastro(){
  const u = usuario(); if (!u) return;
  const itens = [];
  let padrao = entPadrao()?.id;
  if (!padrao) { padrao = uid(); itens.push(['entidades_fiscais', linha.entidade({id:padrao, tipo:'PF', nome:u.nome||'Meu CPF', cor:CORES_ENT[0], regime:'PF_ATIVIDADE_RURAL', padrao:true})]); }
  if (!u.entidades.some(e=>e.contas.length)) itens.push(['contas_bancarias', linha.conta({id:uid(), entidade:padrao, apelido:'Conta principal'})]);
  if (itens.length) salvarLote(itens, {metrica:false});
}

/* ---------- conta de exemplo ---------- */
const EX = {email:'produtor@exemplo.com', senha:'resina123'};
/* 2 fazendas, 1 CPF e 1 CNPJ (fictícios, com dígito válido), cada um com inscrições e uma conta.
   Capão Alto (SC) vende pelo CPF e, 1 em cada 3 vendas, pelo CNPJ; Boa Esperança (PR) vende só pelo CNPJ.
   O contador é uma despesa geral do CNPJ, sem fazenda. */
const EX_ENT = {
  cpf: {tipo:'PF', nome:'João da Silva', apelido:'CPF João', documento:'52998224725', cor:CORES_ENT[0], regime:'PF_ATIVIDADE_RURAL', previdencia:'funrural',
    inscricoes:[{ie:'254123987', uf:'SC', municipio:'Itaiópolis', descricao:'Produtor rural · Capão Alto'}],
    conta:{banco:'Sicredi', agencia:'0101', conta:'12345-6', apelido:'Conta da safra', saldoInicial:14000}},
  cnpj: {tipo:'PJ', nome:'Resinas Silva Ltda', apelido:'Resinas Silva', documento:'11222333000181', cor:CORES_ENT[1], regime:'SIMPLES', previdencia:'funrural',
    inscricoes:[{ie:'9012345678', uf:'PR', municipio:'Rio Negro', descricao:'Matriz'}, {ie:'254123988', uf:'SC', municipio:'Itaiópolis', descricao:'Filial SC'}],
    conta:{banco:'Banco do Brasil', agencia:'3030', conta:'98765-0', apelido:'Conta da empresa', saldoInicial:4000}}
};
const EX_FAZ = [
  {nome:'Fazenda Capão Alto', ie:'254123987', municipio:'Itaiópolis', uf:'SC', seed:11, area_ha:42.5, nirf_cib:'7.123.456-0', car:'SC-4208005-8F2A1C9D0B3E4A5F6071829304A5B6C7',
    padrao:'cpf', outra:'cnpj'},
  {nome:'Sítio Boa Esperança', ie:'9012345678', municipio:'Rio Negro', uf:'PR', seed:23, defs:[['Talhão 1',8,'Pedro'],['Talhão 2',7,'Luís']], area_ha:18,
    nirf_cib:'8.234.567-1', car:'PR-4122305-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D', padrao:'cnpj'}
];
const CONTADOR = 'Honorários do contador (exemplo)';
/* quem faturou cada registro: {padrao, outra} = {ent, ie, conta}; parte das vendas e despesas vai para a outra */
function distribuir(dados, {padrao=null, outra=null}={}){
  const q = (k, extra) => { const d = (k && outra) ? outra : padrao; return d ? {entidade:d.ent, conta:d.conta, ...extra(d)} : {}; };
  return {...dados,
    vendas: dados.vendas.map((v,i)=>{ const x = q(i%3===2, d=>({inscricao:d.ie})); delete x.conta;
      const conta = ((i%3===2 && outra) ? outra : padrao)?.conta || null;
      return {...v, ...x, recs:v.recs.map(r=>({...r, conta}))}; }),
    caixa: dados.caixa.map((x,i)=>({...x, ...q(i%4===3, ()=>({}))})),
    comp: dados.comp.map(x=>({...x, ...(padrao?{entidade:padrao.ent}:{})}))};
}
/* linhas de uma fazenda com dados de exemplo, datados a partir de hoje */
function linhasExemplo(f, dados, dist){
  if (dist) dados = distribuir(dados, dist);
  return [['fazendas', linha.fazenda({...f, demo_gerado_em:hoje()}, dados)],
    ...Object.entries(dadosParaLinhas(dados, f.id)).flatMap(([t,ls])=>ls.map(l=>[t,l]))];
}
/* emitente de exemplo: o CPF/CNPJ, a inscrição dele na UF da fazenda e a conta */
const emitEx = (ent, uf) => ent ? {ent:ent.id, ie:inscricaoPara(ent, {uf})?.id || null, conta:contaPara(ent)?.id || null} : null;
const idsExemplo = u => { const ach = d => u.entidades.find(e=>e.documento===d);
  const cpf = ach(EX_ENT.cpf.documento), cnpj = ach(EX_ENT.cnpj.documento); return cpf && cnpj ? {cpf, cnpj} : null; };
/* despesa geral (sem fazenda) do exemplo: contador do CNPJ, todo mês da safra até hoje */
function contadorExemplo(u, ents){
  const T0 = hoje(), y = safraIni(T0), velhas = ativas(SES.L,'lancamentos').filter(l=>l.descr===CONTADOR).map(l=>['lancamentos', l.id]);
  if (velhas.length) excluirLote(SES.L, velhas);
  const itens = [];
  for (let m = 0; m < 12; m++) {
    const ano = y + (m+8 >= 12 ? 1 : 0), mes = String((m+8)%12+1).padStart(2,'0'), data = `${ano}-${mes}-10`;
    if (data > T0) break;
    itens.push(['lancamentos', linha.lancamento({id:uid(), data, tipo:'d', cat:'Outros', desc:CONTADOR, valor:350, fazenda:null,
      entidade:ents.cnpj.ent, conta:ents.cnpj.conta, tipoDoc:'RECIBO', contraparteNome:'Escritório Contábil Exemplo', catIr:'CUSTEIO'})]);
  }
  return itens;
}
function regerarExemplo(f){
  const u = usuario(), c = EX_FAZ.find(x=>x.nome===f.nome || x.ie===f.ie), ex = u?.email===EX.email ? idsExemplo(u) : null;
  const dist = c && ex ? {padrao:emitEx(ex[c.padrao], c.uf), outra:c.outra ? emitEx(ex[c.outra], c.uf) : null} : {padrao:emitEx(entPadrao(), f.uf)};
  excluirLote(SES.L, linhasDaFazenda(SES.L, f.id));
  const extra = c && ex && c===EX_FAZ[0] ? contadorExemplo(u, {cnpj:emitEx(ex.cnpj, 'PR')}) : [];
  salvarLote([...linhasExemplo(f, exemplo(c?.seed ?? 2+Math.floor(Math.random()*997), c?.defs, 'funrural'), dist), ...extra], {metrica:false});
}
/* monta (ou conserta) a conta de exemplo: CPF, CNPJ, inscrições, contas, fazendas e dados */
function montarExemplo(u){
  const ach = d => u.entidades.find(e=>e.documento===d);
  const semDoc = u.entidades.find(e=>e.padrao && !e.documento);   // o CPF que o servidor criou no cadastro
  const ids = {cpf:(ach(EX_ENT.cpf.documento) || semDoc)?.id || uid(), cnpj:ach(EX_ENT.cnpj.documento)?.id || uid()};
  const inscricoes = ativas(SES.L,'inscricoes_estaduais'), contas = ativas(SES.L,'contas_bancarias');
  const itens = [], ents = {};
  for (const [k, e] of Object.entries(EX_ENT)) {
    itens.push(['entidades_fiscais', linha.entidade({...e, id:ids[k], padrao:k==='cpf'})]);
    /* a IE é única: reaproveita a inscrição que já existe (a migração copiou as IEs das fazendas para o CPF padrão) */
    const ies = e.inscricoes.map(i=>({...i, id:inscricoes.find(x=>x.ie===i.ie)?.id || uid(), entidade:ids[k]}));
    itens.push(...ies.map(i=>['inscricoes_estaduais', linha.inscricao(i)]));
    const conta = {...e.conta, id:contas.find(x=>x.entidade_id===ids[k] && x.banco===e.conta.banco)?.id || uid(), entidade:ids[k]};
    itens.push(['contas_bancarias', linha.conta(conta)]);
    ents[k] = {ies, conta:conta.id};
  }
  /* a "Conta principal" criada pela migração para o CPF padrão fica sem saldo: o saldo do exemplo está nas contas acima */
  for (const c of contas.filter(x=>x.apelido==='Conta principal')) itens.push(['contas_bancarias', {id:c.id, saldo_inicial:0}]);
  const emit = (k, uf) => ({ent:ids[k], ie:(ents[k].ies.find(i=>i.uf===uf) || ents[k].ies[0]).id, conta:ents[k].conta});
  for (const c of EX_FAZ) {
    const f = u.fazendas.find(x=>x.nome===c.nome || x.ie===c.ie), fid = f?.id || uid();
    if (f) excluirLote(SES.L, linhasDaFazenda(SES.L, f.id));
    const faz = {id:fid, nome:c.nome, ie:f?.ie||null, doc:'', municipio:c.municipio, uf:c.uf, area_ha:c.area_ha, nirf_cib:c.nirf_cib, car:c.car};
    itens.push(...linhasExemplo(faz, exemplo(c.seed, c.defs), {padrao:emit(c.padrao, c.uf), outra:c.outra ? emit(c.outra, c.uf) : null}));
  }
  itens.push(...contadorExemplo(u, {cnpj:emit('cnpj','PR')}));
  salvarLote(itens, {metrica:false});
}
/* na conta de exemplo: monta tudo na primeira vez (ou se o CPF/CNPJ de exemplo sumiu) e renova dados com mais de 7 dias */
function prepararExemplo(){
  const u = usuario();
  if (u?.email!==EX.email) return;
  if (!idsExemplo(u) || EX_FAZ.some(c=>!u.fazendas.some(f=>f.nome===c.nome))) return montarExemplo(u);
  for (const f of u.fazendas) if (f.demo && (!f.demo_gerado_em || diff(f.demo_gerado_em, hoje())>7)) regerarExemplo(f);
}

export { MODS, MOD_PADRAO, NAV_MOD, TELAS_FAZ, vazio, CUR, E, SES, usuario, dadosFazenda, fazAtual, dadosTela, mod, recarregar, abrirSessao, fecharSessao, suspender,
  abrirFazenda, definirFiltro, definirEntidade, nomeEnt, entPadrao, emitentePadrao, inscricaoPara, contaPara, completarCadastro,
  salvar, salvarLote, apagar, limparFazenda, agendar, sincronizar, nPendentes, listaErros, EX, EX_ENT, EX_FAZ, linhasExemplo, regerarExemplo, prepararExemplo };
