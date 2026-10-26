import { uid, hoje, safraIni } from './util.js';
import { usarDados } from './regras.js';
import { exemplo } from './exemplo.js';

/* ---------- contas e fazendas (protótipo: tudo fica salvo neste navegador) ---------- */
const DBKEY = 'caderno-resina-contas-v1';
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
const hashS = s => { let h=5381; for (const c of s) h=((h<<5)+h+c.charCodeAt(0))|0; return (h>>>0).toString(36); };
let DB;
try { DB = JSON.parse(localStorage.getItem(DBKEY)) || {users:[], sessao:null}; } catch(e) { DB = {users:[], sessao:null}; }
const salvar = () => { try { localStorage.setItem(DBKEY, JSON.stringify(DB)); } catch(e){} };
const usuario = () => DB.users.find(u=>u.id===DB.sessao?.uid) || null;
const fazAtual = () => usuario()?.fazendas.find(f=>f.id===DB.sessao?.fid) || null;
const mod = k => !!usuario()?.modulos?.[k];
const vazio = () => ({demo:false, regime:'funrural', saldoInicial:0, ideal:14, talhoes:[], estrias:[], producao:[], vendas:[], caixa:[], comp:[], compradores:{}});
usarDados(fazAtual()?.dados || vazio());

/* ---------- estado da tela ---------- */
const CUR = safraIni(hoje());
const E = {atual:'inicio', safraSel:CUR, tipoLanc:'d', modoCaixa:'real', talSel:null, flMode:'ramais', ramSel:null, opTipo:'estria', apTal:null, apSel:null, lMode:'entrar', fazEdit:null, limparPend:null, aberta:null, render:()=>{}};

/* usuário de exemplo: criado na primeira abertura do app */
const EX = {email:'produtor@exemplo.com', senha:'resina123'};
function garantirExemplo(){
  let u = DB.users.find(x=>x.email===EX.email);
  if (!u) {
    u = {id:uid(), nome:'José Ferreira (exemplo)', email:EX.email, senha:hashS(EX.senha), modulos:{...MOD_PADRAO}, fazendas:[
      {id:uid(), nome:'Fazenda Capão Alto', ie:'254123987', doc:'', municipio:'Itaiópolis', uf:'SC', dados:exemplo(11)},
      {id:uid(), nome:'Sítio Boa Esperança', ie:'9012345678', doc:'', municipio:'Rio Negro', uf:'PR', dados:exemplo(23,[['Talhão 1',8,'Pedro'],['Talhão 2',7,'Luís']])}
    ]};
    DB.users.push(u); salvar();
  }
  return u;
}
garantirExemplo();

export { DBKEY, MODS, MOD_PADRAO, NAV_MOD, hashS, DB, salvar, usuario, fazAtual, mod, vazio, CUR, E, EX, garantirExemplo };
