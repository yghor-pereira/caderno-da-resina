import { uid, hoje, addD, addM, safraIni, sum, rng, r2 } from './util.js';
import { SAFRA, totalV, chave, REG, arv } from './regras.js';

/* ---------- dados de exemplo (gerados em relação à data de hoje) ---------- */
function exemplo(seed=11, defs=null, regime='funrural'){
  const r = rng(seed), T0 = hoje(), cur = safraIni(T0), fator = REG[regime].f;
  const def = (defs||[['Talhão A',12,'João'],['Talhão B',9,'Pedro'],['Talhão C',6,'João']]).map(([nome,n,res])=>({nome,n,res}));
  const talhoes = def.map(d=>({id:uid(), nome:d.nome, res:d.res, ramais:Array.from({length:d.n},(_,i)=>{
    const a0 = 85 + Math.floor(r()*30);
    const hist = [{id:uid(), data:`${cur-1}-08-20`, arv:a0, motivo:'Contagem inicial'}];
    const k = r();   // ~85% dos ramais recontados antes da safra atual; os demais ficam com contagem antiga
    if (k<0.85) hist.push({id:uid(), data:`${cur}-08-${10+Math.floor(r()*15)}`, arv:k<0.45? a0-1-Math.floor(r()*5) : a0, motivo:k<0.45?(r()<0.6?'Mortalidade':'Árvore quebrada'):'Recontagem'});
    return {id:uid(), cod:'R-'+String(i+1).padStart(2,'0'), hist};
  })}));
  const estrias=[], producao=[], vendas=[], caixa=[], comp=[], agg={};
  for (const y of [cur-1, cur]) {
    talhoes.forEach((t,i) => {
      const fim = y===cur ? (i===2 ? addD(T0,-18) : T0) : `${y+1}-08-31`;   // Talhão C com estria atrasada, para demonstrar o alerta
      const meio = Math.ceil(t.ramais.length/2), grupos=[t.ramais.slice(0,meio), t.ramais.slice(meio)];
      let d = addD(`${y}-09-01`, i*3+1);
      while (d <= fim) {
        grupos.forEach((g,gi) => {
          const dg = addD(d,gi); if (dg > fim) return;
          const qtd = sum(g,arv), dias = Math.round(qtd/(470+r()*130)*2)/2 || 0.5;
          estrias.push({id:uid(),data:dg,talhao:t.id,ramais:g.map(x=>x.id),qtd,resineiro:t.res,dias});
          const rend = 0.16*(0.35+0.65*SAFRA[+dg.slice(5,7)-1])*(0.9+0.2*r());
          const k = dg.slice(0,7); agg[k] ??= {kg:{},est:0,dias:0};
          agg[k].kg[t.id] = (agg[k].kg[t.id]||0) + qtd*rend; agg[k].est += qtd; agg[k].dias += dias;
        });
        d = addD(d, 13 + Math.floor(r()*7));
      }
    });
  }
  const compradores = ['Resinas Vale Sul','Coop. Serra Verde','Breu Brasil Ltda'];
  let estoque = 0, n = 0;
  Object.keys(agg).sort().forEach(k => {
    const a = agg[k];
    let dc = k+'-27'; if (dc > T0) dc = addD(T0,-1);
    if (dc.slice(0,7) !== k) return;
    let kgMes = 0;
    for (const [tid,kg] of Object.entries(a.kg)) { const v=Math.round(kg/10)*10; const t=talhoes.find(x=>x.id===tid);
      producao.push({id:uid(),data:dc,talhao:tid,ramais:t.ramais.map(x=>x.id),kg:v}); kgMes+=v; }
    estoque += kgMes;
    const pd = (dia,cat,desc,v) => { const dt=`${k}-${dia}`; if (dt<=T0) caixa.push({id:uid(),data:dt,tipo:'d',cat,desc,valor:Math.round(v)}); };
    if (k.endsWith('-09')) pd('05','Arrendamento','Arrendamento da área',4500);
    pd('10','Pasta estimulante','Pasta estimulante',a.est*0.09);
    pd('15','Combustível/frete','Diesel e frete',300+r()*150);
    pd('20','Sacos e materiais','Sacos e materiais',kgMes*0.05+80);
    pd('27','Mão de obra','Diárias de resineiros',a.dias*170);
    n++;
    const dv = addD(dc,4);
    if (n%2===0 && estoque>500 && dv<=T0) {
      const kg = Math.round(estoque*0.9/10)*10;
      const nv={id:uid(),data:dv,comprador:compradores[n%3],kg,preco:+(5.3+r()*0.8).toFixed(2),fator,comNota:true,nf:null,recs:[]};
      nv.nf={numero:vendas.length+1,serie:1,data:dv,doc:'12.345.678/0001-90',cfop:'5101',chave:chave(),protocolo:'135260000'+(100000+vendas.length)};
      nv.recs.push({id:uid(),data:addD(dv,10)<=T0?addD(dv,10):dv,valor:r2(totalV(nv)*fator),forma:'Pix'});
      vendas.push(nv);
      estoque -= kg;
    }
  });
  if (estoque > 800) vendas.push({id:uid(),data:addD(T0,-5),comprador:'Coop. Serra Verde',kg:Math.round(estoque*0.6/10)*10,preco:6.05,fator,comNota:true,nf:null,recs:[],venc:addD(T0,15)});
  vendas.push({id:uid(),data:addD(T0,-2),comprador:'Seu Antônio (vizinho)',kg:150,preco:5.50,fator,comNota:false,nf:null,recs:[{id:uid(),data:addD(T0,-2),valor:400,forma:'Dinheiro'}],venc:addD(T0,10)});
  const ym = T0.slice(0,7);
  for (let i=0;i<6;i++){
    const m = addM(ym,i), mo = +m.slice(5,7);
    const sz = 0.5+0.5*SAFRA[mo-1];
    const pc = (dia,tipo,cat,desc,v) => { const dt=`${m}-${dia}`; if (dt>T0) comp.push({id:uid(),data:dt,tipo,cat,desc,valor:Math.round(v/10)*10}); };
    pc('05','d','Mão de obra','Diárias de resineiros',3900*sz);
    pc('10','d','Pasta estimulante','Pasta estimulante',950*sz);
    pc('15','d','Combustível/frete','Diesel e frete',400);
    if (mo===9) pc('05','d','Arrendamento','Arrendamento da área',4500);
    if (i%2===1) pc('22','r','Venda de resina','Venda prevista (~2.500 kg, líquido)',2500*5.9*fator*sz);
  }
  return {demo:true, regime, saldoInicial:9000, ideal:14,
    talhoes:talhoes.map(({res,...t})=>t), estrias, producao, vendas, caixa, comp, compradores:{}};
}

export { exemplo };
