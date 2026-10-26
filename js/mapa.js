/* ---------- tabelas do banco ⇄ formato que as telas usam ---------- */
import { ativas } from './local.js';

const porCod = (a,b) => a.localeCompare(b, 'pt-BR', {numeric:true});

/* monta o objeto S de uma fazenda a partir das linhas do cache */
function montarDados(L, fid){
  const f = L.linhas.fazendas?.[fid];
  const de = (tabela, campo, valor) => ativas(L, tabela).filter(l=>l[campo]===valor);
  const talhoes = de('talhoes','fazenda_id',fid).sort((a,b)=>porCod(a.nome,b.nome)).map(t=>({id:t.id, nome:t.nome,
    ramais: de('ramais','talhao_id',t.id).sort((a,b)=>porCod(a.cod,b.cod)).map(r=>({id:r.id, cod:r.cod,
      hist: de('contagens','ramal_id',r.id).map(h=>({id:h.id, data:h.data, arv:+h.arvores, motivo:h.motivo})).sort((a,b)=>a.data.localeCompare(b.data))
    })).filter(r=>r.hist.length)}));
  const tals = new Set(talhoes.map(t=>t.id));
  const op = l => tals.has(l.talhao_id);
  const lanc = l => ({id:l.id, data:l.data, tipo:l.tipo, cat:l.cat, desc:l.descr, valor:+l.valor});
  return {
    id: fid, demo: !!f?.demo, regime: f?.regime||'funrural', saldoInicial: +(f?.saldo_inicial||0), ideal: f?.intervalo_ideal||14,
    talhoes,
    estrias: de('estrias','fazenda_id',fid).filter(op).map(e=>({id:e.id, data:e.data, talhao:e.talhao_id, ramais:e.ramais, qtd:+e.qtd, resineiro:e.resineiro, dias:+e.dias})),
    producao: de('coletas','fazenda_id',fid).filter(op).map(p=>({id:p.id, data:p.data, talhao:p.talhao_id, ramais:p.ramais, kg:+p.kg})),
    vendas: de('vendas','fazenda_id',fid).map(v=>({id:v.id, data:v.data, comprador:v.comprador, kg:+v.kg, preco:+v.preco, fator:+v.fator,
      comNota:v.com_nota, nf:v.nf||null, venc:v.venc||undefined,
      recs: de('recebimentos','venda_id',v.id).map(r=>({id:r.id, data:r.data, valor:+r.valor, forma:r.forma}))})),
    caixa: de('lancamentos','fazenda_id',fid).map(lanc),
    comp: de('compromissos','fazenda_id',fid).map(lanc),
    compradores: Object.fromEntries(de('compradores','fazenda_id',fid).map(c=>[c.nome, {id:c.id, doc:c.doc, dest:c.dest||null}]))
  };
}

/* um conversor por tabela: as telas gravam com eles */
const linha = {
  fazenda: (f, d) => ({id:f.id, nome:f.nome, ie:f.ie, doc:f.doc||'', municipio:f.municipio, uf:f.uf,
    regime:d.regime, saldo_inicial:d.saldoInicial||0, intervalo_ideal:d.ideal||14, demo:!!d.demo,
    demo_gerado_em: f.demo_gerado_em ?? null}),
  talhao: (t, fid) => ({id:t.id, fazenda_id:fid, nome:t.nome}),
  ramal: (r, tid) => ({id:r.id, talhao_id:tid, cod:r.cod}),
  contagem: (h, rid) => ({id:h.id, ramal_id:rid, data:h.data, arvores:h.arv, motivo:h.motivo}),
  estria: (e, fid) => ({id:e.id, fazenda_id:fid, talhao_id:e.talhao, data:e.data, ramais:e.ramais, qtd:e.qtd, resineiro:e.resineiro, dias:e.dias}),
  coleta: (p, fid) => ({id:p.id, fazenda_id:fid, talhao_id:p.talhao, data:p.data, ramais:p.ramais, kg:p.kg}),
  venda: (v, fid) => ({id:v.id, fazenda_id:fid, data:v.data, comprador:v.comprador, kg:v.kg, preco:v.preco, fator:v.fator,
    com_nota:!!v.comNota, nf:v.nf||null, venc:v.venc||null}),
  recebimento: (r, vid) => ({id:r.id, venda_id:vid, data:r.data, valor:r.valor, forma:r.forma}),
  lancamento: (x, fid) => ({id:x.id, fazenda_id:fid, data:x.data, tipo:x.tipo, cat:x.cat, descr:x.desc||'', valor:x.valor}),
  comprador: (nome, c, fid) => ({id:c.id, fazenda_id:fid, nome, doc:c.doc||'', dest:c.dest||null})
};

/* converte uma fazenda inteira no formato das telas (ex.: dados de exemplo) em linhas por tabela */
function dadosParaLinhas(d, fid){
  return {
    talhoes: d.talhoes.map(t=>linha.talhao(t,fid)),
    ramais: d.talhoes.flatMap(t=>t.ramais.map(r=>linha.ramal(r,t.id))),
    contagens: d.talhoes.flatMap(t=>t.ramais.flatMap(r=>r.hist.map(h=>linha.contagem(h,r.id)))),
    estrias: d.estrias.map(e=>linha.estria(e,fid)),
    coletas: d.producao.map(p=>linha.coleta(p,fid)),
    vendas: d.vendas.map(v=>linha.venda(v,fid)),
    recebimentos: d.vendas.flatMap(v=>v.recs.map(r=>linha.recebimento(r,v.id))),
    lancamentos: d.caixa.map(x=>linha.lancamento(x,fid)),
    compromissos: d.comp.map(x=>linha.lancamento(x,fid)),
    compradores: Object.entries(d.compradores||{}).map(([nome,c])=>linha.comprador(nome,c,fid))
  };
}

/* registros ligados a uma fazenda ou a um talhão, para apagar em lote */
const ativosDe = (L, tabela, campo, ids) => ativas(L, tabela).filter(l=>ids.has(l[campo]));
function linhasDoTalhao(L, tid){
  const t = new Set([tid]);
  const ramais = ativosDe(L,'ramais','talhao_id',t), rids = new Set(ramais.map(r=>r.id));
  return [['talhoes',tid], ...ramais.map(r=>['ramais',r.id]), ...ativosDe(L,'contagens','ramal_id',rids).map(c=>['contagens',c.id]),
    ...ativosDe(L,'estrias','talhao_id',t).map(e=>['estrias',e.id]), ...ativosDe(L,'coletas','talhao_id',t).map(c=>['coletas',c.id])];
}
function linhasDaFazenda(L, fid){
  const f = new Set([fid]);
  const tals = ativosDe(L,'talhoes','fazenda_id',f), vendas = ativosDe(L,'vendas','fazenda_id',f), vids = new Set(vendas.map(v=>v.id));
  const doTalhao = tals.flatMap(t=>linhasDoTalhao(L, t.id));
  const visto = new Set(doTalhao.map(([t,id])=>t+id));
  const soltas = ['estrias','coletas'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).filter(l=>!visto.has(tab+l.id)).map(l=>[tab,l.id]));
  return [...doTalhao, ...soltas, ...vendas.map(v=>['vendas',v.id]), ...ativosDe(L,'recebimentos','venda_id',vids).map(r=>['recebimentos',r.id]),
    ...['lancamentos','compromissos','compradores'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).map(l=>[tab,l.id]))];
}
/* fazendas do usuário no formato das telas */
const fazendasDe = L => ativas(L,'fazendas').sort((a,b)=>porCod(a.nome,b.nome)).map(f=>({id:f.id, nome:f.nome, ie:f.ie, doc:f.doc, municipio:f.municipio, uf:f.uf,
  demo:f.demo, demo_gerado_em:f.demo_gerado_em, _erro:f._erro, dados:montarDados(L, f.id)}));

export { montarDados, dadosParaLinhas, linha, linhasDaFazenda, linhasDoTalhao, fazendasDe };
