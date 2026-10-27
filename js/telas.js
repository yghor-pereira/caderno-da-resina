import { brl, num, plural, esc, hoje, addD, diff, fdata, MES_SAFRA, safraIni, safraLbl, mIdx, sum } from './util.js';
import { MERCADO, DICAS, SAFRA, CATS_D, CATS_R, ATRASO_CRITICO, FORMAS, totalV, recV, saldoV, statusRec, chave, CORES, REG, fat, liqV, livreV, livre, pctRec, arv, painT, talById, ramsDe, S, dados, comFazenda, inSafra, totPaineis, tot, estoque, saldoAtual, nfPend, fluxo, ramStats, statusTalhoes } from './regras.js';
import { chart, legend, delta } from './graficos.js';
import { UFS } from './nfe.js';
import { MODS, MOD_PADRAO, usuario, fazAtual, mod, CUR, E, EX, SES, nPendentes, listaErros } from './estado.js';

const safras = () => [...new Set([CUR, ...S.producao.map(p=>safraIni(p.data)), ...S.estrias.map(e=>safraIni(e.data))])].sort();
const chipsSafra = () => `<div class="chips">${safras().map(y=>`<button type="button" data-safra="${y}" aria-pressed="${y===E.safraSel}">Safra ${safraLbl(y)}</button>`).join('')}</div>`;
/* links "editar · excluir" de um registro; excluir pede confirmação no próprio lugar */
const acoes = (tab, id, {editar=false, aviso=''}={}) => E.confirmar===tab+':'+id
  ? `${aviso?`<span class="down">${aviso}</span> `:''}<button type="button" class="lnk perigo" data-excluir="${tab}:${id}" data-ok="1">confirmar exclusão</button> · <button type="button" class="lnk" data-excluir="">cancelar</button>`
  : `${editar?`<button type="button" class="lnk" data-editar="${tab}:${id}">editar</button> · `:''}<button type="button" class="lnk" data-excluir="${tab}:${id}">excluir</button>`;
const editando = (tab, id) => E.editar===tab+':'+id;
const NOMES_TAB = {fazendas:'Fazenda', talhoes:'Talhão', ramais:'Ramal', contagens:'Contagem', estrias:'Estria', coletas:'Coleta', vendas:'Venda',
  recebimentos:'Recebimento', lancamentos:'Lançamento', compromissos:'Compromisso', compradores:'Comprador', perfis:'Perfil'};
const optTalhoes = sel => S.talhoes.map(t=>`<option ${t.nome===sel?'selected':''}>${esc(t.nome)}</option>`).join('');

/* ---------- telas ---------- */
const V = {
login(){
  return `
  <section class="card sec">
    <div class="seg"><button type="button" data-lmode="entrar" aria-pressed="${E.lMode==='entrar'}">Entrar</button><button type="button" data-lmode="criar" aria-pressed="${E.lMode==='criar'}">Criar conta</button></div>
    <form id="fLogin">
      ${E.lMode==='criar'?'<label class="full">Seu nome<input id="lNome" required autocomplete="name"></label>':''}
      <label class="full">E-mail<input id="lEmail" type="email" required autocomplete="email"></label>
      <label class="full">Senha<input id="lSenha" type="password" required minlength="6" autocomplete="${E.lMode==='criar'?'new-password':'current-password'}"></label>
      ${E.lMode==='criar'?`<div class="full sec" style="gap:6px"><span class="note">Quais funções você quer usar? Dá para mudar depois em Conta.</span><div class="mods">${modsHtml(MOD_PADRAO)}</div></div>`:''}
      ${E.lAviso?`<p class="note full" id="lAviso" role="status"><b>${esc(E.lAviso)}</b></p>`:''}
      <p class="err full" id="lErr" hidden></p>
      <button class="btn full">${E.lMode==='criar'?'Criar conta':'Entrar'}</button>
    </form>
  </section>
  <section class="card sec">
    <h3>Usuário de exemplo</h3>
    <p class="note">Conta já cadastrada com duas fazendas preenchidas (SC e PR).</p>
    <dl class="kv"><dt>E-mail</dt><dd><b>${EX.email}</b></dd><dt>Senha</dt><dd><b>${EX.senha}</b></dd></dl>
    <div class="hbtn"><button type="button" class="btn sm" data-demo="1">Entrar como exemplo</button>${E.lMode==='entrar'?'<button type="button" class="btn sm ghost" data-preencher="1">Preencher o formulário</button>':''}</div>
  </section>
  <p class="note">${navigator.onLine?'Seus registros ficam guardados na nuvem e também neste aparelho, para você usar na floresta sem sinal.':'<b class="down">Sem internet.</b> O primeiro acesso precisa de conexão; depois o app funciona sem sinal.'}</p>`;
},

fazendas(){
  const u=usuario(), fs=u.fazendas;
  return `
  <section class="sec">
    <h2>Olá, ${esc(u.nome.split(' ')[0])}. Qual fazenda?</h2>
    ${fs.length?`<div class="fzs">
      ${fs.length>1?`<button type="button" class="card fz geral" data-faz="todas"><b>Visão geral</b><span class="note">As ${fs.length} fazendas consolidadas</span></button>`:''}
      ${fs.map(f=>`<button type="button" class="card fz" data-faz="${f.id}"><b>${esc(f.nome)}</b>${f._erro?`<span class="err">${esc(f._erro)}</span>`:''}<span class="note">IE ${esc(f.ie)} · ${esc(f.municipio)}/${esc(f.uf)}</span><span class="note">${plural(f.dados.talhoes.length,'talhão','talhões')} · ${plural(sum(f.dados.talhoes,painT),'árvore','árvores')}</span></button>`).join('')}
    </div>`:'<p class="note">Cadastre sua primeira fazenda para começar. Cada fazenda corresponde a uma Inscrição Estadual.</p>'}
  </section>
  <section class="card sec">${fazForm(null)}</section>`;
},

conta(){
  const u=usuario(), fe=u.fazendas.find(f=>f.id===E.fazEdit), erros=listaErros();
  return `
  <section class="sec">
    <div class="sec-h"><h2>Minha conta</h2>${SES.fid?'':'<button type="button" class="btn sm ghost" data-ir="fazendas">Minhas fazendas</button>'}</div>
    <div class="card sec"><form id="fUser">
      <label>Nome<input id="uNome" value="${esc(u.nome)}" required></label>
      <label>E-mail<input value="${esc(u.email)}" disabled></label>
      <button class="btn full ghost">Salvar nome</button>
    </form></div>
  </section>
  <section class="card sec">
    <h3>Funções habilitadas</h3>
    <p class="note">Escolha o que aparece no app. Desligar uma função só esconde a tela; nenhum registro é apagado.</p>
    <div class="mods">${modsHtml(u.modulos)}</div>
  </section>
  <section class="card sec">
    <h3>Minhas fazendas</h3>
    <div class="list">${u.fazendas.map(f=>`<div class="row"><span class="t">${esc(f.nome)}${f.id===SES.fid?'<span class="pill ok">aberta</span>':''}</span><span class="a"><button type="button" class="lnk" data-editfaz="${f.id}">Editar</button></span>
      <span class="s">IE ${esc(f.ie)} · ${esc(f.municipio)}/${esc(f.uf)} · ${REG[f.dados.regime||'funrural'].nome}${f._erro?` · <span class="down">${esc(f._erro)}</span>`:''}</span></div>`).join('')||'<p class="note">Nenhuma fazenda cadastrada.</p>'}</div>
  </section>
  <section class="card sec">
    ${fazForm(fe)}
    ${fe?`<div class="box"><h3>Apagar registros</h3><span class="note">Remove talhões, operações, vendas e lançamentos de ${esc(fe.nome)}. O cadastro da fazenda continua.</span>
      ${E.limparPend===fe.id?`<div class="hbtn"><button type="button" class="btn sm" style="background:var(--bad)" data-limpafaz="${fe.id}" data-ok="1">Confirmar: apagar tudo</button><button type="button" class="btn sm ghost" data-limpafaz="">Cancelar</button></div>`
      :`<button type="button" class="btn sm ghost" data-limpafaz="${fe.id}" style="align-self:flex-start">Apagar registros desta fazenda</button>`}</div>`:''}
    ${fe?.demo?`<div class="box"><h3>Dados de exemplo</h3><span class="note">Gerados em ${fe.demo_gerado_em?fdata(fe.demo_gerado_em):'—'}. Regerar troca todos os registros desta fazenda por exemplos novos, com datas a partir de hoje.</span>
      <button type="button" class="btn sm ghost" data-regerar="${fe.id}" style="align-self:flex-start">Regerar dados de exemplo</button></div>`:''}
  </section>
  ${erros.length?`<section class="card sec" id="erros">
    <h3>Alterações que não foram salvas na nuvem</h3>
    <p class="note">Corrija o registro (por exemplo, a Inscrição Estadual) e salve de novo; ele volta para a fila de envio.</p>
    <div class="list">${erros.map(({tabela,linha:l})=>`<div class="row"><span class="t">${NOMES_TAB[tabela]||tabela}${l.nome?' · '+esc(l.nome):''}</span><span class="s down">${esc(l._erro)}</span></div>`).join('')}</div>
  </section>`:''}
  ${E.sairPend?`<div class="box"><h3>Sair da conta</h3><span class="note">Há ${nPendentes()} alteraç${nPendentes()>1?'ões':'ão'} ainda não enviada${nPendentes()>1?'s':''}. Ela${nPendentes()>1?'s':''} fica${nPendentes()>1?'m':''} guardada${nPendentes()>1?'s':''} neste aparelho e ${nPendentes()>1?'são enviadas':'é enviada'} quando você entrar de novo. Sair mesmo assim?</span>
    <div class="hbtn"><button type="button" class="btn sm" style="background:var(--bad)" data-sair="1" data-ok="1">Sair mesmo assim</button><button type="button" class="btn sm ghost" data-sair="">Cancelar</button></div></div>`
  :'<button type="button" class="btn ghost" data-sair="1">Sair da conta</button>'}`;
},

geral(){
  const u=usuario();
  const rows=u.fazendas.map(f=>comFazenda(f.dados,()=>{ const st=statusTalhoes();
    return {f, T:tot(CUR), saldo:saldoAtual(), aRec:sum(S.vendas,saldoV), arv:totPaineis(), atras:sum(st,s=>s.atrasados.length), fx:fluxo(6), nfp:nfPend()}; }));
  const t=k=>sum(rows,k), kg=t(r=>r.T.kgProd), arvs=t(r=>r.arv), kgV=t(r=>r.T.kgVend), liq=t(r=>r.T.liquido), lucro=t(r=>r.T.lucro), saldo=t(r=>r.saldo), aRec=t(r=>r.aRec);
  const labels=rows[0]?.fx.map(m=>m.lbl)||[], cor=i=>CORES[(i+1)%CORES.length];
  return `
  <section class="sec">
    <h2>Safra ${safraLbl(CUR)} · todas as fazendas</h2>
    <div class="kpis">
      <div class="card kpi"><div class="l">Produzido</div><div class="v">${num(kg)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Produtividade média</div><div class="v">${num(arvs?kg/arvs:0,2)} <small>kg/árvore</small></div></div>
      <div class="card kpi"><div class="l">Preço livre médio</div><div class="v liv">${brl(kgV?liq/kgV:0)}<small>/kg</small></div></div>
      <div class="card kpi"><div class="l">Lucro na safra</div><div class="v ${lucro>=0?'up':'down'}">${brl(lucro)}</div></div>
      <div class="card kpi"><div class="l">Saldo em caixa</div><div class="v ${saldo>=0?'':'down'}">${brl(saldo)}</div></div>
      <div class="card kpi"><div class="l">A receber</div><div class="v warn">${brl(aRec)}</div></div>
    </div>
  </section>
  ${rows.length?`<section class="card sec">
    <h3>Saldo projetado (6 meses)</h3>
    ${chart({title:'Saldo projetado por fazenda',labels,lines:[...rows.map((r,i)=>({vals:r.fx.map(x=>x.saldo),color:cor(i),dash:true})),{vals:labels.map((_,i)=>t(r=>r.fx[i].saldo)),color:'var(--pine)',dots:true}],h:190})}
    ${legend([...rows.map((r,i)=>({c:cor(i),t:esc(r.f.nome),dash:1})),{c:'var(--pine)',t:'Total',ln:1}])}
  </section>
  <section class="card sec">
    <h3>Comparativo entre fazendas</h3>
    <div class="tbl"><table><thead><tr><th>Fazenda</th><th>kg safra</th><th>kg/árv.</th><th>Preço livre</th><th>Lucro</th><th>Saldo</th><th>A receber</th><th>Alertas</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td><button type="button" class="lnk" data-faz="${r.f.id}">${esc(r.f.nome)}</button></td><td>${num(r.T.kgProd)}</td><td>${num(r.arv?r.T.kgProd/r.arv:0,2)}</td><td>${brl(r.T.precoLivre)}</td>
      <td class="${r.T.lucro>=0?'up':'down'}">${brl(r.T.lucro)}</td><td>${brl(r.saldo)}</td><td>${brl(r.aRec)}</td>
      <td>${[r.atras?`<span class="pill pend">${plural(r.atras,'ramal atrasado','ramais atrasados')}</span>`:'', r.nfp&&mod('nfe')?`<span class="pill nfp">${r.nfp} NF-e</span>`:''].join('')||'—'}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td><b>${num(kg)}</b></td><td><b>${num(arvs?kg/arvs:0,2)}</b></td><td><b>${brl(kgV?liq/kgV:0)}</b></td><td><b>${brl(lucro)}</b></td><td><b>${brl(saldo)}</b></td><td><b>${brl(aRec)}</b></td><td></td></tr>
    </tbody></table></div>
    <p class="note">A visão geral só consulta. Para lançar dados, toque no nome da fazenda. Os registros de cada fazenda continuam separados.</p>
  </section>`:''}`;
},

inicio(){
  const T=tot(CUR), fx=fluxo(6), st=statusTalhoes(), T0=hoje();
  const atrasados=st.filter(s=>s.atraso>0);
  const prox=S.comp.filter(c=>c.data>=T0 && diff(T0,c.data)<=10).sort((a,b)=>a.data.localeCompare(b.data));
  const minS=Math.min(...fx.map(f=>f.saldo));
  const mesAtual=new Date().getMonth(), ini='JFMAMJJASOND';
  const alertas=[
    ...(mod('nfe')&&nfPend()?[`<div><span><b>${plural(nfPend(),'venda','vendas')}</b> aguardando emissão de NF-e</span></div>`]:[]),
    ...(mod('floresta')?atrasados:[]).map(s=>`<div style="--c:${s.atraso>ATRASO_CRITICO?'var(--bad)':'var(--amber)'}"><span><b>${esc(s.t.nome)}</b>: ${plural(s.atrasados.length,'ramal','ramais')} com estria atrasada (até ${plural(s.atraso,'dia','dias')})</span></div>`),
    ...(mod('floresta')?st.filter(s=>s.contVelha):[]).map(s=>`<div style="--c:var(--muted)"><span><b>${esc(s.t.nome)}</b>: ${plural(s.contVelha,'ramal','ramais')} sem recontagem de árvores há mais de 6 meses</span></div>`),
    ...(mod('caixa')?prox:[]).map(c=>`<div style="--c:${c.tipo==='d'?'var(--bad)':'var(--good)'}"><span>${fdata(c.data)} · ${esc(c.desc)}: <b>${c.tipo==='d'?'−':'+'} ${brl(c.valor)}</b></span></div>`)
  ];
  return `
  <section class="sec">
    <div class="sec-h"><h2>Mercado hoje</h2><span class="tag">${MERCADO.atualizado}</span></div>
    <div class="grid3">
      <div class="card q"><span class="l">Dólar</span><span class="v">${brl(MERCADO.dolar.v)}</span>${delta(MERCADO.dolar.d)}</div>
      <div class="card q"><span class="l">Euro</span><span class="v">${brl(MERCADO.euro.v)}</span>${delta(MERCADO.euro.d)}</div>
      <div class="card q res"><span class="l">Goma resina /kg</span><span class="v">${brl(MERCADO.resina.v)}</span>${delta(MERCADO.resina.d)}</div>
    </div>
    <p class="note">A resina é cotada em dólar: dólar alto costuma puxar o preço pago ao produtor. Seu preço médio na safra: <b>${brl(T.precoMedio)}/kg</b>, livre de ${REG[S.regime].nome==='Funrural'?'Funrural':'contribuição'}: <b class="liv">${brl(T.precoLivre)}/kg</b>.</p>
  </section>
  ${alertas.length?`<section class="card sec"><h3>Atenção nos próximos dias</h3><div class="alert">${alertas.join('')}</div></section>`:''}
  <section class="sec">
    <div class="sec-h"><h2>Safra ${safraLbl(CUR)} até agora</h2></div>
    <div class="kpis">
      ${mod('producao')?`<div class="card kpi"><div class="l">Produtividade</div><div class="v">${num(T.kgPainel,2)} <small>kg/árvore</small></div></div>
      <div class="card kpi"><div class="l">Por estria</div><div class="v">${num(T.kgEstria*1000,0)} <small>g/estria</small></div></div>`:''}
      ${mod('caixa')?`<div class="card kpi"><div class="l">Saldo em caixa</div><div class="v ${saldoAtual()>=0?'up':'down'}">${brl(saldoAtual())}</div></div>
      <div class="card kpi"><div class="l">Menor saldo previsto (6 meses)</div><div class="v ${minS>=0?'':'down'}">${brl(minS)}</div></div>`:''}
    </div>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Calendário da safra</h2><span class="tag">Sul e Sudeste</span></div>
    <div class="card">
      <div class="cal">${SAFRA.map((v,i)=>`<div style="background:color-mix(in srgb, var(--amber) ${Math.round(v*85)}%, var(--line));${i===mesAtual?'outline:2px solid var(--pine);':''}color:${v>.6?'var(--surface)':'var(--muted)'}">${ini[i]}</div>`).join('')}</div>
      <p class="note" style="margin-top:8px">Cor mais forte = mais resina por estria. O mês atual está marcado.</p>
    </div>
  </section>
  <section class="sec">
    <h2>Dicas de cultivo e resinagem</h2>
    <div class="card tips">${DICAS.map(d=>`<div class="tip"><span class="mes">${d.m}</span><div><b>${d.t}</b><span>${d.s}</span></div></div>`).join('')}</div>
  </section>`;
},

caixa(){
  const fx=fluxo(6), minS=Math.min(...fx.map(f=>f.saldo)), T0=hoje();
  const lista = E.modoCaixa==='real'
    ? [...S.caixa].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,25)
    : [...S.comp, ...S.vendas.filter(v=>saldoV(v)>0).map(v=>({id:v.id,venda:true,data:v.venc||T0,tipo:'r',cat:'Venda de resina',desc:`A receber de ${v.comprador}`,valor:saldoV(v)}))].sort((a,b)=>a.data.localeCompare(b.data));
  return `
  <section class="sec">
    <h2>Fluxo de caixa previsto</h2>
    <div class="kpis">
      <div class="card kpi"><div class="l">Saldo hoje</div><div class="v ${saldoAtual()>=0?'up':'down'}">${brl(saldoAtual())}</div></div>
      <div class="card kpi"><div class="l">Saldo em ${fx.at(-1).lbl}</div><div class="v ${fx.at(-1).saldo>=0?'':'down'}">${brl(fx.at(-1).saldo)}</div></div>
    </div>
    <div class="card sec">
      ${chart({title:'Fluxo de caixa previsto',labels:fx.map(f=>f.lbl),bars:[{vals:fx.map(f=>f.ent),color:'var(--good)'},{vals:fx.map(f=>f.sai),color:'var(--bad)'}],lines:[{vals:fx.map(f=>f.saldo),color:'var(--amber)',axis:'r',dots:true}],h:190})}
      ${legend([{c:'var(--good)',t:'Entradas previstas'},{c:'var(--bad)',t:'Saídas previstas'},{c:'var(--amber)',t:'Saldo projetado (eixo direito)',ln:1}])}
      <p class="note">Calculado a partir do saldo de hoje, dos compromissos lançados e das vendas a receber. ${minS<0?`<b class="down">O saldo fica negativo em ${fx.find(f=>f.saldo<0).lbl}.</b>`:`Menor saldo previsto: <b>${brl(minS)}</b>.`}</p>
    </div>
  </section>
  <section class="card sec">
    <div class="seg" data-grp="modo"><button type="button" data-modo="real" aria-pressed="${E.modoCaixa==='real'}">Realizado</button><button type="button" data-modo="comp" aria-pressed="${E.modoCaixa==='comp'}">Compromissos futuros</button></div>
    <div class="seg"><button type="button" data-tipo="d" aria-pressed="${E.tipoLanc==='d'}">Saída</button><button type="button" data-tipo="r" aria-pressed="${E.tipoLanc==='r'}">Entrada</button></div>
    <form id="fCaixa">
      <label>${E.modoCaixa==='real'?'Data':'Vencimento'}<input id="cData" type="date" value="${E.modoCaixa==='real'?T0:addD(T0,30)}" required></label>
      <label>Valor (R$)<input id="cValor" type="number" step="0.01" min="0" inputmode="decimal" required></label>
      <label class="full">Categoria<select id="cCat">${(E.tipoLanc==='d'?CATS_D:CATS_R).map(c=>`<option>${c}</option>`).join('')}</select></label>
      <label class="full">Descrição<input id="cDesc" placeholder="${E.modoCaixa==='real'?'Ex.: diária de resineiro':'Ex.: parcela do arrendamento'}"></label>
      <button class="btn full">${E.modoCaixa==='real'?'Lançar':'Agendar compromisso'}</button>
    </form>
  </section>
  <section class="card list">${lista.map(x=>{ const tab=E.modoCaixa==='real'?'lancamentos':'compromissos';
    if (!x.venda && editando(tab, x.id)) return `<form class="fEdLanc row" data-tab="${tab}" data-id="${x.id}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label>${tab==='lancamentos'?'Data':'Vencimento'}<input name="data" type="date" value="${x.data}" required></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" inputmode="decimal" value="${x.valor}" required></label>
      <label class="full">Categoria<select name="cat">${(x.tipo==='d'?CATS_D:CATS_R).map(c=>`<option ${c===x.cat?'selected':''}>${c}</option>`).join('')}</select></label>
      <label class="full">Descrição<input name="desc" value="${esc(x.desc)}"></label>
      <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-editar="">Cancelar</button></div></form>`;
    return `
    <div class="row"><span class="t">${esc(x.desc||x.cat)}</span><span class="a ${x.tipo==='d'?'down':'up'}">${x.tipo==='d'?'−':'+'} ${brl(x.valor)}</span>
    <span class="s">${fdata(x.data)} · ${esc(x.cat)}${E.modoCaixa==='comp'&&!x.venda?` · <button type="button" class="lnk" data-realizar="${x.id}">marcar como pago</button>`:''}${x.venda?' · ver em Vendas':` · ${acoes(tab, x.id, {editar:true})}`}</span></div>`; }).join('') || `<p class="note">${E.modoCaixa==='real'?'Nenhum lançamento ainda.':'Nenhum compromisso futuro. Agende salários, insumos e vendas previstas para ver o fluxo.'}</p>`}
  </section>`;
},

floresta(){
  const T0=hoje();
  E.talSel = talById(E.talSel)? E.talSel : S.talhoes[0]?.id;
  const t=talById(E.talSel);
  const sub = `<div class="seg">${[['ramais','Talhões e ramais'],['apontar','Apontar'],['estrias','Estrias']].map(([k,l])=>`<button type="button" data-fl="${k}" aria-pressed="${E.flMode===k}">${l}</button>`).join('')}</div>`;
  const chipsTal = (attr='tal', sel=E.talSel) => `<div class="chips">${S.talhoes.map(x=>`<button type="button" data-${attr}="${x.id}" aria-pressed="${x.id===sel}">${esc(x.nome)}</button>`).join('')}</div>`;
  const nRam = sum(S.talhoes,x=>x.ramais.length);
  const head = `
  <section class="sec">
    <div class="sec-h"><h2>Floresta · ${esc(fazAtual()?.nome||'')}</h2><span class="tag">${plural(S.talhoes.length,'talhão','talhões')} · ${plural(nRam,'ramal','ramais')} · ${plural(totPaineis(),'árvore','árvores')}</span></div>
    ${sub}
  </section>`;
  const situ = s => s.ult==null ? '<span class="pill sem">Sem estria</span>' : s.atraso>0 ? `<span class="pill ${s.atraso>ATRASO_CRITICO?'late':'pend'}">${s.atraso}d atraso</span>` : '<span class="pill ok">Em dia</span>';

  if (E.flMode==='ramais') {
    const rs = t? t.ramais.map(r=>ramStats(t,r)) : [];
    const sel = t?.ramais.find(r=>r.id===E.ramSel);
    return head + `
  <section class="card sec">
    <div class="sec-h"><h3>Ramais do talhão</h3>${t&&!editando('talhoes',t.id)?`<span class="note">${acoes('talhoes', t.id, {editar:true, aviso:`Excluir ${esc(t.nome)} apaga ${plural(t.ramais.length,'ramal','ramais')}, ${plural(S.estrias.filter(e=>e.talhao===t.id).length,'estria','estrias')} e ${plural(S.producao.filter(p=>p.talhao===t.id).length,'coleta','coletas')}.`})}</span>`:''}</div>
    ${chipsTal()}
    ${t&&editando('talhoes',t.id)?`<form id="fEdTal" data-id="${t.id}"><label class="full">Nome do talhão<input id="etNome" value="${esc(t.nome)}" required></label>
      <p class="err full" id="etErr" hidden></p>
      <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-editar="">Cancelar</button></div></form>`:''}
    ${t?`<div class="kpis">
      <div class="card kpi" style="background:var(--bg)"><div class="l">Árvores (painéis)</div><div class="v">${num(painT(t))}</div></div>
      <div class="card kpi" style="background:var(--bg)"><div class="l">Produtividade na safra</div><div class="v">${num(sum(rs,s=>s.kg)/(painT(t)||1),2)} <small>kg/árvore</small></div></div>
    </div>
    <div class="tbl"><table><thead><tr><th>Ramal</th><th>Árvores</th><th>Contagem</th><th>Última estria</th><th>kg/árv.</th><th>g/estria</th></tr></thead><tbody>
    ${rs.map(s=>`<tr><td><button type="button" class="lnk" data-ram="${s.r.id}">${esc(s.r.cod)}</button></td><td>${num(s.arv)}</td>
      <td class="${s.cont>180?'warn':''}">há ${s.cont}d</td><td>${s.ult?fdata(s.ult)+' ':''}${situ(s)}</td><td><b>${num(s.kgArv,2)}</b></td><td>${num(s.gEst)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum ramal cadastrado.</td></tr>'}
    </tbody></table></div>
    <p class="note">Toque no ramal para atualizar o número de árvores. Contagens com mais de 180 dias ficam em destaque. A coleta do talhão é rateada entre os ramais coletados pelo nº de árvores.</p>`
    :'<p class="note">Cadastre o primeiro talhão abaixo.</p>'}
  </section>
  ${sel?`<section class="card sec" id="cardRam">
    <div class="sec-h"><h3>${esc(t.nome)} · ${esc(sel.cod)}</h3><button type="button" class="lnk" data-ram="">Fechar</button></div>
    ${editando('ramais',sel.id)?`<form id="fEdRam" data-id="${sel.id}"><label class="full">Código do ramal<input id="erCod" value="${esc(sel.cod)}" required></label>
      <p class="err full" id="erErr" hidden></p>
      <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-editar="">Cancelar</button></div></form>`
    :`<span class="note">Ramal: ${acoes('ramais', sel.id, {editar:true})}</span>`}
    <form id="fCont">
      <label>Nova contagem (árvores)<input id="kArv" type="number" min="0" inputmode="numeric" value="${arv(sel)}" required></label>
      <label>Data<input id="kData" type="date" value="${T0}" required></label>
      <label class="full">Motivo<select id="kMot"><option>Mortalidade</option><option>Árvore quebrada</option><option>Recontagem</option><option>Novos painéis abertos</option></select></label>
      <button class="btn full">Atualizar contagem</button>
    </form>
    <div class="list">${[...sel.hist].reverse().map((h,i,a)=>{ const ant=a[i+1]; const d=ant? h.arv-ant.arv : null;
      return `<div class="row"><span class="t">${num(h.arv)} árvores</span><span class="a ${d<0?'down':d>0?'up':''}">${d==null?'':(d>0?'+':'')+num(d)}</span><span class="s">${fdata(h.data)}/${h.data.slice(2,4)} · ${esc(h.motivo)}${sel.hist.length>1?` · ${acoes('contagens', h.id)}`:''}</span></div>`; }).join('')}</div>
  </section>`:''}
  <section class="card sec">
    <h3>Cadastrar</h3>
    ${t?`<form id="fRam">
      <label>Novo ramal em ${esc(t.nome)}<input id="rCod" placeholder="Ex.: R-${String(t.ramais.length+1).padStart(2,'0')}" value="R-${String(t.ramais.length+1).padStart(2,'0')}" required></label>
      <label>Árvores contadas<input id="rArv" type="number" min="1" inputmode="numeric" required></label>
      <p class="err full" id="rErr" hidden></p>
      <button class="btn full">Adicionar ramal</button>
    </form>`:''}
    <form id="fTal">
      <label class="full">Novo talhão<input id="tNome" placeholder="Ex.: Talhão D" required></label>
      <p class="err full" id="tErr" hidden></p>
      <button class="btn full ghost">Adicionar talhão</button>
    </form>
  </section>`;
  }

  if (E.flMode==='apontar') {
    E.apTal = talById(E.apTal)? E.apTal : E.talSel;
    const ta=talById(E.apTal), rs=ta? ta.ramais.map(r=>ramStats(ta,r)) : [];
    if (!E.apSel) E.apSel = new Set(rs.filter(s=> E.opTipo==='coleta' || s.desde==null || s.desde>=S.ideal-2).map(s=>s.r.id));
    const recent=[...S.estrias.map(e=>({...e,k:'Estria'})),...S.producao.map(p=>({...p,k:'Coleta'}))].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,8);
    return head + `
  <section class="card sec">
    <div class="seg"><button type="button" data-op="estria" aria-pressed="${E.opTipo==='estria'}">Estria</button><button type="button" data-op="coleta" aria-pressed="${E.opTipo==='coleta'}">Coleta</button></div>
    ${chipsTal('aptal', E.apTal)}
    ${ta?`<form id="fAp">
      <div class="full sec" style="gap:6px">
        <div class="sec-h"><span class="note">${E.opTipo==='estria'?'Pré-selecionados os ramais com estria vencendo.':'Marque os ramais coletados.'}</span>
          <span><button type="button" class="lnk" data-apall="1">Todos</button> · <button type="button" class="lnk" data-apall="0">Nenhum</button></span></div>
        <div class="rams">${rs.map(s=>`<label class="ram"><input type="checkbox" name="ram" value="${s.r.id}" ${E.apSel.has(s.r.id)?'checked':''}>
          <span><b>${esc(s.r.cod)}</b> · ${num(s.arv)} árv.<small>${s.ult?`estria há ${s.desde}d`:'sem estria'}</small></span></label>`).join('')}</div>
        <div class="box" id="apSum"></div>
      </div>
      <label>Data<input id="aData" type="date" value="${T0}" required></label>
      ${E.opTipo==='estria'?`
      <label>Dias trabalhados<input id="aDias" type="number" step="0.5" min="0.5" inputmode="decimal" value="1" required></label>
      <label class="full">Resineiro<input id="aRes" list="resineiros" placeholder="Ex.: João" required></label>
      <datalist id="resineiros">${[...new Set(S.estrias.map(e=>e.resineiro))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`
      :`<label>Resina coletada (kg)<input id="aKg" type="number" min="1" inputmode="numeric" required></label>`}
      <button class="btn full">${E.opTipo==='estria'?'Registrar estria':'Registrar coleta'}</button>
    </form>`:'<p class="note">Cadastre talhões e ramais primeiro.</p>'}
  </section>
  <section class="card sec"><h3>Últimos apontamentos</h3><div class="list">${recent.map(x=>{ const tx=talById(x.talhao), rr=ramsDe(tx,x.ramais);
    return `<div class="row"><span class="t">${x.k} · ${esc(tx?.nome)}</span><span class="a">${x.k==='Estria'?num(x.qtd)+' árv.':num(x.kg)+' kg'}</span>
    <span class="s">${fdata(x.data)} · ${rr.length===tx?.ramais.length?'todos os ramais':rr.map(r=>esc(r.cod)).join(', ')}${x.k==='Estria'?` · ${esc(x.resineiro)} · ${num(x.qtd/x.dias)} estrias/dia`:''} · ${acoes(x.k==='Estria'?'estrias':'coletas', x.id)}</span></div>`; }).join('')}</div></section>`;
  }

  // estrias: situação e intervalo realizado vs ideal por ramal
  const st=statusTalhoes();
  const rsSel = t? t.ramais.map(r=>ramStats(t,r,E.safraSel)) : [];
  const res={}; S.estrias.filter(inSafra(E.safraSel)).forEach(e=>{ res[e.resineiro]??={n:0,d:0}; res[e.resineiro].n+=e.qtd; res[e.resineiro].d+=e.dias; });
  return head + `
  <section class="sec">
    <div class="sec-h"><h3>Situação por talhão</h3>
      <label style="flex-direction:row;align-items:center;gap:6px">Intervalo ideal <input id="ideal" type="number" min="7" max="30" value="${S.ideal}" style="width:64px;padding:6px"> dias</label></div>
    <div class="tstat">${st.map(s=>`
      <div class="card tst ${s.atraso>ATRASO_CRITICO?'crit':s.atraso>0?'late':''}">
        <h3>${esc(s.t.nome)} <span class="note" style="font-weight:400">· ${plural(s.t.ramais.length,'ramal','ramais')} · ${num(painT(s.t))} árv.</span></h3>
        <div class="big">${s.ult==null?'<span class="note">Sem estrias</span>': s.atrasados.length?`<span class="${s.atraso>ATRASO_CRITICO?'down':'warn'}">${plural(s.atrasados.length,'ramal atrasado','ramais atrasados')}</span>`:'<span class="up">Em dia</span>'}</div>
        ${s.ult?`<span class="note">${s.atrasados.length?`Maior atraso: <b>${plural(s.atraso,'dia','dias')}</b> · `:''}Próxima estria: <b>${fdata(s.prox)}</b></span>
        <span class="note">Intervalo médio na safra: <b class="${s.medio>S.ideal+1?'warn':''}">${s.medio?num(s.medio,1):'–'} dias</b> vs ${S.ideal} ideal</span>`:''}
      </div>`).join('')}</div>
  </section>
  <section class="card sec">
    <div class="sec-h"><h3>Intervalo médio por ramal vs ideal</h3>${chipsSafra()}</div>
    ${chipsTal()}
    ${rsSel.some(s=>s.medio!=null)? chart({title:'Intervalo médio por ramal',labels:rsSel.map(s=>s.r.cod.replace('R-','')),bars:[{vals:rsSel.map(s=>s.medio),color:'var(--pine)',cols:rsSel.map(s=>s.medio>S.ideal+ATRASO_CRITICO?'var(--bad)':s.medio>S.ideal?'var(--amber)':'var(--pine)')}],refs:[{v:S.ideal,color:'var(--fg)'}],fmtL:v=>num(v)+'d',h:170})
      + legend([{c:'var(--pine)',t:'No prazo'},{c:'var(--amber)',t:`Até ${plural(ATRASO_CRITICO,'dia','dias')} acima`},{c:'var(--bad)',t:`Mais de ${plural(ATRASO_CRITICO,'dia','dias')} acima`},{c:'var(--fg)',t:`Ideal (${S.ideal} dias)`,dash:1}])
      : '<p class="note">Registre ao menos duas estrias nos ramais deste talhão para ver os intervalos.</p>'}
  </section>
  <section class="card sec">
    <h3>Produtividade da equipe · safra ${safraLbl(E.safraSel)}</h3>
    <div class="tbl"><table><thead><tr><th>Resineiro</th><th>Estrias</th><th>Dias</th><th>Estrias/dia</th></tr></thead><tbody>
    ${Object.entries(res).map(([n,v])=>`<tr><td>${esc(n)}</td><td>${num(v.n)}</td><td>${num(v.d,1)}</td><td><b>${num(v.n/v.d)}</b></td></tr>`).join('')||'<tr><td colspan="4">Sem registros.</td></tr>'}
    </tbody></table></div>
    <p class="note">Cada árvore estriada conta como uma estria. Estrias/dia = árvores estriadas ÷ dias trabalhados.</p>
  </section>`;
},

producao(){
  const T=tot(E.safraSel), prev=tot(E.safraSel-1), pain=totPaineis();
  const mens=Array(12).fill(0), est=Array(12).fill(0);
  S.producao.filter(inSafra(E.safraSel)).forEach(p=>mens[mIdx(p.data)]+=p.kg);
  S.estrias.filter(inSafra(E.safraSel)).forEach(e=>est[mIdx(e.data)]+=e.qtd);
  const limite = E.safraSel===CUR ? mIdx(hoje()) : 11;
  const kgP = mens.map((v,i)=> i>limite? null : (pain? v/pain : 0));
  const acum = y => { const m=Array(12).fill(0); S.producao.filter(inSafra(y)).forEach(p=>m[mIdx(p.data)]+=p.kg);
    const lim = y===CUR? mIdx(hoje()) : 11; let a=0; return m.map((v,i)=>{ a+=v; return i>lim? null : (pain? a/pain:0); }); };
  const temPrev = S.producao.some(inSafra(E.safraSel-1));
  const porT = S.talhoes.map(t=>{ const kg=sum(S.producao.filter(p=>p.talhao===t.id&&safraIni(p.data)===E.safraSel),p=>p.kg);
    const ne=sum(S.estrias.filter(e=>e.talhao===t.id&&safraIni(e.data)===E.safraSel),e=>e.qtd);
    return {t,kg,kgP:painT(t)?kg/painT(t):0,gE:ne?kg/ne*1000:0}; });
  const recent=[...S.producao].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,6);
  return `
  <section class="sec">
    <div class="sec-h"><h2>Produção de resina</h2>${chipsSafra()}</div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Total na safra</div><div class="v">${num(T.kgProd)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Produtividade</div><div class="v">${num(T.kgPainel,2)} <small>kg/painel</small></div></div>
      <div class="card kpi"><div class="l">Por estria</div><div class="v">${num(T.kgEstria*1000)} <small>g/estria</small></div></div>
      <div class="card kpi"><div class="l">Em estoque hoje</div><div class="v">${num(estoque())} <small>kg</small></div></div>
    </div>
  </section>
  <section class="card sec">
    <h3>Produção por mês</h3>
    ${chart({title:'Produção mensal',labels:MES_SAFRA,bars:[{vals:mens.map((v,i)=>i>limite?null:v),color:'var(--pine)'}],lines:[{vals:kgP,color:'var(--amber)',axis:'r',dots:true}],fmtR:v=>num(v,2),h:190})}
    ${legend([{c:'var(--pine)',t:'Total (kg)'},{c:'var(--amber)',t:'Média por painel (kg, eixo direito)',ln:1}])}
  </section>
  <section class="card sec">
    <h3>Acumulado por painel na safra</h3>
    ${chart({title:'Acumulado por safra',labels:MES_SAFRA,lines:[{vals:acum(E.safraSel),color:'var(--amber)',dots:true},...(temPrev?[{vals:acum(E.safraSel-1),color:'var(--muted)',dash:true}]:[])],fmtL:v=>num(v,1),h:170})}
    ${legend([{c:'var(--amber)',t:`Safra ${safraLbl(E.safraSel)}`,ln:1},...(temPrev?[{c:'var(--muted)',t:`Safra ${safraLbl(E.safraSel-1)} (referência)`,dash:1}]:[])])}
    ${temPrev?`<p class="note">Safra anterior fechou com <b>${num(prev.kgPainel,2)} kg/painel</b> e <b>${num(prev.kgEstria*1000)} g/estria</b>.</p>`:''}
  </section>
  <section class="card sec">
    <h3>Por talhão · safra ${safraLbl(E.safraSel)}</h3>
    <div class="tbl"><table><thead><tr><th>Talhão</th><th>Árvores</th><th>kg</th><th>kg/painel</th><th>g/estria</th></tr></thead><tbody>
    ${porT.map(r=>`<tr><td>${esc(r.t.nome)}</td><td>${num(painT(r.t))}</td><td>${num(r.kg)}</td><td><b>${num(r.kgP,2)}</b></td><td>${num(r.gE)}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <section class="card sec">
    <div class="sec-h"><h3>Últimas coletas</h3><button type="button" class="btn sm" data-goap="coleta">Apontar coleta por ramal</button></div>
    <div class="list">${recent.map(x=>{ const tx=talById(x.talhao), rr=ramsDe(tx,x.ramais); return `<div class="row"><span class="t">${esc(tx?.nome)}</span><span class="a">${num(x.kg)} kg</span><span class="s">Coleta de ${fdata(x.data)} · ${rr.length===tx?.ramais.length?'todos os ramais':plural(rr.length,'ramal','ramais')} · ${acoes('coletas', x.id)}</span></div>`; }).join('')}</div>
  </section>`;
},

vendas(){
  const T=tot(E.safraSel), T0=hoje();
  const vs=S.vendas.filter(inSafra(E.safraSel)).sort((a,b)=>a.data.localeCompare(b.data));
  const aRec=sum(S.vendas,saldoV);
  const pillRec = v => ({pend:'<span class="pill pend">A receber</span>',parcial:'<span class="pill pend">Parcial</span>',ok:'<span class="pill ok">Recebido</span>'})[statusRec(v)];
  const pillNf = v => !mod('nfe') ? '' : !v.comNota ? '<span class="pill sem">Sem nota</span>' : v.nf ? `<span class="pill nf">NF-e ${esc(v.nf.numero)}</span>` : '<span class="pill nfp">NF-e a emitir</span>';
  return `
  <section class="sec">
    <div class="sec-h"><h2>Vendas e compradores</h2>${chipsSafra()}</div>
    <div class="card sec">
      <h3>Como você contribui para a Previdência?</h3>
      <div class="seg">${Object.entries(REG).map(([k,r])=>`<button type="button" data-reg="${k}" aria-pressed="${S.regime===k}">${r.nome}</button>`).join('')}</div>
      <p class="note">${REG[S.regime].nome}: ${REG[S.regime].desc}. Preço livre = preço de venda × ${num(fat(),4)}. É o valor que cai na conta e o que o app usa para recebimentos, fluxo de caixa e margem. Vale para as próximas vendas. As vendas já registradas mantêm o desconto da época.</p>
    </div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Preço médio da safra</div><div class="v">${brl(T.precoMedio)}<small>/kg</small></div></div>
      <div class="card kpi" style="border-color:var(--pine)"><div class="l">Preço livre médio</div><div class="v liv">${brl(T.precoLivre)}<small>/kg</small></div></div>
      <div class="card kpi"><div class="l">A receber (líquido)</div><div class="v warn">${brl(aRec)}</div></div>
      ${mod('nfe')?`<div class="card kpi"><div class="l">NF-e a emitir</div><div class="v ${nfPend()?'warn':''}">${nfPend()}</div></div>`:`<div class="card kpi"><div class="l">Vendido na safra</div><div class="v">${num(T.kgVend)} <small>kg</small></div></div>`}
    </div>
    <p class="note">Vendido na safra: <b>${num(T.kgVend)} kg</b> · ${brl(T.vendido)} bruto · ${brl(T.contrib)} retidos de ${S.regime==='funrural'?'Funrural':'contribuição'}.</p>
  </section>
  <section class="card sec">
    <h3>Preço de cada venda</h3>
    ${vs.length? chart({title:'Preço por venda',labels:vs.map(v=>fdata(v.data)),lines:[{vals:vs.map(v=>v.preco),color:'var(--muted)',dots:true},{vals:vs.map(v=>livreV(v)),color:'var(--pine)',dots:true}],refs:[{v:T.precoLivre,color:'var(--amber)'}],fmtL:v=>num(v,2),h:170})
      + legend([{c:'var(--muted)',t:'Preço de venda',ln:1},{c:'var(--pine)',t:'Preço livre',ln:1},{c:'var(--amber)',t:`Média livre da safra ${brl(T.precoLivre)}`,dash:1}])
      : '<p class="note">Nenhuma venda nesta safra.</p>'}
  </section>
  <section class="card sec">
    <h3>Registrar venda</h3>
    <form id="fVenda">
      <label class="full">Comprador<input id="vComp" list="comps" required placeholder="Ex.: Resinas Vale Sul"></label>
      <datalist id="comps">${[...new Set(S.vendas.map(v=>v.comprador))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <label>Quantidade (kg)<input id="vKg" type="number" min="1" inputmode="numeric" required></label>
      <label>Preço por kg (R$)<input id="vPreco" type="number" step="0.01" min="0.01" inputmode="decimal" value="${MERCADO.resina.v.toFixed(2)}" required></label>
      <label>Data da venda<input id="vData" type="date" value="${T0}" required></label>
      ${mod('nfe')?`<label>Nota fiscal<select id="vNota"><option value="1">Com NF-e</option><option value="0">Sem nota</option></select></label>`:''}
      <label>Pagamento<select id="vRec"><option value="0">A receber depois</option><option value="1">Recebido na hora</option></select></label>
      <label>Previsão de recebimento<input id="vVenc" type="date" value="${addD(T0,15)}"></label>
      <div class="box full" id="vPrev"></div>
      <button class="btn full">Registrar venda</button>
    </form>
    <p class="note">Fluxo: <b>registrar a venda</b> → ${mod('nfe')?'<b>emitir a NF-e</b> (quando houver nota) → ':''}<b>registrar o recebimento</b>. O saldo a receber entra no fluxo de caixa previsto.</p>
  </section>
  <section class="card list" style="padding-block:2px">${[...vs].reverse().map(v=>{
    const st=statusRec(v), pct=pctRec(v), dif=T.precoLivre?(livreV(v)/T.precoLivre-1)*100:0;
    return `
    <details class="venda" ${v.id===E.aberta?'open':''} data-venda="${v.id}">
      <summary><span class="t">${esc(v.comprador)}</span><span class="a">${brl(liqV(v))}<br><small class="note" style="font-weight:400">líquido</small></span>
        <span class="s">${fdata(v.data)} · ${num(v.kg)} kg a ${brl(v.preco)} · livre <b class="liv">${brl(livreV(v))}/kg</b> <span class="${dif>=0?'up':'down'}">(${dif>=0?'+':''}${num(dif,1)}% vs média)</span></span>
        <span class="pills">${pillNf(v)}${pillRec(v)}</span></summary>
      <div class="det">
        ${editando('vendas',v.id)?`<form class="fEdVenda box" data-id="${v.id}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="full">Comprador<input name="comprador" value="${esc(v.comprador)}" required></label>
          <label>Quantidade (kg)<input name="kg" type="number" min="1" inputmode="numeric" value="${v.kg}" required></label>
          <label>Preço por kg (R$)<input name="preco" type="number" step="0.01" min="0.01" inputmode="decimal" value="${v.preco}" required></label>
          <label>Data da venda<input name="data" type="date" value="${v.data}" required></label>
          <label>Previsão de recebimento<input name="venc" type="date" value="${v.venc||''}"></label>
          <p class="err full" hidden></p>
          <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-editar="">Cancelar</button></div></form>`
        :`<span class="note">Venda: ${acoes('vendas', v.id, {editar:true, aviso:v.recs.length?'Os recebimentos desta venda também serão apagados.':''})}</span>`}
        ${mod('nfe')?`<div class="steps">
          <span class="step done">1 · Venda</span>
          <span class="step ${!v.comNota?'skip':v.nf?'done':''}">2 · NF-e</span>
          <span class="step ${st==='ok'?'done':''}">3 · Recebimento</span>
        </div>
        ${!v.comNota ? `<div class="box"><h3>Nota fiscal</h3><span class="note">Venda registrada sem nota.</span>
            <button type="button" class="btn sm ghost" data-comnota="${v.id}" style="align-self:flex-start">Passar a emitir NF-e</button></div>`
        : v.nf ? `<div class="box"><h3>NF-e autorizada <span class="note">(simulação)</span></h3>
            <dl class="kv"><dt>Destinatário</dt><dd>${esc(v.nf.dest?.razao||v.comprador)}<br><span class="note">${esc(v.nf.doc||'')}${v.nf.dest?.municipio?' · '+esc(v.nf.dest.municipio)+'/'+esc(v.nf.dest.uf):''}</span></dd><dt>Número</dt><dd>${esc(v.nf.numero)} · série ${esc(v.nf.serie)}</dd><dt>Emissão</dt><dd>${esc(fdata(String(v.nf.data)))}</dd><dt>CFOP</dt><dd>${esc(v.nf.cfop)}</dd><dt>Chave</dt><dd class="chave">${esc(String(v.nf.chave).replace(/(\d{4})/g,'$1 ').trim())}</dd></dl></div>`
        : `<div class="box"><h3>Nota fiscal</h3><span class="note">Esta venda precisa de NF-e.</span>
            <button type="button" class="btn sm" data-emitir="${v.id}" style="align-self:flex-start">Emitir NF-e</button></div>`}
        `:''}
        <div class="box"><h3>Recebimento</h3>
          <div class="prog"><i style="width:${pct}%"></i></div>
          <div class="rec"><span>Valor bruto (NF)</span><b>${brl(totalV(v))}</b></div>
          <div class="rec"><span>Retenção ${v.fator===REG.folha.f?'folha':'Funrural'}</span><b class="down">− ${brl(totalV(v)-liqV(v))}</b></div>
          <div class="rec"><span>Recebido</span><b>${brl(recV(v))} de ${brl(liqV(v))}</b></div>
          ${v.recs.map(r=>`<div class="rec"><span>${fdata(r.data)} · ${esc(r.forma)} · ${acoes('recebimentos', r.id)}</span><b>${brl(r.valor)}</b></div>`).join('')}
          ${st!=='ok' ? `<span class="note">Previsão do saldo: <b>${fdata(v.venc||T0)}</b></span>
          <form class="fRec" data-id="${v.id}" style="margin-top:4px">
            <label>Data<input name="d" type="date" value="${T0}" required></label>
            <label>Valor (R$)<input name="val" type="number" step="0.01" min="0.01" max="${saldoV(v)}" value="${saldoV(v).toFixed(2)}" inputmode="decimal" required></label>
            <label class="full">Forma<select name="f">${FORMAS.map(f=>`<option>${f}</option>`).join('')}</select></label>
            <button class="btn sm full">Registrar recebimento</button>
          </form>${mod('nfe') && v.comNota && !v.nf ? '<span class="note">Dica: emita a NF-e antes de receber, para o comprador ter o documento.</span>':''}` : ''}
        </div>
      </div>
    </details>`;}).join('') || '<p class="note" style="padding-block:12px">Nenhuma venda nesta safra.</p>'}
  </section>
  <dialog id="dlgNf"></dialog>`;
},

resultado(){
  const T=tot(E.safraSel);
  const porCat={}; S.caixa.filter(x=>x.tipo==='d'&&safraIni(x.data)===E.safraSel).forEach(x=>porCat[x.cat]=(porCat[x.cat]||0)+x.valor);
  const ents=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  const margemKg=T.precoLivre-T.custoKg, pct=T.receita?T.lucro/T.receita*100:0;
  return `
  <section class="sec">
    <div class="sec-h"><h2>Custo e margem</h2>${chipsSafra()}</div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Custo por kg</div><div class="v">${brl(T.custoKg)}</div></div>
      <div class="card kpi"><div class="l">Margem por kg</div><div class="v ${margemKg>=0?'up':'down'}">${brl(margemKg)}</div></div>
      <div class="card kpi"><div class="l">Custo por árvore</div><div class="v">${brl(T.custoPainel)}</div></div>
      <div class="card kpi"><div class="l">Lucro (${num(pct)}% da receita)</div><div class="v ${T.lucro>=0?'up':'down'}">${brl(T.lucro)}</div></div>
    </div>
    <p class="note">Custo por kg = despesas da safra ÷ kg produzidos. Margem = preço livre médio (${brl(T.precoLivre)}/kg) − custo por kg. Receita considerada já líquida da retenção (${brl(T.contrib)} na safra). ${E.safraSel===CUR?`O estoque atual (${num(estoque())} kg) vale cerca de ${brl(estoque()*MERCADO.resina.v)} a preço de mercado.`:''}</p>
  </section>
  <section class="card sec">
    <h3>Para onde vai o dinheiro</h3>
    ${ents.length?`<div class="bar">${ents.map(([c,v],i)=>`<i style="width:${v/T.desp*100}%;background:${CORES[i%CORES.length]}"></i>`).join('')}</div>
    <div class="list">${ents.map(([c,v],i)=>`<div class="row"><span class="t" style="font-weight:400"><span class="legend"><span style="--c:${CORES[i%CORES.length]}">${esc(c)}</span></span></span><span class="a">${brl(v)}</span><span class="s">${num(v/T.desp*100)}% das despesas · ${brl(T.kgProd?v/T.kgProd:0)}/kg</span></div>`).join('')}</div>`
    :'<p class="note">Sem despesas nesta safra.</p>'}
  </section>`;
}
};

/* ---------- conta: helpers ---------- */
const modsHtml = sel => MODS.map(m=>`<label class="ram"><input type="checkbox" name="mod" value="${m.k}" ${sel?.[m.k]?'checked':''}>
  <span><b>${m.n}</b><small>${m.d}${m.req?` · requer ${MODS.find(x=>x.k===m.req).n}`:''}</small></span></label>`).join('');
const fazForm = f => `<form id="fFaz" data-id="${f?.id||''}">
  <h3 class="full">${f?'Editar '+esc(f.nome):'Cadastrar fazenda'}</h3>
  <label class="full">Nome da fazenda<input id="zNome" value="${esc(f?.nome||'')}" required placeholder="Ex.: Fazenda Santa Rita"></label>
  <label>Inscrição Estadual (ICMS)<input id="zIe" inputmode="numeric" value="${esc(f?.ie||'')}" required placeholder="Somente números"></label>
  <label>CPF/CNPJ do produtor<input id="zDoc" inputmode="numeric" value="${esc(f?.doc||'')}" placeholder="Opcional"></label>
  <label>Município<input id="zMun" value="${esc(f?.municipio||'')}" required></label>
  <label>UF<select id="zUf">${UFS.map(x=>`<option ${x===(f?.uf||'PR')?'selected':''}>${x}</option>`).join('')}</select></label>
  <label class="full">Contribuição previdenciária<select id="zReg">${Object.entries(REG).map(([k,r])=>`<option value="${k}" ${k===(f?.dados.regime||'funrural')?'selected':''}>${r.nome} · ${r.desc}</option>`).join('')}</select></label>
  ${f?'':`<label class="ram full"><input type="checkbox" id="zEx"><span><b>Começar com dados de exemplo</b><small>Útil para testar o app. Dá para apagar depois em Conta.</small></span></label>`}
  <p class="err full" id="zErr" hidden></p>
  <button class="btn full">${f?'Salvar alterações':'Cadastrar fazenda'}</button>
  ${f?'<button type="button" class="btn full ghost" data-editfaz="">Cancelar</button>':''}
</form>`;

export { safras, chipsSafra, optTalhoes, V, modsHtml, fazForm };
