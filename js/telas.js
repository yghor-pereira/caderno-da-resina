import { brl, num, plural, esc, hoje, addD, diff, fdata, MES_SAFRA, safraIni, safraLbl, mIdx, sum } from './util.js';
import { CAT_IR, catIrDe, TIPOS_DOC, REGIMES_TRIB, CORES_ENT, MERCADO, DICAS, SAFRA, CATS_D, CATS_R, ATRASO_CRITICO, FORMAS, totalV, recV, saldoV, statusRec, chave, CORES, REG, fat, liqV, livreV, livre, pctRec, arv, painT, talById, ramsDe, S, dados, comFazenda, inSafra, totPaineis, tot, estoque, saldoAtual, nfPend, fluxo, ramStats, statusTalhoes } from './regras.js';
import { chart, legend, delta } from './graficos.js';
import { UFS } from './nfe.js';
import { movimentos, resumir, porEntidade, porFazenda, producaoMensal, matrizVendas, somaMatriz, resina, periodo } from './relatorios.js';
import { tela as telaPref } from './estado.js';
import { MODS, MOD_PADRAO, usuario, dadosFazenda, dadosRelatorio, fazAtual, mod, CUR, E, EX, SES, nPendentes, listaErros, nomeEnt, emitentePadrao, inscricaoPara, contaPara } from './estado.js';
import { mascaraDoc } from './doc.js';

const safras = () => [...new Set([CUR, ...S.producao.map(p=>safraIni(p.data)), ...S.estrias.map(e=>safraIni(e.data))])].sort();
const chipsSafra = () => `<div class="chips">${safras().map(y=>`<button type="button" data-safra="${y}" aria-pressed="${y===E.safraSel}">Safra ${safraLbl(y)}</button>`).join('')}</div>`;
/* links "editar · excluir" de um registro; excluir pede confirmação no próprio lugar */
const acoes = (tab, id, {editar=false, aviso=''}={}) => E.confirmar===tab+':'+id
  ? `${aviso?`<span class="down">${aviso}</span> `:''}<button type="button" class="lnk perigo" data-excluir="${tab}:${id}" data-ok="1">confirmar exclusão</button> · <button type="button" class="lnk" data-excluir="">cancelar</button>`
  : `${editar?`<button type="button" class="lnk" data-editar="${tab}:${id}">editar</button> · `:''}<button type="button" class="lnk" data-excluir="${tab}:${id}">excluir</button>`;
const editando = (tab, id) => E.editar===tab+':'+id;
const NOMES_TAB = {entidades_fiscais:'CPF/CNPJ', inscricoes_estaduais:'Inscrição estadual', contas_bancarias:'Conta bancária', perdas:'Perda', rateios:'Rateio',
  fazendas:'Fazenda', talhoes:'Talhão', ramais:'Ramal', contagens:'Contagem', estrias:'Estria', coletas:'Coleta', vendas:'Venda',
  recebimentos:'Recebimento', lancamentos:'Lançamento', compromissos:'Compromisso', compradores:'Comprador', perfis:'Perfil'};
const optTalhoes = sel => S.talhoes.map(t=>`<option ${t.nome===sel?'selected':''}>${esc(t.nome)}</option>`).join('');
const MOTIVOS_PERDA = ['Chuva','Saco rasgado','Roubo','Resina com sujeira','Fogo','Outro'];

/* ---------- CPFs/CNPJs: marca colorida, emitente, inscrição, conta e fazenda ---------- */
const entPor = id => usuario()?.entidades.find(e=>e.id===id) || null;
const fazPor = id => usuario()?.fazendas.find(f=>f.id===id) || null;
const chipEnt = e => `<span class="ent" style="--c:${esc(e?.cor||'var(--muted)')}">${esc(nomeEnt(e))}</span>`;
const variasEnt = () => (usuario()?.entidades.length||0) > 1;
const variasFaz = () => (usuario()?.fazendas.length||0) > 1;
const docTxt = e => e?.documento ? mascaraDoc(e.documento) : '';
const entsAtivas = sel => (usuario()?.entidades||[]).filter(e=>e.ativo || e.id===sel);
/* CPF/CNPJ em nome de quem: um toque troca. Vem marcado com o do filtro do topo, senão o padrão */
function emitHtml(name, sel, rotulo='Em nome de'){
  const es = entsAtivas(sel); if (!es.length) return '';
  const marcado = sel || emitentePadrao()?.id;
  return `<fieldset class="full fat"><legend>${rotulo}</legend><div class="chips">${es.map(e=>`<label class="opc"><input type="radio" name="${name}" value="${e.id}" ${e.id===marcado?'checked':''} required>${chipEnt(e)}</label>`).join('')}</div></fieldset>`;
}
/* fazenda: obrigatória na venda; opcional no financeiro ("Geral" = sem fazenda) */
function fazSelect(name, sel, {opcional=true, rotulo='Fazenda'}={}){
  const fs = usuario()?.fazendas||[];
  return `<label class="full">${rotulo}<select name="${name}" ${opcional?'':'required'}>${opcional?`<option value="">Geral (sem fazenda)</option>`:''}${fs.map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></label>`;
}
const lblConta = c => [c.apelido, c.banco, c.agencia&&'ag '+c.agencia, c.conta&&'cc '+c.conta].filter(Boolean).join(' · ') || 'Conta';
/* conta bancária: as contas de cada CPF/CNPJ, agrupadas; o app marca a do CPF/CNPJ escolhido */
function contaSelect(name, sel, {rotulo='Conta bancária'}={}){
  const es = entsAtivas().filter(e=>e.contas.length); if (!es.length) return '';
  return `<label class="full">${rotulo}<select name="${name}"><option value="">Sem conta informada</option>${es.map(e=>`<optgroup label="${esc(nomeEnt(e))}">${e.contas.filter(c=>c.ativo||c.id===sel).map(c=>`<option value="${c.id}" data-ent="${e.id}" ${c.id===sel?'selected':''}>${esc(lblConta(c))}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
}
/* inscrição estadual de quem emite a nota da venda */
function ieSelect(name, sel){
  const es = entsAtivas().filter(e=>e.inscricoes.length);
  return `<label class="full">Inscrição estadual de quem emite<select name="${name}"><option value="">Sem inscrição (nota avulsa)</option>${es.map(e=>`<optgroup label="${esc(nomeEnt(e))}">${e.inscricoes.filter(i=>i.ativo||i.id===sel).map(i=>`<option value="${i.id}" data-ent="${e.id}" data-uf="${i.uf}" ${i.id===sel?'selected':''}>IE ${esc(i.ie)} · ${esc(i.uf)}${i.descricao?' · '+esc(i.descricao):''}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
}
/* documento, contraparte, competência e categoria no IR: escondidos, para não pesar no campo */
function docCampos(x={}, tipo='d'){
  const auto = catIrDe({tipo, cat:x.cat}), comp = x.competencia && x.competencia!==x.data ? x.competencia : '';
  const aberto = x.tipoDoc || x.numDoc || x.contraparteNome || x.contraparteDoc || comp;
  return `<details class="mais full" ${aberto?'open':''}><summary>Documento, contraparte e IR</summary><div class="campos">
    <label>Competência<input name="comp" type="date" value="${comp}"><small class="note">Vazio = a data do pagamento</small></label>
    <label>Categoria no IR<select name="catir"><option value="">Automática</option>${Object.entries(CAT_IR).map(([k,n])=>`<option value="${k}" ${x.catIr && x.catIr!==auto && x.catIr===k?'selected':''}>${n}</option>`).join('')}</select></label>
    <label>Tipo de documento<select name="tdoc"><option value="">—</option>${Object.entries(TIPOS_DOC).map(([k,n])=>`<option value="${k}" ${x.tipoDoc===k?'selected':''}>${n}</option>`).join('')}</select></label>
    <label>Número<input name="ndoc" value="${esc(x.numDoc||'')}"></label>
    <label>${tipo==='r'?'Quem pagou':'Quem recebeu (fornecedor)'}<input name="cnome" value="${esc(x.contraparteNome||'')}"></label>
    <label>CPF/CNPJ dele<input name="cdoc" inputmode="numeric" data-mask="doc" value="${esc(x.contraparteDoc?mascaraDoc(x.contraparteDoc):'')}"></label>
  </div></details>`;
}
/* rateio: divide um lançamento entre as fazendas, em %; o que não for dividido fica onde o lançamento está */
function rateioCampos(x){
  const fs=usuario()?.fazendas||[]; if (fs.length<2) return '';
  const rs=S.rateios?.[x.id]||[];
  return `<details class="mais full" ${rs.length?'open':''}><summary>Dividir entre fazendas</summary><div class="campos">
    ${fs.map(f=>`<label>${esc(f.nome)} (%)<input name="rat:${f.id}" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${rs.find(r=>r.fazenda===f.id)?.percentual??''}"></label>`).join('')}
    <p class="note full">O que não for dividido (até 100%) fica na fazenda escolhida acima, ou em Geral. Os relatórios por fazenda usam esta divisão.</p></div></details>`;
}
/* ---------- mover em lote para outro CPF/CNPJ ou outra fazenda ---------- */
const podeMover = () => variasEnt() || variasFaz();
const selBtn = tab => podeMover() && E.sel?.tab!==tab ? `<button type="button" class="lnk" data-sel="${tab}">Selecionar para mover</button>` : '';
const selBar = tab => `<form id="fMover" class="selbar" data-tab="${tab}">
  <span class="full"><b id="selN">${plural(E.sel.ids.size,'selecionado','selecionados')}</b> · <button type="button" class="lnk" data-selall="1">todos</button> · <button type="button" class="lnk" data-selall="0">nenhum</button></span>
  <label>CPF/CNPJ<select name="ent"><option value="">Manter</option>${entsAtivas().map(e=>`<option value="${e.id}">${esc(nomeEnt(e))}</option>`).join('')}</select></label>
  <label>Fazenda<select name="faz"><option value="">Manter</option>${tab==='vendas'?'':'<option value="-">Geral (sem fazenda)</option>'}${(usuario()?.fazendas||[]).map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
  <button class="btn sm">Mover</button><button type="button" class="btn sm ghost" data-sel="">Cancelar</button>
  <p class="err full" hidden></p></form>`;
const rowSel = (id, t, a, sub) => `<label class="ram rsel"><input type="checkbox" name="selid" value="${id}" ${E.sel.ids.has(id)?'checked':''}><span><b>${t}</b> · ${a}<small>${sub}</small></span></label>`;
/* quem e de onde, no fim da linha de um registro */
const quemOnde = x => [variasEnt()?chipEnt(entPor(x.entidade)):'', variasFaz()||!x.fazenda ? esc(fazPor(x.fazenda)?.nome || 'Geral') : ''].filter(Boolean).join(' · ');
/* cabeçalho das telas da aba Fazendas: voltar, nome e as partes da fazenda */
function fazHead(){
  const f = fazAtual(), partes = [mod('floresta')&&['floresta','Floresta'], mod('producao')&&['producao','Produção'], mod('floresta')&&['perdas','Perdas'], ['fazenda','Cadastro']].filter(Boolean);
  return `<section class="sec">
    <button type="button" class="lnk" data-ir="fazendas" style="align-self:flex-start">← Todas as fazendas</button>
    <div class="sec-h"><h2>${esc(f?.nome||'')}</h2><span class="tag">${esc(f?.municipio||'')}/${esc(f?.uf||'')}${f?.area_ha!=null?' · '+num(f.area_ha,1)+' ha':''}</span></div>
    <div class="chips">${partes.map(([k,n])=>`<button type="button" data-ir="${k}" aria-pressed="${E.atual===k}">${n}</button>`).join('')}</div>
  </section>`;
}

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
      ${E.lMode==='criar'?`<div class="full sec" style="gap:6px"><span class="note">Quais funções você quer usar? Dá para mudar depois em Conta.</span><span class="note">O app registra quais telas e funções você usa (nunca valores ou descrições), para melhorar o Caderno.</span><div class="mods">${modsHtml(MOD_PADRAO)}</div></div>`:''}
      ${E.lAviso?`<p class="note full" id="lAviso" role="status"><b>${esc(E.lAviso)}</b></p>`:''}
      <p class="err full" id="lErr" ${E.lErro?'':'hidden'}>${esc(E.lErro)}</p>
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

senha(){
  return `
  <section class="card sec">
    <h2>Crie uma nova senha</h2>
    <p class="note">Sua senha foi redefinida por um administrador. Para continuar, escolha uma senha nova, só sua.</p>
    <form id="fSenha">
      <label class="full">Nova senha<input id="sNova" type="password" required minlength="6" autocomplete="new-password"></label>
      <label class="full">Repita a nova senha<input id="sRep" type="password" required minlength="6" autocomplete="new-password"></label>
      <p class="err full" id="sErr" hidden></p>
      <button class="btn full">Salvar nova senha</button>
    </form>
  </section>
  <button type="button" class="btn ghost" data-sair="1" data-ok="1">Sair da conta</button>`;
},

/* aba Fazendas: o cadastro operacional (imóvel, floresta, produção e perdas). O financeiro é global, em outras abas. */
fazendas(){
  const u=usuario(), fs=u.fazendas;
  return `
  <section class="sec">
    <h2>${E.intencao?`Em qual fazenda? <span class="note" style="font-weight:400">· ${{estria:'apontar estria',coleta:'apontar coleta',perda:'anotar perda'}[E.intencao]}</span>`:'Fazendas'}</h2>
    ${E.intencao?'<button type="button" class="lnk" data-intencao="" style="align-self:flex-start">Cancelar</button>':''}
    ${fs.length?`<div class="fzs">${fs.map(f=>{ const d=dadosFazenda(f.id); return `<button type="button" class="card fz" data-abrfaz="${f.id}"><b>${esc(f.nome)}</b>${f._erro?`<span class="err">${esc(f._erro)}</span>`:''}<span class="note">${esc(f.municipio)}/${esc(f.uf)}${f.area_ha!=null?' · '+num(f.area_ha,1)+' ha':''}</span><span class="note">${plural(d.talhoes.length,'talhão','talhões')} · ${plural(sum(d.talhoes,painT),'árvore','árvores')} · ${num(sum(d.producao.filter(inSafra(CUR)),x=>x.kg))} kg na safra</span></button>`; }).join('')}</div>`
    :'<p class="note">Cadastre sua primeira fazenda. Ela guarda a floresta, a produção e as perdas. CPFs, CNPJs, inscrições e contas ficam em Conta, nos cadastros financeiros.</p>'}
  </section>
  <section class="card sec">${fazForm(null)}</section>`;
},

conta(){
  const u=usuario(), erros=listaErros(), nIe=sum(u.entidades,e=>e.inscricoes.length), nContas=sum(u.entidades,e=>e.contas.length);
  return `
  <section class="sec">
    <div class="sec-h"><h2>Minha conta</h2><div class="hbtn">${E.admin?'<a class="btn sm ghost" href="admin.html">Área administrativa</a>':''}</div></div>
    <div class="card sec"><form id="fUser">
      <label>Nome<input id="uNome" value="${esc(u.nome)}" required></label>
      <label>E-mail<input value="${esc(u.email)}" disabled></label>
      <button class="btn full ghost">Salvar nome</button>
    </form></div>
  </section>
  <section class="card sec">
    <h3>CPFs, CNPJs e contas</h3>
    <p class="note">${plural(u.entidades.length,'CPF/CNPJ','CPFs/CNPJs')} · ${plural(nIe,'inscrição estadual','inscrições estaduais')} · ${plural(nContas,'conta bancária','contas bancárias')}. Quem emite as notas e em nome de quem ficam as contas a pagar e a receber.</p>
    <button type="button" class="btn sm ghost" data-ir="cadastros" style="align-self:flex-start">CPFs, CNPJs e contas</button>
  </section>
  <section class="card sec">
    <h3>Tela e uso no campo</h3>
    <p class="note">Vale para este aparelho.</p>
    <span class="note"><b>Tamanho da letra</b></span>
    <div class="seg">${[['n','Normal'],['g','Grande'],['gg','Muito grande']].map(([k,n])=>`<button type="button" data-letra="${k}" aria-pressed="${telaPref().letra===k}">${n}</button>`).join('')}</div>
    <span class="note"><b>Modo campo</b>: botões maiores e um Início simples, só com o que se registra no campo (estria, coleta, perda, despesa e venda).</span>
    <div class="seg"><button type="button" data-campoon="0" aria-pressed="${!telaPref().campo}">Desligado</button><button type="button" data-campoon="1" aria-pressed="${telaPref().campo}">Ligado</button></div>
  </section>
  <section class="card sec">
    <h3>Funções habilitadas</h3>
    <p class="note">Escolha o que aparece no app. Desligar uma função só esconde a tela; nenhum registro é apagado.</p>
    <div class="mods">${modsHtml(u.modulos)}</div>
  </section>
  ${erros.length?`<section class="card sec" id="erros">
    <h3>Alterações que não foram salvas na nuvem</h3>
    <p class="note">Corrija o registro (por exemplo, a Inscrição Estadual ou o CPF/CNPJ) e salve de novo; ele volta para a fila de envio.</p>
    <div class="list">${erros.map(({tabela,linha:l})=>`<div class="row"><span class="t">${NOMES_TAB[tabela]||tabela}${l.nome||l.ie?' · '+esc(l.nome||l.ie):''}</span><span class="s down">${esc(l._erro)}</span></div>`).join('')}</div>
  </section>`:''}
  ${E.sairPend?`<div class="box"><h3>Sair da conta</h3><span class="note">Há ${nPendentes()} alteraç${nPendentes()>1?'ões':'ão'} ainda não enviada${nPendentes()>1?'s':''}. Ela${nPendentes()>1?'s':''} fica${nPendentes()>1?'m':''} guardada${nPendentes()>1?'s':''} neste aparelho e ${nPendentes()>1?'são enviadas':'é enviada'} quando você entrar de novo. Sair mesmo assim?</span>
    <div class="hbtn"><button type="button" class="btn sm" style="background:var(--bad)" data-sair="1" data-ok="1">Sair mesmo assim</button><button type="button" class="btn sm ghost" data-sair="">Cancelar</button></div></div>`
  :'<button type="button" class="btn ghost" data-sair="1">Sair da conta</button>'}`;
},

/* Início: visão global (com os filtros do topo), alertas de todas as fazendas e o comparativo entre elas */
inicio(){
  const u=usuario(), T=tot(CUR), fx=fluxo(6), T0=hoje();
  const fs = u.fazendaSel ? u.fazendas.filter(f=>f.id===u.fazendaSel) : u.fazendas;
  /* alertas de floresta: cada fazenda com o intervalo ideal dela */
  const st = fs.flatMap(f=>comFazenda(dadosFazenda(f.id), ()=>statusTalhoes().map(s=>({...s, faz:f}))));
  const atrasados=st.filter(s=>s.atraso>0), onde = s => fs.length>1 ? esc(s.faz.nome)+' · ' : '';
  const prox=S.comp.filter(c=>c.data>=T0 && diff(T0,c.data)<=10).sort((a,b)=>a.data.localeCompare(b.data));
  const minS=Math.min(...fx.map(f=>f.saldo));
  const mesAtual=new Date().getMonth(), ini='JFMAMJJASOND';
  const alertas=[
    ...(mod('nfe')&&nfPend()?[`<div><span><b>${plural(nfPend(),'venda','vendas')}</b> aguardando emissão de NF-e</span></div>`]:[]),
    ...(mod('floresta')?atrasados:[]).map(s=>`<div style="--c:${s.atraso>ATRASO_CRITICO?'var(--bad)':'var(--amber)'}"><span>${onde(s)}<b>${esc(s.t.nome)}</b>: ${plural(s.atrasados.length,'ramal','ramais')} com estria atrasada (até ${plural(s.atraso,'dia','dias')})</span></div>`),
    ...(mod('floresta')?st.filter(s=>s.contVelha):[]).map(s=>`<div style="--c:var(--muted)"><span>${onde(s)}<b>${esc(s.t.nome)}</b>: ${plural(s.contVelha,'ramal','ramais')} sem recontagem de árvores há mais de 6 meses</span></div>`),
    ...(mod('caixa')?prox:[]).map(c=>`<div style="--c:${c.tipo==='d'?'var(--bad)':'var(--good)'}"><span>${fdata(c.data)} · ${esc(c.desc)}: <b>${c.tipo==='d'?'−':'+'} ${brl(c.valor)}</b></span></div>`)
  ];
  /* comparativo: cada fazenda e o que não tem fazenda (despesas e receitas gerais), na safra atual */
  const comp = u.fazendas.length>1 && !u.fazendaSel ? [...u.fazendas.map(f=>({f, d:dadosFazenda(f.id)})), {f:null}] : [];
  const linhaComp = ({f, d}) => {
    const fin = x => (!u.entidadeSel || x.entidade===u.entidadeSel) && (f ? x.fazenda===f.id : !x.fazenda) && safraIni(x.data)===CUR;
    const vend = sum(S.todas.vendas.filter(fin), liqV), rec = sum(S.todas.caixa.filter(x=>fin(x)&&x.tipo==='r'), x=>x.valor), desp = sum(S.todas.caixa.filter(x=>fin(x)&&x.tipo==='d'), x=>x.valor);
    const kg = d ? sum(d.producao.filter(inSafra(CUR)), x=>x.kg) : 0, arvs = d ? sum(d.talhoes, painT) : 0;
    return {f, kg, arvs, receita:vend+rec, desp, res:vend+rec-desp};
  };
  const rows = comp.map(linhaComp).filter(r=>r.f || r.receita || r.desp);
  if (telaPref().campo && !E.inicioCompleto) return inicioCampo(alertas);
  return `
  ${telaPref().campo?'<button type="button" class="lnk" data-iniciocompleto="0" style="align-self:flex-start">← Voltar aos atalhos do campo</button>':''}
  <section class="sec">
    <div class="sec-h"><h2>Mercado hoje</h2><span class="tag">${MERCADO.atualizado}</span></div>
    <div class="grid3">
      <div class="card q"><span class="l">Dólar</span><span class="v">${brl(MERCADO.dolar.v)}</span>${delta(MERCADO.dolar.d)}</div>
      <div class="card q"><span class="l">Euro</span><span class="v">${brl(MERCADO.euro.v)}</span>${delta(MERCADO.euro.d)}</div>
      <div class="card q res"><span class="l">Goma resina /kg</span><span class="v">${brl(MERCADO.resina.v)}</span>${delta(MERCADO.resina.d)}</div>
    </div>
    <p class="note">A resina é cotada em dólar: dólar alto costuma puxar o preço pago ao produtor. Seu preço médio na safra: <b>${brl(T.precoMedio)}/kg</b>, preço livre: <b class="liv">${brl(T.precoLivre)}/kg</b>.</p>
  </section>
  ${alertas.length?`<section class="card sec"><h3>Atenção nos próximos dias</h3><div class="alert">${alertas.join('')}</div></section>`:''}
  <section class="sec">
    <div class="sec-h"><h2>Safra ${safraLbl(CUR)} até agora</h2></div>
    <div class="kpis">
      ${mod('producao')?`<div class="card kpi"><div class="l">Produzido</div><div class="v">${num(T.kgProd)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Produtividade</div><div class="v">${num(T.kgPainel,2)} <small>kg/árvore</small></div></div>`:''}
      ${mod('caixa')?`<div class="card kpi"><div class="l">${u.fazendaSel?'Entradas − saídas da fazenda':'Saldo nas contas'}</div><div class="v ${saldoAtual()>=0?'up':'down'}">${brl(saldoAtual())}</div></div>
      <div class="card kpi"><div class="l">Menor saldo previsto (6 meses)</div><div class="v ${minS>=0?'':'down'}">${brl(minS)}</div></div>`:''}
      ${mod('vendas')?`<div class="card kpi"><div class="l">A receber</div><div class="v warn">${brl(sum(S.vendas,saldoV))}</div></div>`:''}
      ${mod('resultado')?`<div class="card kpi"><div class="l">Resultado na safra</div><div class="v ${T.lucro>=0?'up':'down'}">${brl(T.lucro)}</div></div>`:''}
    </div>
  </section>
  ${rows.length?`<section class="card sec">
    <h3>Por fazenda · safra ${safraLbl(CUR)}</h3>
    <div class="list">${rows.map(r=>`<div class="row"><span class="t">${r.f?`<button type="button" class="lnk" data-abrfaz="${r.f.id}">${esc(r.f.nome)}</button>`:'<i>Geral (sem fazenda)</i>'}</span>
      <span class="a ${r.res>=0?'up':'down'}">${brl(r.res)}</span>
      <span class="s">${r.f?`${num(r.kg)} kg · ${num(r.arvs?r.kg/r.arvs:0,2)} kg/árvore · `:''}Receitas ${brl(r.receita)} · Despesas ${brl(r.desp)}</span></div>`).join('')}</div>
    <div class="rec"><span><b>Total</b> · ${num(sum(rows,r=>r.kg))} kg · receitas ${brl(sum(rows,r=>r.receita))} · despesas ${brl(sum(rows,r=>r.desp))}</span><b class="${sum(rows,r=>r.res)>=0?'up':'down'}">${brl(sum(rows,r=>r.res))}</b></div>
    <p class="note">Receitas já líquidas da retenção. ${u.entidadeSel?`Só o financeiro de ${chipEnt(entPor(u.entidadeSel))}.`:'Todos os CPFs/CNPJs.'} Despesas sem fazenda (contador, impostos, administração) aparecem como Geral.</p>
  </section>`:''}
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

/* Financeiro global: contas pagas e recebidas, a pagar e a receber, e o saldo de cada conta bancária */
caixa(){
  const u=usuario(), fx=fluxo(6), minS=Math.min(...fx.map(f=>f.saldo)), T0=hoje(), modo=E.modoCaixa, real=modo==='real', tab=real?'lancamentos':'compromissos';
  const seg = `<div class="seg" data-grp="modo">${[['real','Pagos e recebidos'],['comp','A pagar e a receber'],['contas','Contas']].map(([k,n])=>`<button type="button" data-modo="${k}" aria-pressed="${modo===k}">${n}</button>`).join('')}</div>`;
  const topo = `
  <section class="sec">
    <h2>Fluxo de caixa previsto</h2>
    <div class="kpis">
      <div class="card kpi"><div class="l">${u.fazendaSel?'Entradas − saídas da fazenda':'Saldo hoje'}</div><div class="v ${saldoAtual()>=0?'up':'down'}">${brl(saldoAtual())}</div></div>
      <div class="card kpi"><div class="l">Saldo em ${fx.at(-1).lbl}</div><div class="v ${fx.at(-1).saldo>=0?'':'down'}">${brl(fx.at(-1).saldo)}</div></div>
    </div>
    <div class="card sec">
      ${chart({title:'Fluxo de caixa previsto',labels:fx.map(f=>f.lbl),bars:[{vals:fx.map(f=>f.ent),color:'var(--good)'},{vals:fx.map(f=>f.sai),color:'var(--bad)'}],lines:[{vals:fx.map(f=>f.saldo),color:'var(--amber)',axis:'r',dots:true}],h:190})}
      ${legend([{c:'var(--good)',t:'Entradas previstas'},{c:'var(--bad)',t:'Saídas previstas'},{c:'var(--amber)',t:'Saldo projetado (eixo direito)',ln:1}])}
      <p class="note">Saldo das contas hoje + contas a pagar e a receber + vendas a receber. ${minS<0?`<b class="down">O saldo fica negativo em ${fx.find(f=>f.saldo<0).lbl}.</b>`:`Menor saldo previsto: <b>${brl(minS)}</b>.`}</p>
    </div>
  </section>`;
  if (modo==='contas') {
    const es = u.entidades.filter(e=>!u.entidadeSel || e.id===u.entidadeSel);
    return topo + `<section class="card sec">${seg}
    ${es.map(e=>`<div class="box"><h3>${chipEnt(e)} <span class="note" style="font-weight:400">${e.tipo==='PF'?'CPF':'CNPJ'} ${docTxt(e)}</span></h3>
      <div class="list">${e.contas.map(c=>`<div class="row"><span class="t">${esc(lblConta(c))}${c.ativo?'':'<span class="pill sem">inativa</span>'}</span><span class="a ${c.saldo>=0?'up':'down'}">${brl(c.saldo)}</span><span class="s">Saldo inicial ${brl(c.saldoInicial)}</span></div>`).join('')}
        ${e.semConta?`<div class="row"><span class="t" style="font-weight:400"><i>Sem conta informada</i></span><span class="a ${e.semConta>=0?'up':'down'}">${brl(e.semConta)}</span><span class="s">Pagamentos e recebimentos sem conta</span></div>`:''}
        ${!e.contas.length&&!e.semConta?'<p class="note">Nenhuma conta cadastrada.</p>':''}</div>
      <div class="rec"><span>Total</span><b>${brl(sum(e.contas,c=>c.saldo)+e.semConta)}</b></div></div>`).join('')}
    ${es.length>1?`<div class="rec"><span><b>Total de todas as contas</b></span><b>${brl(sum(es,e=>sum(e.contas,c=>c.saldo)+e.semConta))}</b></div>`:''}
    <button type="button" class="btn sm ghost" data-ir="cadastros" style="align-self:flex-start">Cadastrar ou editar contas</button>
    ${u.fazendaSel?'<p class="note">O saldo é das contas, de todas as fazendas: o filtro de fazenda não muda esta lista.</p>':''}
  </section>`;
  }
  const lista = real
    ? [...S.caixa].sort((a,b)=>b.data.localeCompare(a.data)).slice(0, E.sel?.tab===tab ? 300 : 30)
    : [...S.comp, ...S.vendas.filter(v=>saldoV(v)>0).map(v=>({id:v.id,venda:true,data:v.venc||T0,tipo:'r',cat:'Venda de resina',desc:`A receber de ${v.comprador}`,valor:saldoV(v),entidade:v.entidade,fazenda:v.fazenda}))].sort((a,b)=>a.data.localeCompare(b.data));
  const sel = E.sel?.tab===tab, ent = emitentePadrao();
  return topo + `
  <section class="card sec">
    ${seg}
    <div class="seg"><button type="button" data-tipo="d" aria-pressed="${E.tipoLanc==='d'}">${real?'Paguei':'A pagar'}</button><button type="button" data-tipo="r" aria-pressed="${E.tipoLanc==='r'}">${real?'Recebi':'A receber'}</button></div>
    <form id="fCaixa">
      <label>${real?'Data do pagamento':'Vencimento'}<input name="data" type="date" value="${real?T0:addD(T0,30)}" required></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" inputmode="decimal" required></label>
      <label class="full">Categoria<select name="cat">${(E.tipoLanc==='d'?CATS_D:CATS_R).map(c=>`<option>${c}</option>`).join('')}</select></label>
      <label class="full">Descrição<input name="desc" placeholder="${real?'Ex.: diária de resineiro':'Ex.: parcela do arrendamento'}"></label>
      ${emitHtml('ent', null)}
      ${real?contaSelect('conta', contaPara(ent)?.id):''}
      ${fazSelect('faz', u.fazendaSel)}
      ${docCampos({}, E.tipoLanc)}
      <p class="err full" hidden></p>
      <button class="btn full">${real?'Lançar':'Agendar'}</button>
    </form>
  </section>
  <section class="card list">
    ${selBtn(tab)?`<div class="sec-h" style="padding-top:4px">${selBtn(tab)}</div>`:''}
    ${sel?selBar(tab):''}
    ${lista.map(x=>{
    if (sel && !x.venda) return rowSel(x.id, esc(x.desc||x.cat), `<span class="${x.tipo==='d'?'down':'up'}">${x.tipo==='d'?'−':'+'} ${brl(x.valor)}</span>`, `${fdata(x.data)} · ${esc(x.cat)} · ${quemOnde(x)}`);
    if (sel) return '';
    if (!x.venda && editando(tab, x.id)) return `<form class="fEdLanc row" data-tab="${tab}" data-id="${x.id}" data-tipo="${x.tipo}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label>${real?'Data do pagamento':'Vencimento'}<input name="data" type="date" value="${x.data}" required></label>
      <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0" inputmode="decimal" value="${x.valor}" required></label>
      <label class="full">Categoria<select name="cat">${(x.tipo==='d'?CATS_D:CATS_R).map(c=>`<option ${c===x.cat?'selected':''}>${c}</option>`).join('')}</select></label>
      <label class="full">Descrição<input name="desc" value="${esc(x.desc)}"></label>
      ${emitHtml('ent', x.entidade)}
      ${real?contaSelect('conta', x.conta):''}
      ${fazSelect('faz', x.fazenda)}
      ${rateioCampos(x)}
      ${docCampos(x, x.tipo)}
      <p class="err full" hidden></p>
      <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-editar="">Cancelar</button></div></form>`;
    return `
    <div class="row"><span class="t">${esc(x.desc||x.cat)}</span><span class="a ${x.tipo==='d'?'down':'up'}">${x.tipo==='d'?'−':'+'} ${brl(x.valor)}</span>
    <span class="s">${fdata(x.data)} · ${esc(x.cat)}${quemOnde(x)?' · '+quemOnde(x):''}${S.rateios?.[x.id]?.length?` · dividido entre ${plural(S.rateios[x.id].length,'fazenda','fazendas')}`:''}${!real&&!x.venda?` · <button type="button" class="lnk" data-realizar="${x.id}">marcar como pago</button>`:''}${x.venda?' · ver em Vendas':` · ${acoes(tab, x.id, {editar:true})}`}</span></div>`; }).join('') || `<p class="note">${real?'Nenhum pagamento ou recebimento ainda.':'Nada a pagar ou a receber. Agende salários, insumos e vendas previstas para ver o fluxo.'}</p>`}
  </section>`;
},

floresta(){
  const T0=hoje();
  E.talSel = talById(E.talSel)? E.talSel : S.talhoes[0]?.id;
  const t=talById(E.talSel);
  const sub = `<div class="seg">${[['ramais','Talhões e ramais'],['apontar','Apontar'],['estrias','Estrias']].map(([k,l])=>`<button type="button" data-fl="${k}" aria-pressed="${E.flMode===k}">${l}</button>`).join('')}</div>`;
  const chipsTal = (attr='tal', sel=E.talSel) => `<div class="chips">${S.talhoes.map(x=>`<button type="button" data-${attr}="${x.id}" aria-pressed="${x.id===sel}">${esc(x.nome)}</button>`).join('')}</div>`;
  const nRam = sum(S.talhoes,x=>x.ramais.length);
  const head = fazHead() + `
  <section class="sec">
    <span class="tag">${plural(S.talhoes.length,'talhão','talhões')} · ${plural(nRam,'ramal','ramais')} · ${plural(totPaineis(),'árvore','árvores')}</span>
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
        <div class="sec-h"><span class="note">${E.opTipo!=='estria' ? 'Marque os ramais coletados.' : E.apSel.size ? 'Já vêm marcados os ramais com estria vencendo.' : avisoSemVencer(ta)}</span>
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
  return fazHead() + `
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
  const u=usuario(), T=tot(E.safraSel), T0=hoje(), sel=E.sel?.tab==='vendas', ent=emitentePadrao();
  const fazV = u.fazendaSel || u.fazendas[0]?.id, ieV = inscricaoPara(ent, fazPor(fazV))?.id;
  const vs=S.vendas.filter(inSafra(E.safraSel)).sort((a,b)=>a.data.localeCompare(b.data));
  const aRec=sum(S.vendas,saldoV);
  const pillRec = v => ({pend:'<span class="pill pend">A receber</span>',parcial:'<span class="pill pend">Parcial</span>',ok:'<span class="pill ok">Recebido</span>'})[statusRec(v)];
  const pillNf = v => !mod('nfe') ? '' : !v.comNota ? '<span class="pill sem">Sem nota</span>' : v.nf ? `<span class="pill nf">NF-e ${esc(v.nf.numero)}</span>` : '<span class="pill nfp">NF-e a emitir</span>';
  return `
  <section class="sec">
    <div class="sec-h"><h2>Vendas e compradores</h2>${chipsSafra()}</div>
    <p class="note">Preço livre = preço de venda × ${num(REG.funrural.f,4)} (Funrural) ou × ${num(REG.folha.f,4)} (folha), conforme o regime de quem emite a nota (em <button type="button" class="lnk" data-ir="cadastros">CPFs, CNPJs e contas</button>). É o valor que cai na conta. As vendas já registradas mantêm o desconto da época.</p>
    <div class="kpis">
      <div class="card kpi"><div class="l">Preço médio da safra</div><div class="v">${brl(T.precoMedio)}<small>/kg</small></div></div>
      <div class="card kpi" style="border-color:var(--pine)"><div class="l">Preço livre médio</div><div class="v liv">${brl(T.precoLivre)}<small>/kg</small></div></div>
      <div class="card kpi"><div class="l">A receber (líquido)</div><div class="v warn">${brl(aRec)}</div></div>
      ${mod('nfe')?`<div class="card kpi"><div class="l">NF-e a emitir</div><div class="v ${nfPend()?'warn':''}">${nfPend()}</div></div>`:`<div class="card kpi"><div class="l">Vendido na safra</div><div class="v">${num(T.kgVend)} <small>kg</small></div></div>`}
    </div>
    <p class="note">Vendido na safra: <b>${num(T.kgVend)} kg</b> · ${brl(T.vendido)} bruto · ${brl(T.contrib)} retidos (Funrural ou folha).</p>
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
      <datalist id="comps">${[...new Set(S.todas.vendas.map(v=>v.comprador))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      ${fazSelect('faz', fazV, {opcional:false, rotulo:'Fazenda de onde saiu a resina'})}
      ${emitHtml('ent', ent?.id, 'Quem emite a nota')}
      ${ieSelect('ie', ieV)}
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
  <section class="card list" style="padding-block:2px">
    ${selBtn('vendas')?`<div class="sec-h" style="padding-top:10px">${selBtn('vendas')}</div>`:''}
    ${sel?selBar('vendas')+[...vs].reverse().map(v=>rowSel(v.id, esc(v.comprador), brl(liqV(v)), `${fdata(v.data)} · ${num(v.kg)} kg · ${quemOnde(v)}`)).join(''):''}
    ${sel?'':[...vs].reverse().map(v=>{
    const st=statusRec(v), pct=pctRec(v), dif=T.precoLivre?(livreV(v)/T.precoLivre-1)*100:0;
    return `
    <details class="venda" ${v.id===E.aberta?'open':''} data-venda="${v.id}">
      <summary><span class="t">${esc(v.comprador)}</span><span class="a">${brl(liqV(v))}<br><small class="note" style="font-weight:400">líquido</small></span>
        <span class="s">${fdata(v.data)} · ${num(v.kg)} kg a ${brl(v.preco)} · livre <b class="liv">${brl(livreV(v))}/kg</b> <span class="${dif>=0?'up':'down'}">(${dif>=0?'+':''}${num(dif,1)}% vs média)</span></span>
        <span class="pills">${variasEnt()?chipEnt(entPor(v.entidade)):''}${variasFaz()?`<span class="pill sem">${esc(fazPor(v.fazenda)?.nome||'')}</span>`:''}${pillNf(v)}${pillRec(v)}</span></summary>
      <div class="det">
        ${editando('vendas',v.id)?`<form class="fEdVenda box" data-id="${v.id}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="full">Comprador<input name="comprador" value="${esc(v.comprador)}" required></label>
          <label>Quantidade (kg)<input name="kg" type="number" min="1" inputmode="numeric" value="${v.kg}" required></label>
          <label>Preço por kg (R$)<input name="preco" type="number" step="0.01" min="0.01" inputmode="decimal" value="${v.preco}" required></label>
          <label>Data da venda<input name="data" type="date" value="${v.data}" required></label>
          <label>Previsão de recebimento<input name="venc" type="date" value="${v.venc||''}"></label>
          ${fazSelect('faz', v.fazenda, {opcional:false})}
          ${v.nf?`<p class="note full">A nota já foi emitida por ${chipEnt(entPor(v.entidade))}: quem emite não muda mais.</p>`:emitHtml('ent', v.entidade, 'Quem emite a nota')+ieSelect('ie', v.inscricao)}
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
            <label>Data do recebimento<input name="d" type="date" value="${T0}" required></label>
            <label>Valor (R$)<input name="val" type="number" step="0.01" min="0.01" max="${saldoV(v)}" value="${saldoV(v).toFixed(2)}" inputmode="decimal" required></label>
            <label class="full">Forma<select name="f">${FORMAS.map(f=>`<option>${f}</option>`).join('')}</select></label>
            ${contaSelect('conta', contaPara(entPor(v.entidade))?.id, {rotulo:'Conta que recebeu'})}
            <button class="btn sm full">Registrar recebimento</button>
          </form>${mod('nfe') && v.comNota && !v.nf ? '<span class="note">Dica: emita a NF-e antes de receber, para o comprador ter o documento.</span>':''}` : ''}
        </div>
      </div>
    </details>`;}).join('')}
    ${vs.length?'':'<p class="note" style="padding-block:12px">Nenhuma venda nesta safra.</p>'}
  </section>
  <dialog id="dlgNf"></dialog>`;
},

/* perdas da fazenda: resina (kg) e árvores (das recontagens dos ramais) */
perdas(){
  const T0=hoje(), y=E.safraSel, ps=S.perdas.filter(inSafra(y)).sort((a,b)=>b.data.localeCompare(a.data));
  const kgProd=sum(S.producao.filter(inSafra(y)),x=>x.kg), kgPerda=sum(ps,x=>x.kg);
  /* árvores perdidas: quedas de uma contagem para a seguinte, por mortalidade ou quebra */
  const arvP = S.talhoes.flatMap(t=>t.ramais.flatMap(r=>r.hist.map((h,i)=>({t, r, h, d: i ? r.hist[i-1].arv-h.arv : 0})))).filter(x=>x.d>0 && safraIni(x.h.data)===y && x.h.motivo!=='Recontagem');
  return fazHead() + `
  <section class="sec">
    <div class="sec-h"><h2>Perdas</h2>${chipsSafra()}</div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Resina perdida na safra</div><div class="v ${kgPerda?'down':''}">${num(kgPerda)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Da produção</div><div class="v">${num(kgProd?kgPerda/kgProd*100:0,1)} <small>%</small></div></div>
      <div class="card kpi"><div class="l">Árvores perdidas</div><div class="v ${arvP.length?'down':''}">${num(sum(arvP,x=>x.d))}</div></div>
      <div class="card kpi"><div class="l">Em estoque hoje</div><div class="v">${num(estoque())} <small>kg</small></div></div>
    </div>
  </section>
  <section class="card sec">
    <h3>Anotar perda de resina</h3>
    <form id="fPerda">
      <label>Data<input name="data" type="date" value="${T0}" required></label>
      <label>Quantidade (kg)<input name="kg" type="number" min="0.1" step="0.1" inputmode="decimal" required></label>
      <label>Motivo<select name="motivo">${MOTIVOS_PERDA.map(m=>`<option>${m}</option>`).join('')}</select></label>
      <label>Talhão<select name="tal"><option value="">Fazenda toda</option>${S.talhoes.map(t=>`<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></label>
      <label class="full">Observação<input name="obs" placeholder="Opcional"></label>
      <button class="btn full">Anotar perda</button>
    </form>
    <p class="note">A perda sai do estoque. Árvores mortas ou quebradas se anotam na recontagem do ramal (Floresta → toque no ramal).</p>
  </section>
  <section class="card sec"><h3>Resina perdida · safra ${safraLbl(y)}</h3>
    <div class="list">${ps.map(x=>`<div class="row"><span class="t">${esc(x.motivo)}</span><span class="a down">${num(x.kg,1)} kg</span><span class="s">${fdata(x.data)} · ${esc(talById(x.talhao)?.nome||'Fazenda toda')}${x.obs?' · '+esc(x.obs):''} · ${acoes('perdas', x.id)}</span></div>`).join('') || '<p class="note">Nenhuma perda de resina anotada nesta safra.</p>'}</div>
  </section>
  <section class="card sec"><h3>Árvores perdidas · safra ${safraLbl(y)}</h3>
    <div class="list">${arvP.map(x=>`<div class="row"><span class="t">${esc(x.t.nome)} · ${esc(x.r.cod)}</span><span class="a down">− ${plural(x.d,'árvore','árvores')}</span><span class="s">${fdata(x.h.data)} · ${esc(x.h.motivo)}</span></div>`).join('') || '<p class="note">Nenhuma árvore perdida nas recontagens desta safra.</p>'}</div>
  </section>`;
},

/* cadastro da fazenda: o imóvel */
fazenda(){
  const f=fazAtual();
  return fazHead() + `<section class="card sec">${fazForm(f)}</section>
  <section class="card sec"><h3>Apagar registros</h3>
    <span class="note">Remove talhões, operações, perdas, vendas e lançamentos desta fazenda. O cadastro continua.</span>
    ${E.limparPend===f.id?`<div class="hbtn"><button type="button" class="btn sm" style="background:var(--bad)" data-limpafaz="${f.id}" data-ok="1">Confirmar: apagar tudo</button><button type="button" class="btn sm ghost" data-limpafaz="">Cancelar</button></div>`
    :`<button type="button" class="btn sm ghost" data-limpafaz="${f.id}" style="align-self:flex-start">Apagar registros desta fazenda</button>`}
    ${f.demo?`<span class="note">Dados de exemplo gerados em ${f.demo_gerado_em?fdata(f.demo_gerado_em):'—'}. Regerar troca os registros por exemplos novos, com datas a partir de hoje.</span>
    <button type="button" class="btn sm ghost" data-regerar="${f.id}" style="align-self:flex-start">Regerar dados de exemplo</button>`:''}
  </section>`;
},

/* cadastro administrativo-financeiro: CPFs e CNPJs, inscrições estaduais, contas bancárias e declarações de IR */
cadastros(){
  const u=usuario();
  return `
  <section class="sec">
    <div class="sec-h"><h2>CPFs, CNPJs e contas</h2><button type="button" class="btn sm ghost" data-ir="conta">Voltar</button></div>
    <p class="note">Quem emite as notas e em nome de quem ficam as contas a pagar e a receber. Cada CPF ou CNPJ tem as suas inscrições estaduais e contas bancárias. As fazendas ficam na aba Fazendas.</p>
  </section>
  <section class="card sec">
    <div class="sec-h"><h3>CPFs e CNPJs</h3>${E.entEdit?'':'<button type="button" class="btn sm ghost" data-entedit="novo">Adicionar</button>'}</div>
    ${E.entEdit==='novo'?entForm(null):''}
    <div class="list">${u.entidades.map(e=>E.entEdit===e.id ? entForm(e) : `<div class="row"><span class="t">${chipEnt(e)}${e.padrao?'<span class="pill ok">padrão</span>':''}${e.ativo?'':'<span class="pill sem">inativo</span>'}</span>
      <span class="a"><button type="button" class="lnk" data-entedit="${e.id}">Editar</button></span>
      <span class="s">${e.tipo==='PF'?'CPF':'CNPJ'} ${e.documento?docTxt(e):'<b class="warn">a preencher</b>'} · ${esc(e.nome)} · ${REG[e.previdencia]?.nome||''} · ${plural(e.inscricoes.length,'inscrição','inscrições')} · ${plural(e.contas.length,'conta','contas')}${e._erro?` · <span class="down">${esc(e._erro)}</span>`:''}</span></div>`).join('') || '<p class="note">Nenhum CPF/CNPJ ainda. Ele aparece depois da primeira sincronização ou quando você adicionar.</p>'}</div>
  </section>
  <section class="card sec">
    <div class="sec-h"><h3>Declarações de Imposto de Renda</h3><span class="pill pend">Em desenvolvimento</span></div>
    <p class="note">Recurso em desenvolvimento: será disponibilizado em futuras versões. Aqui você vai guardar as declarações de cada CPF e CNPJ (ano, recibo, situação) e gerar o livro caixa da atividade rural para o contador.</p>
  </section>`;
},

resultado(){
  if (E.modoRes==='rel') return segRes() + relatorios();
  const T=tot(E.safraSel);
  const porCat={}; S.caixa.filter(x=>x.tipo==='d'&&safraIni(x.data)===E.safraSel).forEach(x=>porCat[x.cat]=(porCat[x.cat]||0)+x.valor);
  const ents=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  const margemKg=T.precoLivre-T.custoKg, pct=T.receita?T.lucro/T.receita*100:0;
  return segRes() + `
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

/* estria: nenhum ramal vencendo no talhão escolhido; aponta os talhões que têm ramal vencendo */
function avisoSemVencer(t){
  const outros = S.talhoes.filter(x=>x.id!==t.id && x.ramais.some(r=>{ const st=ramStats(x,r); return st.desde==null || st.desde>=S.ideal-2; }));
  return `<b>Nenhum ramal com estria vencendo no ${esc(t.nome)}.</b> Marque à mão os que vai estriar${outros.length?`, ou vá para ${outros.map(x=>`<button type="button" class="lnk" data-aptal="${x.id}">${esc(x.nome)}</button>`).join(', ')}, que tem ramal vencendo`:''}.`;
}
/* ---------- modo campo: Início com atalhos grandes ---------- */
const ICONES = {
  estria:'<path d="M5 20 19 6"/><path d="M14 6h5v5"/>', coleta:'<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>',
  perda:'<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/><path d="M5 5l14 14"/>', despesa:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M8 15h3"/>',
  venda:'<path d="M4 7h16l-1.5 11h-13z"/><path d="M9 7a3 3 0 0 1 6 0"/>'};
function inicioCampo(alertas){
  const acoes = [mod('floresta')&&['estria','Apontar estria'], mod('floresta')&&['coleta','Apontar coleta'], mod('floresta')&&['perda','Anotar perda'],
    mod('caixa')&&['despesa','Lançar despesa'], mod('vendas')&&['venda','Registrar venda']].filter(Boolean);
  return `
  <section class="sec">
    <h2>O que você vai registrar?</h2>
    <div class="campo-acoes">${acoes.map(([k,n])=>`<button type="button" data-campo="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg>${n}</button>`).join('')}</div>
  </section>
  ${alertas.length?`<section class="card sec"><h3>Atenção nos próximos dias</h3><div class="alert">${alertas.join('')}</div></section>`:''}
  <p class="note">Sem sinal, tudo fica guardado no aparelho e é enviado quando a internet voltar.</p>
  <button type="button" class="btn ghost" data-iniciocompleto="1">Ver o Início completo</button>`;
}

/* ---------- relatórios (aba Resultado) ---------- */
const segRes = () => `<div class="seg">${[['margem','Custo e margem'],['rel','Relatórios']].map(([k,n])=>`<button type="button" data-modores="${k}" aria-pressed="${E.modoRes===k}">${n}</button>`).join('')}</div>`;
const anoAtual = () => +hoje().slice(0,4);
/* período escolhido: as duas últimas safras, os dois últimos anos ou de/até */
function periodoAtual(){
  const P=E.periodo, ano = P.ano ?? (P.tipo==='ano' ? anoAtual() : CUR);
  return {...periodo(P.tipo, ano, P), base:P.base};
}
function relatorios(){
  const u=usuario(), d=dadosRelatorio(), P=E.periodo, p=periodoAtual(), fz=u.fazendaSel;
  const ms=movimentos(d, p).filter(m=>!fz || m.fazenda===fz), t=resumir(ms), r=resina(d, p, fz);
  const fazendas = fz ? u.fazendas.filter(f=>f.id===fz) : u.fazendas, ents = u.entidades.filter(e=>!u.entidadeSel || e.id===u.entidadeSel);
  const pe=porEntidade(ms, ents), pf=porFazenda(ms, fazendas), pm=producaoMensal(d, p, fazendas), mx=matrizVendas(d, p);
  const entsVenda = ents.filter(e=>Object.values(mx).some(l=>l[e.id])), fazVenda = fazendas.filter(f=>mx[f.id]);
  const opcoes = [...[CUR-1, CUR].map(y=>['safra', y, `Safra ${safraLbl(y)}`]), ...[anoAtual()-1, anoAtual()].map(y=>['ano', y, `Ano ${y}`])];
  const marc = (tipo, y) => P.tipo===tipo && (P.ano ?? (tipo==='ano'?anoAtual():CUR))===y;
  /* listas em vez de tabelas: nada rola para o lado no celular */
  const linhaRes = (nome, x, extra='') => `<div class="row"><span class="t">${nome}</span><span class="a ${x.res>=0?'up':'down'}">${brl(x.res)}</span><span class="s">Receitas ${brl(x.receita)} · Despesas ${brl(x.desp)}${extra}</span></div>`;
  const totalRes = x => `<div class="rec"><span><b>Total</b> · receitas ${brl(x.receita)} · despesas ${brl(x.desp)}</span><b class="${x.res>=0?'up':'down'}">${brl(x.res)}</b></div>`;
  const cores = i => CORES[i % CORES.length];
  return `
  <section class="sec">
    <h2>Relatórios</h2>
    <div class="chips">${opcoes.map(([tp,y,n])=>`<button type="button" data-per="${tp}:${y}" aria-pressed="${marc(tp,y)}">${n}</button>`).join('')}<button type="button" data-per="livre" aria-pressed="${P.tipo==='livre'}">Outro período</button></div>
    ${P.tipo==='livre'?`<form id="fPeriodo"><label>De<input name="de" type="date" value="${P.de||p.de}" required></label><label>Até<input name="ate" type="date" value="${P.ate||p.ate}" required></label><button class="btn sm full ghost">Ver período</button></form>`:''}
    <div class="seg">${[['competencia','Competência'],['caixa','Caixa']].map(([k,n])=>`<button type="button" data-base="${k}" aria-pressed="${P.base===k}">${n}</button>`).join('')}</div>
    <p class="note">${fdata(p.de)}/${p.de.slice(0,4)} a ${fdata(p.ate)}/${p.ate.slice(0,4)}. ${P.base==='caixa'?'<b>Caixa</b>: vendas pelo que foi recebido, na data do recebimento; despesas pela data do pagamento.':'<b>Competência</b>: vendas pela data da venda; despesas pelo mês a que se referem.'} Receitas já líquidas de Funrural/folha.</p>
    <div class="kpis">
      <div class="card kpi"><div class="l">Receitas</div><div class="v up">${brl(t.receita)}</div></div>
      <div class="card kpi"><div class="l">Despesas</div><div class="v down">${brl(t.desp)}</div></div>
      <div class="card kpi"><div class="l">Resultado</div><div class="v ${t.res>=0?'up':'down'}">${brl(t.res)}</div></div>
      <div class="card kpi"><div class="l">Resina coletada</div><div class="v">${num(r.coletado)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Vendida</div><div class="v">${num(r.vendido)} <small>kg</small></div></div>
      <div class="card kpi"><div class="l">Perdida</div><div class="v ${r.perdido?'down':''}">${num(r.perdido)} <small>kg</small></div></div>
    </div>
  </section>
  <section class="card sec">
    <h3>Por CPF/CNPJ</h3>
    <div class="list">${pe.map(x=>linhaRes(x.id?chipEnt(entPor(x.id)):'<i>Sem CPF/CNPJ</i>', x, ` · <b>vendas ${brl(x.vendas)}</b>`)).join('') || '<p class="note">Sem movimento no período.</p>'}</div>
    ${pe.length>1?totalRes(t):''}
    <p class="note">"Vendas" é o que cada CPF/CNPJ faturou de resina no período: serve para acompanhar o teto de faturamento de cada um.</p>
  </section>
  <section class="card sec">
    <h3>Por fazenda</h3>
    <div class="list">${pf.map(x=>linhaRes(x.id?esc(fazPor(x.id)?.nome||''):'<i>Geral (sem fazenda)</i>', x)).join('') || '<p class="note">Sem movimento no período.</p>'}</div>
    ${pf.length>1?totalRes(t):''}
    <p class="note">Despesas divididas entre fazendas (rateio) entram na parte de cada uma. O que não tem fazenda aparece como Geral.</p>
  </section>
  ${mod('producao')||mod('floresta')?`<section class="card sec">
    <h3>Produção por mês</h3>
    ${chart({title:'Produção por fazenda e mês', labels:pm.meses.map(m=>MES_SAFRA[mIdx(m+'-01')]), bars:fazendas.map((f,i)=>({vals:pm.linhas[f.id], color:cores(i)})), h:180})}
    ${fazendas.length>1?legend(fazendas.map((f,i)=>({c:cores(i), t:esc(f.nome)}))):''}
    <div class="list">${fazendas.map(f=>{ const rf=resina(d, p, f.id), arvs=sum(d.talhoes.filter(x=>x.fazenda===f.id), painT);
      return `<div class="row"><span class="t">${esc(f.nome)}</span><span class="a">${num(rf.coletado)} kg</span><span class="s">Perdido ${num(rf.perdido)} kg · ${num(arvs?rf.coletado/arvs:0,2)} kg/árvore</span></div>`; }).join('')}</div>
    ${fazendas.length>1?`<div class="rec"><span><b>Total coletado</b> · perdido ${num(r.perdido)} kg</span><b>${num(r.coletado)} kg</b></div>`:''}
    <p class="note">A produção é da fazenda: não depende de quem emitiu a nota.</p>
  </section>`:''}
  ${mod('vendas')?`<section class="card sec">
    <h3>Venda cruzada: fazenda × quem emitiu</h3>
    ${fazVenda.length?fazVenda.map(f=>{ const tf=somaMatriz(mx,'fazenda',f.id); return `<div class="box"><div class="rec"><span><b>${esc(f.nome)}</b></span><b>${num(tf.kg)} kg · ${brl(tf.valor)}</b></div>
      ${entsVenda.filter(e=>mx[f.id]?.[e.id]).map(e=>{ const c=mx[f.id][e.id]; return `<div class="rec"><span>${chipEnt(e)}</span><span>${num(c.kg)} kg · ${brl(c.valor)}</span></div>`; }).join('')}</div>`; }).join('')
    + (entsVenda.length>1?`<div class="box"><div class="rec"><span><b>Total por quem emitiu</b></span><b>${num(r.vendido)} kg</b></div>${entsVenda.map(e=>{ const c=somaMatriz(mx,'entidade',e.id); return `<div class="rec"><span>${chipEnt(e)}</span><span>${num(c.kg)} kg · ${brl(c.valor)}</span></div>`; }).join('')}</div>`:'')
    + `<p class="note">De onde saiu a resina e por qual CPF/CNPJ foi vendida, pela data da venda (valores líquidos).</p>`
    :'<p class="note">Nenhuma venda no período.</p>'}
  </section>`:''}`;
}

/* ---------- conta: helpers ---------- */
const modsHtml = sel => MODS.map(m=>`<label class="ram"><input type="checkbox" name="mod" value="${m.k}" ${sel?.[m.k]?'checked':''}>
  <span><b>${m.n}</b><small>${m.d}${m.req?` · requer ${MODS.find(x=>x.k===m.req).n}`:''}</small></span></label>`).join('');
const optUf = sel => UFS.map(x=>`<option ${x===(sel||'PR')?'selected':''}>${x}</option>`).join('');
/* fazenda = o imóvel: nome, município, UF, área, NIRF/CIB e CAR (sem inscrição estadual: ela é do CPF/CNPJ) */
const fazForm = f => `<form id="fFaz" data-id="${f?.id||''}">
  <h3 class="full">${f?'Dados da fazenda':'Cadastrar fazenda'}</h3>
  <label class="full">Nome da fazenda<input id="zNome" value="${esc(f?.nome||'')}" required placeholder="Ex.: Fazenda Santa Rita"></label>
  <label>Município<input id="zMun" value="${esc(f?.municipio||'')}" required></label>
  <label>UF<select id="zUf">${optUf(f?.uf)}</select></label>
  <label>Área (ha)<input id="zArea" type="number" min="0" step="0.01" inputmode="decimal" value="${f?.area_ha??''}"></label>
  <label>NIRF / CIB<input id="zNirf" value="${esc(f?.nirf_cib||'')}"></label>
  <label class="full">CAR<input id="zCar" value="${esc(f?.car||'')}"></label>
  ${f?'':`<label class="ram full"><input type="checkbox" id="zEx"><span><b>Começar com dados de exemplo</b><small>Útil para testar o app. Dá para apagar depois.</small></span></label>`}
  <p class="err full" id="zErr" hidden></p>
  <button class="btn full">${f?'Salvar':'Cadastrar fazenda'}</button>
</form>`;
function entForm(e){
  const tipo = e?.tipo||'PF', cor = e?.cor || CORES_ENT[(usuario()?.entidades.length||0) % CORES_ENT.length], u = usuario();
  const usos = e ? sum(['vendas','caixa','comp'], k=>u.global.todas[k].filter(x=>x.entidade===e.id).length) : 0;
  return `<div class="box"><form id="fEnt" data-id="${e?.id||''}">
    <h3 class="full">${e?'Editar '+esc(nomeEnt(e)):'Novo CPF ou CNPJ'}</h3>
    <div class="chips full">${[['PF','Pessoa física (CPF)'],['PJ','Empresa (CNPJ)']].map(([k,n])=>`<label class="opc"><input type="radio" name="tipo" value="${k}" ${k===tipo?'checked':''}>${n}</label>`).join('')}</div>
    <label class="full">Nome ou razão social<input name="nome" value="${esc(e?.nome||'')}" required></label>
    <label>Apelido<input name="apelido" value="${esc(e?.apelido||'')}" placeholder="Ex.: CPF João"></label>
    <label>CPF ou CNPJ<input name="doc" inputmode="numeric" data-mask="doc" value="${esc(docTxt(e))}" placeholder="Somente números"></label>
    <label class="full">Regime tributário<select name="regime">${Object.entries(REGIMES_TRIB).map(([k,n])=>`<option value="${k}" ${k===(e?.regime||(tipo==='PF'?'PF_ATIVIDADE_RURAL':'SIMPLES'))?'selected':''}>${n}</option>`).join('')}</select></label>
    <label class="full">Contribuição previdenciária nas vendas<select name="prev">${Object.entries(REG).map(([k,r])=>`<option value="${k}" ${k===(e?.previdencia||'funrural')?'selected':''}>${r.nome} · ${r.desc}</option>`).join('')}</select></label>
    <fieldset class="full fat"><legend>Cor nos botões e relatórios</legend><div class="chips">${CORES_ENT.map(c=>`<label class="opc"><input type="radio" name="cor" value="${c}" ${c===cor?'checked':''}><span class="ent" style="--c:${c}" aria-label="cor ${c}">&#8203;</span></label>`).join('')}</div></fieldset>
    <label class="ram"><input type="checkbox" name="padrao" ${e?.padrao?'checked disabled':''}><span><b>Padrão</b><small>Vem marcado nos lançamentos</small></span></label>
    <label class="ram"><input type="checkbox" name="ativo" ${e?.ativo!==false?'checked':''} ${e?.padrao?'disabled':''}><span><b>Ativo</b><small>Inativo sai dos botões; os registros ficam</small></span></label>
    <p class="err full" hidden></p>
    <div class="hbtn full"><button class="btn sm">Salvar</button><button type="button" class="btn sm ghost" data-entedit="">Cancelar</button></div>
  </form>
  ${e?`<h3>Inscrições estaduais</h3>
    <div class="list">${e.inscricoes.map(i=>`<div class="row"><span class="t">IE ${esc(i.ie)} · ${esc(i.uf)}${i.ativo?'':'<span class="pill sem">inativa</span>'}</span><span class="s">${esc(i.municipio)}${i.descricao?' · '+esc(i.descricao):''}${i._erro?` · <span class="down">${esc(i._erro)}</span>`:''} · ${acoes('inscricoes_estaduais', i.id)}</span></div>`).join('') || '<p class="note">Nenhuma inscrição. Sem ela, a nota sai sem IE.</p>'}</div>
    <form id="fIns" data-ent="${e.id}">
      <label>Inscrição Estadual<input name="ie" inputmode="numeric" required placeholder="Somente números"></label>
      <label>UF<select name="uf">${optUf()}</select></label>
      <label>Município<input name="mun"></label>
      <label>Descrição<input name="desc" placeholder="Ex.: produtor rural · Capão Alto"></label>
      <p class="err full" hidden></p>
      <button class="btn sm ghost full">Adicionar inscrição</button>
    </form>
    <h3>Contas bancárias</h3>
    <div class="list">${e.contas.map(c=>`<div class="row"><span class="t">${esc(lblConta(c))}</span><span class="a ${c.saldo>=0?'up':'down'}">${brl(c.saldo)}</span><span class="s">Saldo inicial ${brl(c.saldoInicial)} · ${acoes('contas_bancarias', c.id)}</span></div>`).join('') || '<p class="note">Nenhuma conta cadastrada.</p>'}</div>
    <form id="fConta" data-ent="${e.id}">
      <label>Banco<input name="banco" required placeholder="Ex.: Sicredi"></label>
      <label>Apelido<input name="apelido" placeholder="Ex.: conta da safra"></label>
      <label>Agência<input name="ag" inputmode="numeric"></label>
      <label>Conta<input name="cc"></label>
      <label class="full">Saldo hoje (R$)<input name="saldo" type="number" step="0.01" inputmode="decimal" value="0"><small class="note">O saldo da conta no dia em que você começa a usar o app</small></label>
      <button class="btn sm ghost full">Adicionar conta</button>
    </form>
    ${e.padrao?'':usos?`<span class="note">Este ${e.tipo==='PF'?'CPF':'CNPJ'} tem ${plural(usos,'registro','registros')}. Para tirar dos botões, desmarque <b>Ativo</b>.</span>`:`<span class="note">${acoes('entidades_fiscais', e.id)}</span>`}`:''}
  </div>`;
}

export { safras, chipsSafra, optTalhoes, V, modsHtml, fazForm, chipEnt, entPor };
