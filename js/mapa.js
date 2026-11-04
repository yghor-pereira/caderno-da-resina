/* ---------- tabelas do banco ⇄ formato que as telas usam ----------
   Propriedade (imóvel) → fazendas (cada uma é uma Inscrição Estadual, com talhões e ramais).
   CPFs/CNPJs (entidades fiscais) se ligam às inscrições pelos vínculos. A produção é da propriedade;
   vendas, lançamentos e compromissos dizem por qual inscrição e por qual CPF/CNPJ foram faturados. */
import { ativas } from './local.js';
import { catIrDe } from './regras.js';

const porCod = (a,b) => a.localeCompare(b, 'pt-BR', {numeric:true});

/* vínculos ativos de uma inscrição, o padrão primeiro */
const vinculosDe = (L, fid) => ativas(L,'vinculos').filter(v=>v.fazenda_id===fid)
  .map(v=>({id:v.id, fazenda:v.fazenda_id, entidade:v.entidade_id, percentual:+v.percentual, condicao:v.condicao, padrao:!!v.padrao,
    inicio:v.vigencia_inicio||null, fim:v.vigencia_fim||null}))
  .sort((a,b)=>(b.padrao-a.padrao) || a.entidade.localeCompare(b.entidade));
const entidadePadrao = L => ativas(L,'entidades_fiscais').find(e=>e.padrao)?.id || null;
/* quem faturou um registro: o que foi gravado; senão o vínculo padrão da inscrição; senão o CPF/CNPJ padrão
   (é a mesma regra do gatilho do banco, para registros de aparelhos antigos) */
function resolverEntidade(L){
  const padrao = entidadePadrao(L), porFaz = {};
  return l => l.entidade_id || (porFaz[l.fazenda_id] ??= vinculosDe(L, l.fazenda_id).find(v=>v.padrao)?.entidade || padrao);
}

/* monta o objeto S de uma propriedade (uma ou mais inscrições) a partir das linhas do cache.
   {entidade}: mostra só o financeiro de um CPF/CNPJ (produção e floresta não mudam) */
function montarDados(L, fids, {entidade=null}={}){
  fids = [].concat(fids);
  const fs = fids.map(id=>L.linhas.fazendas?.[id]).filter(Boolean), f = fs[0], set = new Set(fids);
  const de = (tabela, campo, valor) => ativas(L, tabela).filter(l=>l[campo]===valor);
  const daProp = tabela => ativas(L, tabela).filter(l=>set.has(l.fazenda_id));
  const ent = resolverEntidade(L);
  const talhoes = daProp('talhoes').sort((a,b)=>porCod(a.nome,b.nome)).map(t=>({id:t.id, nome:t.nome, fazenda:t.fazenda_id,
    ramais: de('ramais','talhao_id',t.id).sort((a,b)=>porCod(a.cod,b.cod)).map(r=>({id:r.id, cod:r.cod,
      hist: de('contagens','ramal_id',r.id).map(h=>({id:h.id, data:h.data, arv:+h.arvores, motivo:h.motivo})).sort((a,b)=>a.data.localeCompare(b.data))
    })).filter(r=>r.hist.length)}));
  const tals = new Set(talhoes.map(t=>t.id));
  const op = l => tals.has(l.talhao_id);
  const lanc = l => ({id:l.id, data:l.data, tipo:l.tipo, cat:l.cat, desc:l.descr, valor:+l.valor, fazenda:l.fazenda_id, entidade:ent(l),
    competencia:l.data_competencia||l.data, tipoDoc:l.tipo_documento||null, numDoc:l.numero_documento||'', contraparteDoc:l.contraparte_documento||'',
    contraparteNome:l.contraparte_nome||'', catIr:l.categoria_irpf||catIrDe({tipo:l.tipo, cat:l.cat}), conta:l.conta_bancaria_id||null, anexo:l.anexo_url||null});
  const todas = {
    vendas: daProp('vendas').map(v=>({id:v.id, data:v.data, comprador:v.comprador, kg:+v.kg, preco:+v.preco, fator:+v.fator,
      comNota:v.com_nota, nf:v.nf||null, venc:v.venc||undefined, fazenda:v.fazenda_id, entidade:ent(v), tipoDoc:v.tipo_documento||null, numDoc:v.numero_documento||'',
      recs: de('recebimentos','venda_id',v.id).map(r=>({id:r.id, data:r.data, valor:+r.valor, forma:r.forma, conta:r.conta_bancaria_id||null}))})),
    caixa: daProp('lancamentos').map(lanc),
    comp: daProp('compromissos').map(lanc)
  };
  const filtro = x => !entidade || x.entidade===entidade;
  /* saldo inicial: de cada inscrição, conta para o CPF/CNPJ padrão dela (a soma por CPF/CNPJ fecha com o total) */
  const padraoFaz = Object.fromEntries(fs.map(z=>[z.id, ent({fazenda_id:z.id})]));
  return {
    id: f?.propriedade_id || f?.id, entidade, demo: fs.some(z=>z.demo), regime: f?.regime||'funrural',
    saldoInicial: fs.filter(z=>filtro({entidade:padraoFaz[z.id]})).reduce((t,z)=>t+ +(z.saldo_inicial||0), 0), ideal: f?.intervalo_ideal||14,
    fazendas: fs.map(z=>({id:z.id, nome:z.nome, ie:z.ie, uf:z.uf, regime:z.regime||'funrural', vinculos:vinculosDe(L, z.id)})),
    talhoes,
    estrias: daProp('estrias').filter(op).map(e=>({id:e.id, data:e.data, talhao:e.talhao_id, ramais:e.ramais, qtd:+e.qtd, resineiro:e.resineiro, dias:+e.dias})),
    producao: daProp('coletas').filter(op).map(p=>({id:p.id, data:p.data, talhao:p.talhao_id, ramais:p.ramais, kg:+p.kg})),
    vendas: todas.vendas.filter(filtro), caixa: todas.caixa.filter(filtro), comp: todas.comp.filter(filtro), todas,
    compradores: Object.fromEntries(daProp('compradores').map(c=>[c.nome, {id:c.id, doc:c.doc, dest:c.dest||null, fazenda:c.fazenda_id}]))
  };
}

/* um conversor por tabela: as telas gravam com eles */
const nulo = x => x || null;
const linha = {
  propriedade: p => ({id:p.id, nome:p.nome, municipio:p.municipio||'', uf:p.uf, area_ha:p.area_ha ?? null, nirf_cib:p.nirf_cib||'', car:p.car||''}),
  entidade: e => ({id:e.id, tipo:e.tipo, nome:e.nome, apelido:e.apelido||'', cor:e.cor, documento:e.documento||'', regime:e.regime,
    padrao:!!e.padrao, ativo:e.ativo!==false}),
  vinculo: v => ({id:v.id, fazenda_id:v.fazenda, entidade_id:v.entidade, percentual:v.percentual ?? 100, condicao:v.condicao||'PROPRIETARIO',
    padrao:!!v.padrao, vigencia_inicio:nulo(v.inicio), vigencia_fim:nulo(v.fim)}),
  conta: c => ({id:c.id, entidade_id:c.entidade, banco:c.banco||'', agencia:c.agencia||'', conta:c.conta||'', apelido:c.apelido||''}),
  fazenda: (f, d) => ({id:f.id, propriedade_id:nulo(f.propriedade_id), nome:f.nome, ie:f.ie, doc:f.doc||'', municipio:f.municipio, uf:f.uf,
    regime:d.regime, saldo_inicial:d.saldoInicial||0, intervalo_ideal:d.ideal||14, demo:!!d.demo,
    demo_gerado_em: f.demo_gerado_em ?? null}),
  talhao: (t, fid) => ({id:t.id, fazenda_id:fid, nome:t.nome}),
  ramal: (r, tid) => ({id:r.id, talhao_id:tid, cod:r.cod}),
  contagem: (h, rid) => ({id:h.id, ramal_id:rid, data:h.data, arvores:h.arv, motivo:h.motivo}),
  estria: (e, fid) => ({id:e.id, fazenda_id:fid, talhao_id:e.talhao, data:e.data, ramais:e.ramais, qtd:e.qtd, resineiro:e.resineiro, dias:e.dias}),
  coleta: (p, fid) => ({id:p.id, fazenda_id:fid, talhao_id:p.talhao, data:p.data, ramais:p.ramais, kg:p.kg}),
  venda: (v, fid) => ({id:v.id, fazenda_id:v.fazenda||fid, entidade_id:nulo(v.entidade), data:v.data, comprador:v.comprador, kg:v.kg, preco:v.preco, fator:v.fator,
    com_nota:!!v.comNota, nf:v.nf||null, venc:v.venc||null, tipo_documento:nulo(v.tipoDoc), numero_documento:v.numDoc||''}),
  recebimento: (r, vid) => ({id:r.id, venda_id:vid, data:r.data, valor:r.valor, forma:r.forma, conta_bancaria_id:nulo(r.conta)}),
  /* `data` é a do pagamento (regime de caixa); a competência, quando não informada, é a mesma */
  lancamento: (x, fid) => ({id:x.id, fazenda_id:x.fazenda||fid, entidade_id:nulo(x.entidade), data:x.data, tipo:x.tipo, cat:x.cat, descr:x.desc||'', valor:x.valor,
    data_competencia:x.competencia||x.data, tipo_documento:nulo(x.tipoDoc), numero_documento:x.numDoc||'', contraparte_documento:x.contraparteDoc||'',
    contraparte_nome:x.contraparteNome||'', categoria_irpf:x.catIr||catIrDe(x), conta_bancaria_id:nulo(x.conta), anexo_url:nulo(x.anexo)}),
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
/* registros da fazenda (inscrição); o cadastro dela e os vínculos com CPFs/CNPJs ficam */
function linhasDaFazenda(L, fid){
  const f = new Set([fid]);
  const tals = ativosDe(L,'talhoes','fazenda_id',f), vendas = ativosDe(L,'vendas','fazenda_id',f), vids = new Set(vendas.map(v=>v.id));
  const doTalhao = tals.flatMap(t=>linhasDoTalhao(L, t.id));
  const visto = new Set(doTalhao.map(([t,id])=>t+id));
  const soltas = ['estrias','coletas'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).filter(l=>!visto.has(tab+l.id)).map(l=>[tab,l.id]));
  return [...doTalhao, ...soltas, ...vendas.map(v=>['vendas',v.id]), ...ativosDe(L,'recebimentos','venda_id',vids).map(r=>['recebimentos',r.id]),
    ...['lancamentos','compromissos','compradores'].flatMap(tab=>ativosDe(L,tab,'fazenda_id',f).map(l=>[tab,l.id]))];
}
/* fazendas (inscrições) do usuário */
const fazendasDe = L => ativas(L,'fazendas').sort((a,b)=>porCod(a.nome,b.nome) || porCod(a.ie,b.ie)).map(f=>({id:f.id, nome:f.nome, ie:f.ie, doc:f.doc,
  municipio:f.municipio, uf:f.uf, propriedade_id:f.propriedade_id||null, regime:f.regime||'funrural', saldoInicial:+(f.saldo_inicial||0),
  demo:f.demo, demo_gerado_em:f.demo_gerado_em, _erro:f._erro, vinculos:vinculosDe(L, f.id)}));
/* CPFs e CNPJs: o padrão primeiro */
const entidadesDe = L => ativas(L,'entidades_fiscais').sort((a,b)=>(b.padrao-a.padrao) || porCod(a.nome,b.nome)).map(e=>({id:e.id, tipo:e.tipo, nome:e.nome,
  apelido:e.apelido||'', cor:e.cor||'#2f6b4f', documento:e.documento||'', regime:e.regime, padrao:!!e.padrao, ativo:e.ativo!==false, _erro:e._erro,
  contas: ativas(L,'contas_bancarias').filter(c=>c.entidade_id===e.id).map(c=>({id:c.id, entidade:e.id, banco:c.banco, agencia:c.agencia, conta:c.conta, apelido:c.apelido}))}));
/* propriedades com suas inscrições e os dados montados. Fazenda sem propriedade (antes da migração no
   servidor chegar ao aparelho) aparece como uma propriedade própria, com o id dela (virtual) */
function propriedadesDe(L, op={}){
  const fs = fazendasDe(L), ps = ativas(L,'propriedades'), ids = new Set(ps.map(p=>p.id));
  const lista = [...ps.map(p=>({id:p.id, nome:p.nome, municipio:p.municipio, uf:p.uf, area_ha:p.area_ha==null?null:+p.area_ha, nirf_cib:p.nirf_cib||'', car:p.car||'',
      _erro:p._erro, fazendas:fs.filter(f=>f.propriedade_id===p.id)})),
    ...fs.filter(f=>!ids.has(f.propriedade_id)).map(f=>({id:f.id, virtual:true, nome:f.nome, municipio:f.municipio, uf:f.uf, area_ha:null, nirf_cib:'', car:'', fazendas:[f]}))];
  return lista.filter(p=>p.fazendas.length || !p.virtual).sort((a,b)=>porCod(a.nome,b.nome))
    .map(p=>({...p, dados: p.fazendas.length ? montarDados(L, p.fazendas.map(f=>f.id), op) : null}));
}

export { montarDados, dadosParaLinhas, linha, linhasDaFazenda, linhasDoTalhao, fazendasDe, entidadesDe, propriedadesDe, vinculosDe, resolverEntidade };
