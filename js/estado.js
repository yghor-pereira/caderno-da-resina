import { uid, hoje, safraIni, diff } from './util.js';
import { usarDados, CORES_ENT } from './regras.js';
import { exemplo } from './exemplo.js';
import { apagarCache, abrir, gravar, gravarLote, excluirLote, definirMeta, pendentes, erros, definirUltimo } from './local.js';
import { linha, dadosParaLinhas, fazendasDe, entidadesDe, propriedadesDe, linhasDaFazenda } from './mapa.js';
import { abrirMetricas, fecharMetricas, apagarMetricas, track, enviarMetricas } from './metricas.js';
import { SUSPENSA, criarNuvem, conectar, sessao, sair as sairNuvem } from './nuvem.js';

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
const vazio = () => ({demo:false, regime:'funrural', saldoInicial:0, ideal:14, entidade:null, fazendas:[], talhoes:[], estrias:[], producao:[], vendas:[], caixa:[], comp:[],
  todas:{vendas:[], caixa:[], comp:[]}, compradores:{}});

usarDados(vazio());

/* ---------- estado da tela ---------- */
const CUR = safraIni(hoje());
const E = {atual:'login', safraSel:CUR, tipoLanc:'d', modoCaixa:'real', talSel:null, flMode:'ramais', ramSel:null, opTipo:'estria', apTal:null, apSel:null,
  lMode:'entrar', lAviso:'', lErro:'', senhaTrocada:null, admin:false, fazEdit:null, propEdit:null, entEdit:null, vincEdit:null, limparPend:null, aberta:null, confirmar:null, editar:null, sairPend:false,
  sel:null,   // seleção para mover em lote: {tab, ids:Set}
  render:()=>{}, mostrarSync:()=>{}};

/* ---------- sessão: usuário logado e o cache local dele ----------
   SES.pid: propriedade aberta ('todas' na visão geral). O CPF/CNPJ escolhido no topo fica no cache do usuário (meta.entidade). */
const SES = {L:null, pid:null, sync:'ok', nuvem:null};
let versao = 0, memo = {v:-1, u:null};
function usuario(){
  if (!SES.L) return null;
  if (memo.v===versao) return memo.u;
  const p = SES.L.linhas.perfis?.[SES.L.userId], entidades = entidadesDe(SES.L);
  const sel = entidades.some(e=>e.id===SES.L.meta.entidade) ? SES.L.meta.entidade : null;
  memo = {v:versao, u:{id:SES.L.userId, email:SES.L.meta.email||'', nome:p?.nome || SES.L.meta.nome || '',
    modulos:p?.modulos || MOD_PADRAO, entidades, entidadeSel:sel, fazendas:fazendasDe(SES.L), propriedades:propriedadesDe(SES.L, {entidade:sel}),
    trocarSenha:!!p?.trocar_senha && E.senhaTrocada!==SES.L.userId}};
  return memo.u;
}
const propAtual = () => usuario()?.propriedades.find(p=>p.id===SES.pid && p.fazendas.length) || null;
const mod = k => !!usuario()?.modulos?.[k];
/* remonta S a partir do cache depois de qualquer mudança */
function recarregar(){ versao++; usarDados(propAtual()?.dados || vazio()); }
/* CPF/CNPJ escolhido no topo (null = todos): filtra o financeiro, guardado por usuário neste aparelho */
function definirEntidade(id){
  if (!SES.L) return;
  definirMeta(SES.L, {entidade:id||null});
  track('feature_used', {funcao:'entidade_filtrada', todos:!id});
  recarregar(); E.render();
}
const nomeEnt = e => e ? (e.apelido || e.nome) : 'Sem CPF/CNPJ';
/* opções de "Faturado por": cada CPF/CNPJ ativo vinculado a cada inscrição das propriedades */
function opcoesFat(props){
  const ents = Object.fromEntries((usuario()?.entidades||[]).map(e=>[e.id,e]));
  return [].concat(props).filter(Boolean).flatMap(p=>p.fazendas.flatMap(f=>{
    const vs = f.vinculos.filter(v=>ents[v.entidade]?.ativo);
    return vs.length ? vs.map(v=>({prop:p, faz:f, ent:ents[v.entidade], padrao:v.padrao})) : [{prop:p, faz:f, ent:null, padrao:true}];
  }));
}
const valorFat = o => `${o.faz.id}|${o.ent?.id||''}`;
/* sugestão: o CPF/CNPJ escolhido no topo, se faturar por esta propriedade; senão o padrão da inscrição principal */
function fatPadrao(prop){
  const ops = opcoesFat(prop), sel = usuario()?.entidadeSel;
  return ops.find(o=>sel && o.ent?.id===sel && o.padrao) || ops.find(o=>sel && o.ent?.id===sel)
    || ops.find(o=>o.faz.id===prop?.fazendas[0]?.id && o.padrao) || ops[0] || null;
}
/* "fazendaId|entidadeId" → {fazenda, entidade} para gravar */
const lerFat = v => { const [fazenda, entidade] = String(v||'').split('|'); return {fazenda, entidade:entidade||null}; };

function abrirSessao(userId, meta={}){
  SES.L = abrir(userId); SES.pid = null; SES.nuvem = null; SES.sync = 'ok';
  definirUltimo(userId);
  if (meta.email) definirMeta(SES.L, meta);
  abrirMetricas(userId);
  recarregar();
}
async function fecharSessao(){
  clearTimeout(timer);
  SES.L = null; SES.pid = null; SES.nuvem = null;   // primeiro: uma sincronização em andamento para de gravar
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
function usarPropriedadeId(pid){ SES.pid = pid; E.sel = null; recarregar(); }

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
   O servidor cria o CPF padrão no cadastro e a migração liga as fazendas antigas. Aqui o aparelho cobre o
   que ainda faltar (ex.: fazenda criada por um aparelho antigo): propriedade, CPF/CNPJ padrão e vínculo. */
function completarCadastro(){
  const u = usuario(); if (!u) return;
  const itens = [];
  let padrao = (u.entidades.find(e=>e.padrao) || u.entidades[0])?.id;
  if (!padrao) { padrao = uid(); itens.push(['entidades_fiscais', linha.entidade({id:padrao, tipo:'PF', nome:u.nome||'Meu CPF', cor:CORES_ENT[0], regime:'PF_ATIVIDADE_RURAL', padrao:true})]); }
  for (const p of u.propriedades.filter(p=>p.virtual)) {
    const pid = uid();
    itens.push(['propriedades', linha.propriedade({...p, id:pid})], ...p.fazendas.map(f=>['fazendas', {id:f.id, propriedade_id:pid}]));
  }
  for (const f of u.fazendas.filter(f=>!f.vinculos.length))
    itens.push(['vinculos', linha.vinculo({id:uid(), fazenda:f.id, entidade:padrao, percentual:100, condicao:'PROPRIETARIO', padrao:true})]);
  if (itens.length) salvarLote(itens, {metrica:false});
}

/* ---------- conta de exemplo ---------- */
const EX = {email:'produtor@exemplo.com', senha:'resina123'};
/* duas propriedades, um CPF e um CNPJ: Capão Alto fatura pelo CPF (70%) e pelo CNPJ (30%, parceiro);
   Boa Esperança é arrendada pelo CNPJ. Documentos fictícios com dígito verificador válido. */
const EX_ENT = {
  cpf: {tipo:'PF', nome:'João da Silva', apelido:'CPF João', documento:'52998224725', cor:CORES_ENT[0], regime:'PF_ATIVIDADE_RURAL'},
  cnpj: {tipo:'PJ', nome:'Resinas Silva Ltda', apelido:'Resinas Silva', documento:'11222333000181', cor:CORES_ENT[1], regime:'SIMPLES'}
};
const EX_FAZ = [
  {nome:'Fazenda Capão Alto', ie:'254123987', municipio:'Itaiópolis', uf:'SC', seed:11, area_ha:42.5, nirf_cib:'7.123.456-0', car:'SC-4208005-8F2A1C9D0B3E4A5F6071829304A5B6C7',
    vinc:[['cpf',70,'PROPRIETARIO',true],['cnpj',30,'PARCEIRO',false]], outra:'cnpj'},
  {nome:'Sítio Boa Esperança', ie:'9012345678', municipio:'Rio Negro', uf:'PR', seed:23, defs:[['Talhão 1',8,'Pedro'],['Talhão 2',7,'Luís']], area_ha:18,
    nirf_cib:'8.234.567-1', car:'PR-4122305-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D', vinc:[['cnpj',100,'ARRENDATARIO',true]]}
];
/* quem faturou cada registro do exemplo: o padrão da inscrição, e parte das vendas e despesas pela outra */
function distribuir(dados, {padrao=null, outra=null}={}){
  const por = (n, k) => outra && k ? outra : padrao;
  return {...dados,
    vendas: dados.vendas.map((v,i)=>({...v, entidade:por(i, i%3===2)})),
    caixa: dados.caixa.map((x,i)=>({...x, entidade:por(i, i%4===3)})),
    comp: dados.comp.map(x=>({...x, entidade:padrao}))};
}
/* linhas de uma fazenda com dados de exemplo, datados a partir de hoje */
function linhasExemplo(f, dados, dist){
  if (dist) dados = distribuir(dados, dist);
  return [['fazendas', linha.fazenda({...f, demo_gerado_em:hoje()}, dados)],
    ...Object.entries(dadosParaLinhas(dados, f.id)).flatMap(([t,ls])=>ls.map(l=>[t,l]))];
}
const idsExemplo = u => { const ach = d => u.entidades.find(e=>e.documento===d)?.id;
  const cpf = ach(EX_ENT.cpf.documento), cnpj = ach(EX_ENT.cnpj.documento); return cpf && cnpj ? {cpf, cnpj} : null; };
const distExemplo = (c, ids) => ({padrao: ids[c.vinc.find(v=>v[3])[0]], outra: c.outra ? ids[c.outra] : null});
function regerarExemplo(f){
  const u = usuario(), c = EX_FAZ.find(x=>x.ie===f.ie), ids = u?.email===EX.email ? idsExemplo(u) : null;
  const dist = c && ids ? distExemplo(c, ids) : {padrao: f.vinculos?.find(v=>v.padrao)?.entidade || null};
  excluirLote(SES.L, linhasDaFazenda(SES.L, f.id));
  salvarLote(linhasExemplo(f, exemplo(c?.seed ?? 2+Math.floor(Math.random()*997), c?.defs, f.regime||'funrural'), dist), {metrica:false});
}
/* monta (ou conserta) a conta de exemplo inteira: CPF, CNPJ, propriedades, inscrições, vínculos e dados */
function montarExemplo(u){
  const ach = d => u.entidades.find(e=>e.documento===d);
  const padraoAtual = u.entidades.find(e=>e.padrao && !e.documento);   // o CPF que o servidor criou no cadastro
  const ids = {cpf: (ach(EX_ENT.cpf.documento) || padraoAtual)?.id || uid(), cnpj: ach(EX_ENT.cnpj.documento)?.id || uid()};
  const itens = Object.entries(EX_ENT).map(([k,e])=>['entidades_fiscais', linha.entidade({...e, id:ids[k], padrao:k==='cpf'})]);
  for (const c of EX_FAZ) {
    const f = u.fazendas.find(x=>x.ie===c.ie), prop = u.propriedades.find(p=>!p.virtual && p.id===f?.propriedade_id);
    const pid = prop?.id || uid(), fid = f?.id || uid();
    itens.push(['propriedades', linha.propriedade({id:pid, nome:c.nome, municipio:c.municipio, uf:c.uf, area_ha:c.area_ha, nirf_cib:c.nirf_cib, car:c.car})]);
    /* reaproveita os vínculos que já existem: apagar e recriar o mesmo par esbarra na regra de vínculo único */
    const quer = new Set(c.vinc.map(v=>ids[v[0]]));
    for (const v of f?.vinculos||[]) if (!quer.has(v.entidade)) itens.push(['vinculos', {id:v.id, deleted_at:new Date().toISOString()}]);
    for (const [k, percentual, condicao, padrao] of c.vinc) {
      const id = f?.vinculos.find(v=>v.entidade===ids[k])?.id || uid();
      itens.push(['vinculos', linha.vinculo({id, fazenda:fid, entidade:ids[k], percentual, condicao, padrao})]);
    }
    if (f) excluirLote(SES.L, linhasDaFazenda(SES.L, f.id));
    itens.push(...linhasExemplo({id:fid, propriedade_id:pid, nome:c.nome, ie:c.ie, doc:'', municipio:c.municipio, uf:c.uf}, exemplo(c.seed, c.defs), distExemplo(c, ids)));
  }
  /* vínculos antes das fazendas na fila não importam: o envio segue a ordem das tabelas (pais primeiro) */
  salvarLote(itens, {metrica:false});
}
/* na conta de exemplo: monta tudo na primeira vez (ou se o CPF/CNPJ de exemplo sumiu) e renova dados com mais de 7 dias */
function prepararExemplo(){
  const u = usuario();
  if (u?.email!==EX.email) return;
  const ids = idsExemplo(u);
  if (!ids || EX_FAZ.some(c=>!u.fazendas.some(f=>f.ie===c.ie))) return montarExemplo(u);
  for (const f of u.fazendas) if (f.demo && (!f.demo_gerado_em || diff(f.demo_gerado_em, hoje())>7)) regerarExemplo(f);
}

export { MODS, MOD_PADRAO, NAV_MOD, vazio, CUR, E, SES, usuario, propAtual, mod, recarregar, abrirSessao, fecharSessao, suspender, usarPropriedadeId,
  definirEntidade, nomeEnt, opcoesFat, valorFat, fatPadrao, lerFat, completarCadastro,
  salvar, salvarLote, apagar, limparFazenda, agendar, sincronizar, nPendentes, listaErros, EX, EX_ENT, EX_FAZ, linhasExemplo, regerarExemplo, prepararExemplo };
