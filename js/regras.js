import { hoje, addD, addM, diff, MESES, safraIni, sum, r2 } from './util.js';

/* ---------- conteúdo fixo ---------- */
/* Mercado: valores ilustrativos. Na versão real viriam de API (Banco Central / CEPEA). */
const MERCADO = { atualizado:'valores de exemplo', dolar:{v:5.42,d:-0.6}, euro:{v:6.31,d:+0.3}, resina:{v:6.10,d:+2.1} };
const DICAS = [
  {m:'Set–Abr', t:'Safra de resinagem', s:'O pinus produz mais resina no calor. Concentre o esforço de estria da primavera ao início do outono.'},
  {m:'14 dias', t:'Ritmo das estrias', s:'Renove a estria a cada 14 a 15 dias. Intervalo longo derruba o kg por estria do painel.'},
  {m:'DAP 20+', t:'Árvore pronta', s:'Só abra painel em árvores com pelo menos 20 cm de diâmetro à altura do peito.'},
  {m:'Coleta', t:'Saco limpo, resina valorizada', s:'Resina com cisco e casca perde preço. Troque o saco e proteja o painel da chuva.'},
  {m:'EPI', t:'Pasta ácida exige proteção', s:'Use luvas e óculos ao aplicar estimulante. Guarde o produto longe de crianças e animais.'}
];
const SAFRA = [1,.95,.8,.55,.3,.15,.12,.2,.45,.7,.9,1];   // jan→dez
const CATS_D = ['Mão de obra','Pasta estimulante','Sacos e materiais','Combustível/frete','Arrendamento','Outros'];
const CATS_R = ['Venda de resina','Outras receitas'];
/* atraso de estria (dias além do intervalo ideal) que deixa alertas, cartões e gráfico em vermelho */
const ATRASO_CRITICO = 4;
const FORMAS = ['Pix','Transferência','Boleto','Dinheiro','Cheque'];
const totalV = v => v.kg*v.preco;
const recV = v => sum(v.recs||[], r=>r.valor);
const saldoV = v => Math.max(0, Math.round((liqV(v)-recV(v))*100)/100);
const statusRec = v => { const r=recV(v); return r<=0?'pend' : saldoV(v)>0?'parcial':'ok'; };
function chave(){ let c='41'+'2610'; while(c.length<44) c+=Math.floor(Math.random()*10); return c; }
const CORES = ['var(--pine)','var(--amber)','var(--c3)','var(--c4)','var(--c5)','var(--muted)'];
/* ---------- regime de contribuição ---------- */
const REG = {
  funrural:{f:0.9837, nome:'Funrural', desc:'sobre a comercialização (1,63%)'},
  folha:{f:0.998, nome:'Folha de pagamento', desc:'retenção de 0,2% na venda'}
};
const fat = () => (REG[S.regime]||REG.funrural).f;
/* cada venda guarda o fator do regime da época: trocar o regime só vale para vendas novas */
const liqV = v => r2(totalV(v)*v.fator);          // preço livre × kg = o que cai na conta
const livreV = v => v.preco*v.fator;
const livre = p => p*fat();
const pctRec = v => liqV(v) ? Math.min(100, recV(v)/liqV(v)*100) : 0;
/* editar kg ou preço não pode deixar o líquido da venda abaixo do que já foi recebido */
const abaixoDoRecebido = (v, kg, preco) => liqV({...v, kg, preco}) < r2(recV(v));

/* ---------- floresta: talhões → ramais (contagem de árvores com histórico) ---------- */
const arv = r => r.hist.at(-1).arv;
const contData = r => r.hist.at(-1).data;
const painT = t => sum(t.ramais, arv);
const talByNome = n => S.talhoes.find(t=>t.nome===n);
const talById = id => S.talhoes.find(t=>t.id===id);
const ramsDe = (t,ids) => (ids||[]).map(id=>t?.ramais.find(r=>r.id===id)).filter(Boolean);

/* ---------- dados da fazenda aberta ---------- */
let S = null;
const usarDados = d => { S = d; };
const dados = () => S;
/* roda um cálculo com os dados de outra fazenda (usado só na visão geral, que apenas lê) */
function comFazenda(d, fn){ const old=S; S=d; try { return fn(); } finally { S=old; } }

/* ---------- cálculos ---------- */
const inSafra = y => x => safraIni(x.data)===y;
const totPaineis = () => sum(S.talhoes, painT);
function tot(y){
  const f = inSafra(y);
  const cx=S.caixa.filter(f), pr=S.producao.filter(f), es=S.estrias.filter(f), ve=S.vendas.filter(f);
  const desp=sum(cx.filter(x=>x.tipo==='d'),x=>x.valor), outras=sum(cx.filter(x=>x.tipo==='r'),x=>x.valor);
  const vendido=sum(ve,totalV), liquido=sum(ve,liqV), kgProd=sum(pr,x=>x.kg), kgVend=sum(ve,x=>x.kg);
  const nEst=sum(es,x=>x.qtd), dias=sum(es,x=>x.dias), pain=totPaineis(), receita=liquido+outras;
  return {desp,outras,vendido,liquido,contrib:vendido-liquido,aReceber:sum(ve,saldoV),kgProd,kgVend,nEst,dias,receita,
    lucro:receita-desp, kgPainel:pain?kgProd/pain:0, kgEstria:nEst?kgProd/nEst:0, estDia:dias?nEst/dias:0,
    custoKg:kgProd?desp/kgProd:0, precoMedio:kgVend?vendido/kgVend:0, precoLivre:kgVend?liquido/kgVend:0, custoPainel:pain?desp/pain:0};
}
const estoque = () => sum(S.producao,x=>x.kg) - sum(S.vendas,x=>x.kg);
const saldoAtual = () => S.saldoInicial + sum(S.caixa,x=>x.tipo==='r'?x.valor:-x.valor) + sum(S.vendas,recV);
const nfPend = () => S.vendas.filter(v=>v.comNota && !v.nf).length;
function fluxo(meses=6){
  const T0=hoje(), ym=T0.slice(0,7); let saldo=saldoAtual();
  const out=[];
  for (let i=0;i<meses;i++){
    const m=addM(ym,i); const noMes = d => (d<T0 ? ym : d.slice(0,7)) === m;
    const ent = sum(S.comp.filter(c=>c.tipo==='r'&&noMes(c.data)),c=>c.valor) + sum(S.vendas.filter(v=>saldoV(v)>0&&noMes(v.venc||T0)),saldoV);
    const sai = sum(S.comp.filter(c=>c.tipo==='d'&&noMes(c.data)),c=>c.valor);
    saldo += ent - sai;
    out.push({m, lbl:MESES[+m.slice(5,7)-1], ent, sai, saldo});
  }
  return out;
}
/* kg de uma coleta rateado entre os ramais coletados, pelo nº de árvores */
function kgRamal(t, r, filtro){
  return sum(S.producao.filter(p=>p.talhao===t.id && p.ramais?.includes(r.id) && filtro(p)), p=>{
    const tt=sum(ramsDe(t,p.ramais),arv); return tt? p.kg*arv(r)/tt : 0; });
}
function ramStats(t, r, y=safraIni(hoje())){
  const T0=hoje();
  const es=S.estrias.filter(e=>e.talhao===t.id && e.ramais?.includes(r.id)).sort((a,b)=>a.data.localeCompare(b.data));
  const ult=es.at(-1)?.data||null, desde=ult?diff(ult,T0):null;
  const cur=es.filter(inSafra(y)), ints=cur.slice(1).map((e,i)=>diff(cur[i].data,e.data));
  const kg=kgRamal(t,r,inSafra(y));
  return {r, arv:arv(r), ult, desde, atraso:desde==null?null:desde-S.ideal, prox:ult?addD(ult,S.ideal):null,
    medio:ints.length?sum(ints,x=>x)/ints.length:null, n:cur.length, kg, kgArv:arv(r)?kg/arv(r):0,
    gEst:cur.length&&arv(r)?kg/(arv(r)*cur.length)*1000:0, cont:diff(contData(r),T0)};
}
function statusTalhoes(){
  return S.talhoes.map(t=>{
    const rs=t.ramais.map(r=>ramStats(t,r)), com=rs.filter(s=>s.ult);
    const atrasados=rs.filter(s=>s.atraso>0);
    const meds=rs.filter(s=>s.medio!=null);
    return {t, rs, atrasados, atraso: com.length? Math.max(...com.map(s=>s.atraso)) : null,
      ult: com.length? com.map(s=>s.ult).sort().at(-1) : null,
      prox: com.length? com.map(s=>s.prox).sort()[0] : null,
      medio: meds.length? sum(meds,s=>s.medio)/meds.length : null,
      contVelha: rs.filter(s=>s.cont>180).length};
  });
}

export { MERCADO, DICAS, SAFRA, CATS_D, CATS_R, ATRASO_CRITICO, FORMAS, totalV, recV, saldoV, statusRec, chave, CORES, REG, fat, liqV, livreV, livre, pctRec, abaixoDoRecebido, arv, contData, painT, talByNome, talById, ramsDe, S, usarDados, dados, comFazenda, inSafra, totPaineis, tot, estoque, saldoAtual, nfPend, fluxo, kgRamal, ramStats, statusTalhoes };
