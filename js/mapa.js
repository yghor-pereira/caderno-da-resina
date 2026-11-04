/* ---------- tabelas do banco ⇄ formato que as telas usam ----------
   Dois cadastros separados:
   - operacional: fazendas (área, NIRF/CIB, CAR), talhões, ramais, contagens, estrias, coletas e perdas;
   - financeiro (global): CPFs/CNPJs com suas inscrições estaduais e contas bancárias; lançamentos, compromissos,
     vendas e recebimentos. Lançamento tem a fazenda opcional; venda sempre sai de uma fazenda. */
import { ativas } from './local.js';
import { catIrDe } from './regras.js';

const porCod = (a,b) => String(a||'').localeCompare(String(b||''), 'pt-BR', {numeric:true});
const padraoDe = L => { const es = ativas(L,'entidades_fiscais'); return (es.find(e=>e.padrao) || es[0])?.id || null; };
/* quem faturou: o gravado; senão o CPF/CNPJ padrão (mesma regra do gatilho do banco, para o app antigo) */
const resolverEntidade = L => { const p = padraoDe(L); return l => l.entidade_id || p; };

/* monta o objeto S a partir das linhas do cache.
   {fazenda}: só aquela fazenda (operacional e financeiro dela); sem fazenda, todas, e o financeiro inclui o que não tem fazenda.
   {entidade}: só o financeiro daquele CPF/CNPJ (produção, floresta e perdas não mudam). */
function montarDados(L, {fazenda=null, entidade=null}={}){
  const fazAtivas = ativas(L,'fazendas').sort((a,b)=>porCod(a.nome,b.nome));
  const fs = fazenda ? fazAtivas.filter(f=>f.id===fazenda) : fazAtivas, set = new Set(fs.map(f=>f.id));
  const de = (tabela, campo, valor) => ativas(L, tabela).filter(l=>l[campo]===valor);
  const daFaz = tabela => ativas(L, tabela).filter(l=>set.has(l.fazenda_id));
  const ent = resolverEntidade(L);
  const talhoes = daFaz('talhoes').sort((a,b)=>porCod(a.nome,b.nome)).map(t=>({id:t.id, nome:t.nome, fazenda:t.fazenda_id,
    ramais: de('ramais','talhao_id',t.id).sort((a,b)=>porCod(a.cod,b.cod)).map(r=>({id:r.id, cod:r.cod,
      hist: de('contagens','ramal_id',r.id).map(h=>({id:h.id, data:h.data, arv:+h.arvores, motivo:h.motivo})).sort((a,b)=>a.data.localeCompare(b.data))
    })).filter(r=>r.hist.length)}));
  const tals = new Set(talhoes.map(t=>t.id));
  const op = l => tals.has(l.talhao_id);
  const lanc = l => ({id:l.id, data:l.data, tipo:l.tipo, cat:l.cat, desc:l.descr, valor:+l.valor, fazenda:l.fazenda_id||null, entidade:ent(l),
    competencia:l.data_competencia||l.data, tipoDoc:l.tipo_documento||null, numDoc:l.numero_documento||'', contraparteDoc:l.contraparte_documento||'',
    contraparteNome:l.contraparte_nome||'', catIr:l.categoria_irpf||catIrDe({tipo:l.tipo, cat:l.cat}), conta:l.conta_bancaria_id||null, anexo:l.anexo_url||null});
  const daFazenda = x => !fazenda || x.fazenda===fazenda;
  const todas = {
    vendas: ativas(L,'vendas').map(v=>({id:v.id, data:v.data, comprador:v.comprador, kg:+v.kg, preco:+v.preco, fator:+v.fator,
      comNota:v.com_nota, nf:v.nf||null, venc:v.venc||undefined, fazenda:v.fazenda_id, entidade:ent(v), inscricao:v.inscricao_id||null,
      tipoDoc:v.tipo_documento||null, numDoc:v.numero_documento||'',
      recs: de('recebimentos','venda_id',v.id).map(r=>({id:r.id, data:r.data, valor:+r.valor, forma:r.forma, conta:r.conta_bancaria_id||null}))})).filter(daFazenda),
    caixa: ativas(L,'lancamentos').map(lanc).filter(daFazenda),
    comp: ativas(L,'compromissos').map(lanc).filter(daFazenda)
  };
  /* `todas`: só o filtro de fazenda (estoque não depende de quem faturou); as listas principais também filtram o CPF/CNPJ */
  const filtro = x => !entidade || x.entidade===entidade;
  const ents = ativas(L,'entidades_fiscais'), regEnt = ents.find(e=>e.id===(entidade || padraoDe(L)));
  /* saldo inicial: o das contas bancárias (do CPF/CNPJ escolhido). Com filtro de fazenda não há saldo de partida:
     o saldo mostra só as entradas e saídas dela. */
  const contas = ativas(L,'contas_bancarias').filter(c=>!entidade || c.entidade_id===entidade);
  return {
    fazenda, entidade, demo: fs.some(z=>z.demo), regime: regEnt?.previdencia || 'funrural',
    saldoInicial: fazenda ? 0 : contas.reduce((t,c)=>t + +(c.saldo_inicial||0), 0), ideal: fs[0]?.intervalo_ideal||14,
    fazendas: fazAtivas.map(z=>({id:z.id, nome:z.nome, uf:z.uf, municipio:z.municipio})),
    talhoes,
    estrias: daFaz('estrias').filter(op).map(e=>({id:e.id, data:e.data, talhao:e.talhao_id, ramais:e.ramais, qtd:+e.qtd, resineiro:e.resineiro, dias:+e.dias})),
    producao: daFaz('coletas').filter(op).map(p=>({id:p.id, data:p.data, talhao:p.talhao_id, ramais:p.ramais, kg:+p.kg})),
    perdas: daFaz('perdas').map(p=>({id:p.id, data:p.data, fazenda:p.fazenda_id, talhao:p.talhao_id||null, kg:+p.kg, motivo:p.motivo, obs:p.obs||''})),
    vendas: todas.vendas.filter(filtro), caixa: todas.caixa.filter(filtro), comp: todas.comp.filter(filtro), todas,
    compradores: Object.fromEntries(ativas(L,'compradores').map(c=>[c.nome, {id:c.id, doc:c.doc, dest:c.dest||null}]))
  };
}

/* um conversor por tabela: as telas gravam com eles */
const nulo = x => x || null;
const linha = {
  entidade: e => ({id:e.id, tipo:e.tipo, nome:e.nome, apelido:e.apelido||'', cor:e.cor, documento:e.documento||'', regime:e.regime,
    previdencia:e.previdencia||'funrural', padrao:!!e.padrao, ativo:e.ativo!==false}),
  inscricao: i => ({id:i.id, entidade_id:i.entidade, ie:i.ie, uf:i.uf, municipio:i.municipio||'', descricao:i.descricao||'', ativo:i.ativo!==false}),
  conta: c => ({id:c.id, entidade_id:c.entidade, banco:c.banco||'', agencia:c.agencia||'', conta:c.conta||'', apelido:c.apelido||'',
    saldo_inicial:+c.saldoInicial||0, ativo:c.ativo!==false}),
  /* a fazenda é o imóvel; a IE ficou com o CPF/CNPJ (a coluna só é preenchida por fazendas antigas) */
  fazenda: (f, d={}) => ({id:f.id, nome:f.nome, ie:nulo(f.ie), doc:f.doc||'', municipio:f.municipio||'', uf:f.uf,
    area_ha:f.area_ha ?? null, nirf_cib:f.nirf_cib||'', car:f.car||'',
    regime:d.regime||'funrural', saldo_inicial:0, intervalo_ideal:d.ideal||14, demo:!!d.demo, demo_gerado_em: f.demo_gerado_em ?? null}),
  talhao: (t, fid) => ({id:t.id, fazenda_id:fid, nome:t.nome}),
  ramal: (r, tid) => ({id:r.id, talhao_id:tid, cod:r.cod}),
  contagem: (h, rid) => ({id:h.id, ramal_id:rid, data:h.data, arvores:h.arv, motivo:h.motivo}),
  estria: (e, fid) => ({id:e.id, fazenda_id:fid, talhao_id:e.talhao, data:e.data, ramais:e.ramais, qtd:e.qtd, resineiro:e.resineiro, dias:e.dias}),
  coleta: (p, fid) => ({id:p.id, fazenda_id:fid, talhao_id:p.talhao, data:p.data, ramais:p.ramais, kg:p.kg}),
  perda: (p, fid) => ({id:p.id, fazenda_id:p.fazenda||fid, talhao_id:nulo(p.talhao), data:p.data, kg:p.kg, motivo:p.motivo||'', obs:p.obs||''}),
  venda: (v, fid) => ({id:v.id, fazenda_id:v.fazenda||fid, entidade_id:nulo(v.entidade), inscricao_id:nulo(v.inscricao), data:v.data, comprador:v.comprador,
    kg:v.kg, preco:v.preco, fator:v.fator, com_nota:!!v.comNota, nf:v.nf||null, venc:v.venc||null, tipo_documento:nulo(v.tipoDoc), numero_documento:v.numDoc||''}),
  recebimento: (r, vid) => ({id:r.id, venda_id:vid, data:r.data, valor:r.valor, forma:r.forma, conta_bancaria_id:nulo(r.conta)}),
  /* `data` é a do pagamento (regime de caixa); a competência, quando não informada, é a mesma. Fazenda opcional. */
  lancamento: (x, fid=null) => ({id:x.id, fazenda_id:x.fazenda!==undefined ? x.fazenda : fid, entidade_id:nulo(x.entidade), data:x.data, tipo:x.tipo, cat:x.cat,
    descr:x.desc||'', valor:x.valor, data_competencia:x.competencia||x.data, tipo_documento:nulo(x.tipoDoc), numero_documento:x.numDoc||'',
    contraparte_documento:x.contraparteDoc||'', contraparte_nome:x.contraparteNome||'', categoria_irpf:x.catIr||catIrDe(x),
    conta_bancaria_id:nulo(x.conta), anexo_url:nulo(x.anexo)}),
  /* compradores são globais */
  comprador: (nome, c) => ({id:c.id, fazenda_id:null, nome, doc:c.doc||'', dest:c.dest||null})
};

/* converte uma fazenda inteira no formato das telas (ex.: dados de exemplo) em linhas por tabela */
function dadosParaLinhas(d, fid){
  return {
    talhoes: d.talhoes.map(t=>linha.talhao(t,fid)),
    ramais: d.talhoes.flatMap(t=>t.ramais.map(r=>linha.ramal(r,t.id))),
    contagens: d.talhoes.flatMap(t=>t.ramais.flatMap(r=>r.hist.map(h=>linha.contagem(h,r.id)))),
    estrias: d.estrias.map(e=>linha.estria(e,fid)),
    coletas: d.producao.map(p=>linha.coleta(p,fid)),
    perdas: (d.perdas||[]).map(p=>linha.perda(p,fid)),
    vendas: d.vendas.map(v=>linha.venda(v,fid)),
    recebimentos: d.vendas.flatMap(v=>v.recs.map(r=>linha.recebimento(r,v.id))),
    lancamentos: d.caixa.map(x=>linha.lancamento(x,fid)),
    compromissos: d.comp.map(x=>linha.lancamento(x,fid)),
    compradores: Object.entries(d.compradores||{}).map(([nome,c])=>linha.comprador(nome,c))
  };
}

/* registros ligados a uma fazenda ou a um talhão, para apagar em lote */
const ativosDe = (L, tabela, campo, ids) => ativas(L, tabela).filter(l=>ids.has(l[campo]));
function linhasDoTalhao(L, tid){
  const t = new Set([tid]);
  const ramais = ativosDe(L,'ramais','talhao_id',t), rids = new Set(ramais.map(r=>r.id));
  return [['talhoes',tid], ...ramais.map(r=>['ramais',r.id]), ...ativosDe(L,'contagens','ramal_id',rids).map(c=>['contagens',c.id]),
    ...ativosDe(L,'estrias','talhao_id',t).map(e=>['estrias',e.id]), ...ativosDe(L,'coletas','talhao_id',t).map(c=>['coletas',c.id]),
    ...ativosDe(L,'perdas','talhao_id',t).map(p=>['perdas',p.id])];
}
/* registros da fazenda: operação, vendas e lançamentos ligados a ela. O cadastro da fazenda fica. */
function linhasDaFazenda(L, fid){
  const f = new Set([fid]);
  const tals = ativosDe(L,'talhoes','fazenda_id',f), vendas = ativosDe(L,'vendas','fazenda_id',f), vids = new Set(vendas.map(v=>v.id));
  const doTalhao = tals.flatMap(t=>linhasDoTalhao(L, t.id));
  const visto = new Set(doTalhao.map(([t,id])=>t+id));
  const soltas = ['estrias','coletas','perdas'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).filter(l=>!visto.has(tab+l.id)).map(l=>[tab,l.id]));
  return [...doTalhao, ...soltas, ...vendas.map(v=>['vendas',v.id]), ...ativosDe(L,'recebimentos','venda_id',vids).map(r=>['recebimentos',r.id]),
    ...['lancamentos','compromissos'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).map(l=>[tab,l.id]))];
}
const fazendasDe = L => ativas(L,'fazendas').sort((a,b)=>porCod(a.nome,b.nome)).map(f=>({id:f.id, nome:f.nome, ie:f.ie||null, doc:f.doc,
  municipio:f.municipio, uf:f.uf, area_ha:f.area_ha==null?null:+f.area_ha, nirf_cib:f.nirf_cib||'', car:f.car||'', ideal:f.intervalo_ideal||14,
  regime:f.regime||'funrural', demo:f.demo, demo_gerado_em:f.demo_gerado_em, _erro:f._erro}));

/* saldo de cada conta: saldo inicial + lançamentos pagos + recebimentos de vendas, de todas as fazendas */
function saldosPorConta(L){
  const s = {};
  const add = (conta, ent, v) => { const k = conta || 'sem:'+ent; s[k] = (s[k]||0) + v; };
  const ent = resolverEntidade(L), ents = {};
  for (const v of ativas(L,'vendas')) ents[v.id] = ent(v);
  for (const l of ativas(L,'lancamentos')) add(l.conta_bancaria_id, ent(l), l.tipo==='r' ? +l.valor : -l.valor);
  for (const r of ativas(L,'recebimentos')) if (ents[r.venda_id]) add(r.conta_bancaria_id, ents[r.venda_id], +r.valor);
  return s;
}
/* CPFs e CNPJs, o padrão primeiro, com inscrições e contas (saldo de hoje de cada conta e o que entrou ou saiu sem conta) */
function entidadesDe(L){
  const mov = saldosPorConta(L);
  return ativas(L,'entidades_fiscais').sort((a,b)=>(b.padrao-a.padrao) || porCod(a.nome,b.nome)).map(e=>({id:e.id, tipo:e.tipo, nome:e.nome,
    apelido:e.apelido||'', cor:e.cor||'#2f6b4f', documento:e.documento||'', regime:e.regime, previdencia:e.previdencia||'funrural',
    padrao:!!e.padrao, ativo:e.ativo!==false, _erro:e._erro,
    inscricoes: ativas(L,'inscricoes_estaduais').filter(i=>i.entidade_id===e.id).sort((a,b)=>porCod(a.uf+a.ie,b.uf+b.ie))
      .map(i=>({id:i.id, entidade:e.id, ie:i.ie, uf:i.uf, municipio:i.municipio||'', descricao:i.descricao||'', ativo:i.ativo!==false, _erro:i._erro})),
    contas: ativas(L,'contas_bancarias').filter(c=>c.entidade_id===e.id).sort((a,b)=>porCod(a.apelido||a.banco, b.apelido||b.banco))
      .map(c=>({id:c.id, entidade:e.id, banco:c.banco, agencia:c.agencia, conta:c.conta, apelido:c.apelido, ativo:c.ativo!==false,
        saldoInicial:+c.saldo_inicial||0, saldo:(+c.saldo_inicial||0) + (mov[c.id]||0)})),
    semConta: mov['sem:'+e.id] || 0}));
}

export { montarDados, dadosParaLinhas, linha, linhasDaFazenda, linhasDoTalhao, fazendasDe, entidadesDe, resolverEntidade, saldosPorConta };
