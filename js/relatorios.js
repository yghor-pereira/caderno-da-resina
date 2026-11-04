/* ---------- relatórios: por CPF/CNPJ, por fazenda, produção por mês e venda cruzada ----------
   Funções puras sobre os dados no formato S (sem filtro de fazenda: o rateio pode levar parte de um
   lançamento para outra fazenda). Período em datas AAAA-MM-DD, inclusive nas duas pontas.
   Base de competência: venda pela data da venda (valor líquido); lançamento pela competência.
   Base de caixa: venda pelo que foi recebido, na data do recebimento; lançamento pela data do pagamento. */
import { addM, safraIni, sum, r2 } from './util.js';
import { liqV } from './regras.js';

const PERIODOS = {
  safra: y => ({de:`${y}-09-01`, ate:`${y+1}-08-31`}),
  ano: y => ({de:`${y}-01-01`, ate:`${y}-12-31`})
};
const dentro = (data, p) => !!data && data >= p.de && data <= p.ate;

/* partes de um lançamento por fazenda: o rateio divide o valor; o que sobrar dos 100% fica onde o lançamento está */
function partes(x, rateios){
  const rs = rateios?.[x.id] || [];
  if (!rs.length) return [{fazenda:x.fazenda||null, valor:x.valor}];
  const out = rs.map(r=>({fazenda:r.fazenda, valor:x.valor*r.percentual/100}));
  const resto = x.valor - sum(out, o=>o.valor);
  if (Math.abs(resto) > 0.0049) out.push({fazenda:x.fazenda||null, valor:resto});
  return out;
}

/* movimentos financeiros do período, já divididos por fazenda: {tipo:'r'|'d', valor, fazenda, entidade, origem, catIr} */
function movimentos(d, {de, ate, base='competencia'}){
  const p = {de, ate}, out = [];
  for (const v of d.vendas) {
    if (base==='caixa') for (const r of v.recs) { if (dentro(r.data, p)) out.push({tipo:'r', valor:r.valor, fazenda:v.fazenda, entidade:v.entidade, origem:'venda', catIr:'RECEITA_RURAL'}); }
    else if (dentro(v.data, p)) out.push({tipo:'r', valor:liqV(v), fazenda:v.fazenda, entidade:v.entidade, origem:'venda', catIr:'RECEITA_RURAL'});
  }
  for (const x of d.caixa) {
    if (!dentro(base==='caixa' ? x.data : x.competencia||x.data, p)) continue;
    for (const pt of partes(x, d.rateios)) out.push({tipo:x.tipo, valor:pt.valor, fazenda:pt.fazenda, entidade:x.entidade, origem:'lancamento', catIr:x.catIr});
  }
  return out;
}
const resumir = ms => { const receita = r2(sum(ms.filter(m=>m.tipo==='r'), m=>m.valor)), desp = r2(sum(ms.filter(m=>m.tipo==='d'), m=>m.valor));
  return {receita, vendas:r2(sum(ms.filter(m=>m.origem==='venda'), m=>m.valor)), desp, res:r2(receita-desp), n:ms.length}; };
/* agrupa por uma chave (CPF/CNPJ ou fazenda); as linhas somam exatamente o consolidado */
function agrupar(ms, chave, ids){
  const g = Object.fromEntries(ids.map(id=>[id ?? '', []]));
  for (const m of ms) (g[m[chave] ?? ''] ??= []).push(m);
  return Object.entries(g).map(([id, l])=>({id:id||null, ...resumir(l)}));
}
const porEntidade = (ms, entidades) => agrupar(ms, 'entidade', entidades.map(e=>e.id)).filter(r=>r.n || entidades.some(e=>e.id===r.id));
/* por fazenda, com a linha "Geral" (id null) para o que não tem fazenda */
const porFazenda = (ms, fazendas) => agrupar(ms, 'fazenda', [...fazendas.map(f=>f.id), null]).filter(r=>r.id || r.n);

/* meses do período (AAAA-MM) */
function mesesDe({de, ate}){ const out = []; for (let m = de.slice(0,7); m <= ate.slice(0,7); m = addM(m,1)) out.push(m); return out; }
/* produção (kg coletado) por fazenda e por mês, independente de quem faturou */
function producaoMensal(d, p, fazendas){
  const meses = mesesDe(p), idx = Object.fromEntries(meses.map((m,i)=>[m,i])), fazDe = Object.fromEntries(d.talhoes.map(t=>[t.id, t.fazenda]));
  const linhas = Object.fromEntries(fazendas.map(f=>[f.id, Array(meses.length).fill(0)]));
  for (const c of d.producao) if (dentro(c.data, p)) { const f = fazDe[c.talhao]; if (linhas[f]) linhas[f][idx[c.data.slice(0,7)]] += c.kg; }
  return {meses, linhas, total: meses.map((_,i)=>sum(Object.values(linhas), l=>l[i]))};
}
/* venda cruzada: fazenda (de onde saiu a resina) × CPF/CNPJ (quem emitiu), kg e valor líquido, pela data da venda */
function matrizVendas(d, p){
  const m = {};
  for (const v of d.vendas) if (dentro(v.data, p)) {
    const c = ((m[v.fazenda] ??= {})[v.entidade] ??= {kg:0, valor:0});
    c.kg += v.kg; c.valor = r2(c.valor + liqV(v));
  }
  return m;
}
const somaMatriz = (m, eixo, id) => Object.entries(m).flatMap(([f, ls])=>Object.entries(ls).filter(([e])=>eixo==='fazenda' ? f===id : e===id).map(([,c])=>c))
  .reduce((t,c)=>({kg:t.kg+c.kg, valor:r2(t.valor+c.valor)}), {kg:0, valor:0});
/* resina do período: coletada, vendida e perdida (por fazenda, ou todas) */
function resina(d, p, fazenda=null){
  const fazDe = Object.fromEntries(d.talhoes.map(t=>[t.id, t.fazenda])), daFaz = f => !fazenda || f===fazenda;
  return {coletado: sum(d.producao.filter(c=>dentro(c.data,p) && daFaz(fazDe[c.talhao])), c=>c.kg),
    vendido: sum(d.vendas.filter(v=>dentro(v.data,p) && daFaz(v.fazenda)), v=>v.kg),
    perdido: sum((d.perdas||[]).filter(x=>dentro(x.data,p) && daFaz(x.fazenda)), x=>x.kg)};
}
/* período escolhido: safra ou ano (do ano y), ou livre */
function periodo(tipo, y, livre){ return tipo==='livre' && livre?.de && livre?.ate ? {de:livre.de, ate:livre.ate} : (PERIODOS[tipo]||PERIODOS.safra)(y); }
const safraDe = data => safraIni(data);

export { PERIODOS, dentro, partes, movimentos, resumir, porEntidade, porFazenda, mesesDe, producaoMensal, matrizVendas, somaMatriz, resina, periodo, safraDe };
