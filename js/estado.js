import { uid, hoje, safraIni, diff } from './util.js';
import { usarDados } from './regras.js';
import { exemplo } from './exemplo.js';
import { abrir, gravar, gravarLote, excluirLote, definirMeta, pendentes, erros, definirUltimo } from './local.js';
import { linha, dadosParaLinhas, fazendasDe, linhasDaFazenda } from './mapa.js';
import { criarNuvem, conectar, sessao, sair as sairNuvem } from './nuvem.js';

/* ---------- funções do app (cada usuário liga e desliga em Conta) ---------- */
const MODS = [
  {k:'caixa', n:'Caixa e fluxo previsto', d:'Lançamentos, compromissos futuros e projeção de saldo'},
  {k:'floresta', n:'Floresta e operações', d:'Talhões, ramais, contagem de árvores, apontamento de estria e coleta'},
  {k:'producao', n:'Produção e produtividade', d:'kg por mês, kg/árvore, g/estria e comparação entre safras', req:'floresta'},
  {k:'vendas', n:'Vendas e recebimentos', d:'Preço livre de Funrural, compradores e valores a receber'},
  {k:'nfe', n:'Emissão de NF-e', d:'Nota fiscal da venda (simulada no protótipo)', req:'vendas'},
  {k:'resultado', n:'Custo e margem', d:'Custo por kg e por árvore, margem e lucro'}
];
const MOD_PADRAO = Object.fromEntries(MODS.map(m=>[m.k,true]));
const NAV_MOD = {caixa:'caixa', floresta:'floresta', producao:'producao', vendas:'vendas', resultado:'resultado'};
const vazio = () => ({demo:false, regime:'funrural', saldoInicial:0, ideal:14, talhoes:[], estrias:[], producao:[], vendas:[], caixa:[], comp:[], compradores:{}});

usarDados(vazio());

/* ---------- estado da tela ---------- */
const CUR = safraIni(hoje());
const E = {atual:'login', safraSel:CUR, tipoLanc:'d', modoCaixa:'real', talSel:null, flMode:'ramais', ramSel:null, opTipo:'estria', apTal:null, apSel:null,
  lMode:'entrar', fazEdit:null, limparPend:null, aberta:null, confirmar:null, editar:null, sairPend:false,
  render:()=>{}, mostrarSync:()=>{}};

/* ---------- sessão: usuário logado e o cache local dele ---------- */
const SES = {L:null, fid:null, sync:'ok', nuvem:null};
let versao = 0, memo = {v:-1, u:null};
function usuario(){
  if (!SES.L) return null;
  if (memo.v===versao) return memo.u;
  const p = SES.L.linhas.perfis?.[SES.L.userId];
  memo = {v:versao, u:{id:SES.L.userId, email:SES.L.meta.email||'', nome:p?.nome || SES.L.meta.nome || '',
    modulos:p?.modulos || MOD_PADRAO, fazendas:fazendasDe(SES.L)}};
  return memo.u;
}
const fazAtual = () => usuario()?.fazendas.find(f=>f.id===SES.fid) || null;
const mod = k => !!usuario()?.modulos?.[k];
/* remonta S a partir do cache depois de qualquer mudança */
function recarregar(){ versao++; usarDados(fazAtual()?.dados || vazio()); }

function abrirSessao(userId, meta={}){
  SES.L = abrir(userId); SES.fid = null; SES.nuvem = null; SES.sync = 'ok';
  definirUltimo(userId);
  if (meta.email) definirMeta(SES.L, meta);
  recarregar();
}
async function fecharSessao(){
  clearTimeout(timer);
  SES.L = null; SES.fid = null; SES.nuvem = null;   // primeiro: uma sincronização em andamento para de gravar
  definirUltimo(null);
  recarregar();
  await sairNuvem();
}
function usarFazendaId(fid){ SES.fid = fid; recarregar(); }

/* ---------- gravações: cache local + fila; a sincronização vem logo depois ---------- */
function salvar(tabela, l){ gravar(SES.L, tabela, l); recarregar(); E.render(); agendar(); }
function salvarLote(itens){ gravarLote(SES.L, itens); recarregar(); E.render(); agendar(); }
function apagar(itens){ excluirLote(SES.L, itens); recarregar(); E.render(); agendar(); }
/* apaga todos os registros da fazenda; o cadastro fica, sem saldo inicial e sem marca de exemplo */
function limparFazenda(fid){
  const agora = new Date().toISOString();
  salvarLote([...linhasDaFazenda(SES.L, fid).map(([t,id])=>[t,{id, deleted_at:agora}]), ['fazendas',{id:fid, demo:false, saldo_inicial:0}]]);
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
    if (s.estado==='offline') r = {ok:false, offline:true};
    else if (s.estado!=='ok' || s.session.user.id!==L.userId) r = {ok:false, sessao:false};
    else { SES.nuvem ??= criarNuvem(await conectar(), L, {ativo:()=>SES.L===L}); r = await SES.nuvem.sincronizar(); }
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

/* ---------- conta de exemplo ---------- */
const EX = {email:'produtor@exemplo.com', senha:'resina123'};
const EX_FAZ = [
  {nome:'Fazenda Capão Alto', ie:'254123987', municipio:'Itaiópolis', uf:'SC', seed:11},
  {nome:'Sítio Boa Esperança', ie:'9012345678', municipio:'Rio Negro', uf:'PR', seed:23, defs:[['Talhão 1',8,'Pedro'],['Talhão 2',7,'Luís']]}
];
/* linhas de uma fazenda com dados de exemplo, datados a partir de hoje */
function linhasExemplo(f, dados){
  return [['fazendas', linha.fazenda({...f, demo_gerado_em:hoje()}, dados)],
    ...Object.entries(dadosParaLinhas(dados, f.id)).flatMap(([t,ls])=>ls.map(l=>[t,l]))];
}
function regerarExemplo(f){
  const c = EX_FAZ.find(x=>x.ie===f.ie);
  excluirLote(SES.L, linhasDaFazenda(SES.L, f.id));
  salvarLote(linhasExemplo(f, exemplo(c?.seed ?? 2+Math.floor(Math.random()*997), c?.defs, f.dados.regime)));
}
/* na conta de exemplo: cria as duas fazendas na primeira vez e renova dados com mais de 7 dias */
function prepararExemplo(){
  const u = usuario();
  if (u?.email!==EX.email) return;
  if (!u.fazendas.length) {
    salvarLote(EX_FAZ.flatMap(c=>linhasExemplo({id:uid(), nome:c.nome, ie:c.ie, doc:'', municipio:c.municipio, uf:c.uf}, exemplo(c.seed, c.defs))));
    return;
  }
  for (const f of u.fazendas) if (f.demo && (!f.demo_gerado_em || diff(f.demo_gerado_em, hoje())>7)) regerarExemplo(f);
}

export { MODS, MOD_PADRAO, NAV_MOD, vazio, CUR, E, SES, usuario, fazAtual, mod, recarregar, abrirSessao, fecharSessao, usarFazendaId,
  salvar, salvarLote, apagar, limparFazenda, agendar, sincronizar, nPendentes, listaErros, EX, linhasExemplo, regerarExemplo, prepararExemplo };
