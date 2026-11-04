import { brl, num, plural, esc, uid, hoje, safraIni, sum } from './util.js';
import { saldoV, recV, abaixoDoRecebido, REG, liqV, arv, talByNome, talById, ramsDe, S, CORES_ENT, catIrDe, usarDados } from './regras.js';
import { exemplo } from './exemplo.js';
import { MODS, NAV_MOD, TELAS_FAZ, vazio, CUR, E, SES, usuario, fazAtual, dadosTela, mod, abrirSessao, fecharSessao, suspender, abrirFazenda, definirFiltro, nomeEnt,
  entPadrao, emitentePadrao, inscricaoPara, contaPara, completarCadastro, salvar, salvarLote, apagar, limparFazenda, agendar, sincronizar, nPendentes, listaErros,
  EX, linhasExemplo, regerarExemplo, prepararExemplo } from './estado.js';
import { ultimoUsuario, apagarCacheDoEmail } from './local.js';
import { track, atividade, tique } from './metricas.js';
import { linha, linhasDoTalhao } from './mapa.js';
import { SUSPENSA, entrar, cadastrar, sessao, trocarSenha, ehAdmin, ieDisponivel } from './nuvem.js';
import { abrirEmissao } from './nfe.js';
import { soDig, mascaraDoc, docValido } from './doc.js';
import { ieValida } from './ie.js';
import { V, chipEnt } from './telas.js';

/* abre uma fazenda na aba Fazendas (floresta, ou produção se a floresta estiver desligada) */
function irFazenda(fid){
  abrirFazenda(fid);
  E.talSel=null; E.ramSel=null; E.apTal=null; E.apSel=null; E.safraSel=CUR; E.editar=null; E.confirmar=null; E.limparPend=null;
  ir(mod('floresta') ? 'floresta' : mod('producao') ? 'producao' : 'fazenda');
}
/* depois de uma sincronização que deu certo: completa o cadastro (CPF padrão, conta) e prepara a conta de exemplo.
   Se o servidor ainda não tem as tabelas novas (migração 0006 não aplicada), não mexe em nada. */
async function sincronizarECompletar(){
  const r = await sincronizar();
  if (r.ok && !r.faltam?.length) { completarCadastro(); prepararExemplo(); }
}
/* depois do login: abre o cache do usuário, mostra o Início e sincroniza */
async function aposLogin(u, modo){
  abrirSessao(u.id, {email:u.email, nome:u.user_metadata?.nome||''});
  track('login', {modo});
  E.atual='inicio'; E.sairPend=false; render(); window.scrollTo(0,0);
  await sincronizarECompletar();
  E.admin = await ehAdmin(); if (E.atual==='conta') render({seguro:true});
}
/* dependências entre funções: Produção precisa de Floresta; NF-e precisa de Vendas */
function syncMods(src){
  const box=src.closest('.mods'); if(!box) return;
  const cb=k=>box.querySelector(`input[value="${k}"]`);
  MODS.filter(m=>m.req).forEach(m=>{
    if (src.value===m.k && src.checked) cb(m.req).checked=true;
    if (src.value===m.req && !src.checked) cb(m.k).checked=false;
  });
  if (E.atual==='conta') {
    track('feature_used', {funcao:src.checked?'funcao_ligada':'funcao_desligada', modulo:src.value});
    const modulos=Object.fromEntries([...box.querySelectorAll('input[name=mod]')].map(c=>[c.value,c.checked]));
    salvar('perfis', {id:usuario().id, modulos});
  }
}
const agoraIso = () => new Date().toISOString();

/* ---------- indicador de sincronização ---------- */
function estadoSync(){
  const n=nPendentes(), e=listaErros().length;
  if (SES.sync==='sessao') return {t:'Entre de novo para enviar', c:'warn', acao:'login'};
  if (SES.sync==='offline' || !navigator.onLine) return {t:n?`Sem conexão · ${n} para enviar`:'Sem conexão', c:'warn'};
  if (SES.sync==='enviando') return {t:'Enviando…', c:''};
  if (e) return {t:`${e} com erro · ver`, c:'down', acao:'erros'};
  if (n) return {t:`${n} para enviar`, c:''};
  return {t:'Tudo salvo', c:'up'};
}
function mostrarSync(){
  const el=document.getElementById('sync'); if(!el) return;
  const s=estadoSync();
  el.textContent=s.t; el.className='sync '+s.c; el.dataset.sync=s.acao||'';
}
E.mostrarSync = mostrarSync;

/* ---------- render e eventos ---------- */
const app = document.getElementById('app');
const hdr=document.getElementById('hdr'), nav=document.getElementById('nav');
/* alguém usando a tela: campo ou botão em foco, ou janela (NF-e) aberta */
const emUso = () => !!document.querySelector('dialog[open]') || (app.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName));
let renderPendente = false, telaMedida = null;
E.render = render;
/* telas que pertencem a cada aba do rodapé */
const ABA = {floresta:'fazendas', producao:'fazendas', perdas:'fazendas', fazenda:'fazendas', cadastros:null, conta:null};
const TELAS_FIN = ['inicio','caixa','vendas','resultado'];
/* {seguro:true}: vindo da sincronização; não redesenha por cima de um formulário sendo preenchido */
function render(op){
  if (op?.seguro && emUso()) { renderPendente=true; return; }
  renderPendente=false;
  const u=usuario();
  if (E.atual==='carregando') { app.innerHTML='<p class="note">Abrindo o caderno…</p>'; hdr.innerHTML='<h1>Caderno da Resina</h1>'; nav.hidden=true; return; }
  if (!u) E.atual='login';
  else if (u.trocarSenha) E.atual='senha';   // senha temporária: nada mais abre antes de trocar
  else if (['senha','login','carregando'].includes(E.atual) || !V[E.atual]) E.atual='inicio';
  /* telas da aba Fazendas precisam de uma fazenda aberta; abas de funções desligadas voltam ao Início */
  if (u && TELAS_FAZ.includes(E.atual) && !fazAtual()) E.atual='fazendas';
  if (u && NAV_MOD[E.atual] && !mod(NAV_MOD[E.atual])) E.atual='inicio';
  if (u && ['floresta','perdas'].includes(E.atual) && !mod('floresta')) E.atual='fazenda';
  if (u && E.atual==='producao' && !mod('producao')) E.atual='fazenda';
  usarDados(dadosTela());
  app.innerHTML = `<div class="view wrap" style="max-width:none">${V[E.atual]()}</div>`;
  hdr.innerHTML = !u ? `<h1>Caderno da Resina</h1><p>Gestão simples para quem vive do pinus</p>`
    : `<div class="hrow"><div><h1>Caderno da Resina</h1><p>${esc(u.nome)}</p>
        <button type="button" id="sync" class="sync"></button></div>
        <div class="hbtn"><button type="button" class="btn sm ghost" data-conta="1" ${E.atual==='conta'||E.atual==='cadastros'?'aria-current="page"':''}>Conta</button></div></div>
        ${TELAS_FIN.includes(E.atual) ? filtros(u) : ''}`;
  nav.hidden = !u || E.atual==='senha';
  const aba = ABA[E.atual]!==undefined ? ABA[E.atual] : E.atual;
  nav.querySelectorAll('button').forEach(b=>{ const v=b.dataset.v;
    b.hidden = v==='fazendas' ? !(mod('floresta')||mod('producao')) : !!NAV_MOD[v] && !mod(NAV_MOD[v]);
    if(v===aba) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  document.getElementById('demo').hidden = !(u && TELAS_FAZ.includes(E.atual) && fazAtual()?.demo);
  if (E.atual==='login' && E.emailPre) { const el=document.getElementById('lEmail'); if (el) el.value=E.emailPre; }
  mostrarSync(); syncAp(); syncVenda();
  /* métrica de tela: uma por troca de tela (ou de aba interna de Financeiro e Floresta) */
  const modo = E.atual==='floresta' ? E.flMode : E.atual==='caixa' ? E.modoCaixa : null, tela = E.atual+(modo?':'+modo:'');
  if (u && tela!==telaMedida) track('page_view', {tela:E.atual, ...(modo?{modo}:{})});
  telaMedida = u ? tela : null;
}
/* filtros do topo nas telas financeiras: CPF/CNPJ (chips com a cor) e fazenda. Ficam guardados por usuário. */
function filtros(u){
  const ents = u.entidades.filter(e=>e.ativo || e.id===u.entidadeSel);
  const chips = ents.length>1 ? `<div class="chips entsel" role="group" aria-label="Mostrar o financeiro de"><button type="button" data-ent="" aria-pressed="${!u.entidadeSel}">Todos</button>${ents.map(e=>`<button type="button" data-ent="${e.id}" aria-pressed="${e.id===u.entidadeSel}">${chipEnt(e)}</button>`).join('')}</div>` : '';
  const faz = u.fazendas.length>1 ? `<label class="fsel">Fazenda<select id="filtroFaz"><option value="">Todas as fazendas e gerais</option>${u.fazendas.map(f=>`<option value="${f.id}" ${f.id===u.fazendaSel?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></label>` : '';
  return chips || faz ? `<div class="filtros">${chips}${faz}</div>` : '';
}
function ir(v){ E.atual=v; E.editar=null; E.confirmar=null; E.sel=null; render(); window.scrollTo(0,0); }
app.addEventListener('focusout',()=>setTimeout(()=>{ if(renderPendente && !emUso()) render(); },0));
nav.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) ir(b.dataset.v); });
hdr.addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.ent!==undefined){ definirFiltro('entidade', b.dataset.ent||null); }
  if(b.dataset.conta){ E.entEdit=null; ir('conta'); }
  if(b.id==='sync'){
    if(b.dataset.sync==='erros'){ ir('conta'); document.getElementById('erros')?.scrollIntoView({block:'start'}); }
    else if(b.dataset.sync==='login'){ E.emailPre=usuario()?.email||''; await fecharSessao(); E.lMode='entrar'; ir('login'); }
    else { track('feature_used', {funcao:'sincronizar_manual'}); sincronizar(); }
  } });
hdr.addEventListener('change',e=>{ if(e.target.id==='filtroFaz') definirFiltro('fazenda', e.target.value||null); });
document.getElementById('limpar').addEventListener('click',()=>{ const f=fazAtual(); if (f?.demo) limparFazenda(f.id); });

/* registros a apagar junto (filhos) quando o produtor exclui algo */
function itensExcluir(tab, id){
  if (tab==='talhoes') return linhasDoTalhao(SES.L, id);
  if (tab==='vendas') return [['vendas',id], ...(S.vendas.find(v=>v.id===id)?.recs||[]).map(r=>['recebimentos',r.id])];
  if (tab==='ramais') { const r=S.talhoes.flatMap(t=>t.ramais).find(x=>x.id===id); return [['ramais',id], ...(r?.hist||[]).map(h=>['contagens',h.id])]; }
  return [[tab,id]];
}

app.addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b) return;
  const d=b.dataset;
  if(d.abrfaz){ irFazenda(d.abrfaz); }
  else if(d.ir){ if(d.ir==='fazendas') E.fazSel=null; ir(d.ir); }
  else if(d.lmode){ E.lMode=d.lmode; E.lAviso=''; E.lErro=''; render(); }
  else if(d.demo){ b.disabled=true; b.textContent='Entrando…';
    try { await aposLogin(await entrar(EX.email, EX.senha), 'exemplo'); }
    catch(err){ b.disabled=false; b.textContent='Entrar como exemplo'; const el=document.getElementById('lErr'); el.textContent=err.message; el.hidden=false; } }
  else if(d.preencher){ document.getElementById('lEmail').value=EX.email; document.getElementById('lSenha').value=EX.senha; document.getElementById('lEmail').focus(); }
  else if(d.sair!==undefined){
    if(d.sair===''){ E.sairPend=false; render(); }
    else if(!d.ok && nPendentes()){ E.sairPend=true; render(); }
    else { track('logout'); await fecharSessao(); E.sairPend=false; E.lMode='entrar'; E.emailPre=''; ir('login'); } }
  else if(d.entedit!==undefined){ E.entEdit=d.entedit||null; E.confirmar=null; render(); document.getElementById('fEnt')?.scrollIntoView({block:'nearest'}); }
  else if(d.limpafaz!==undefined){
    if(d.ok){ E.limparPend=null; limparFazenda(d.limpafaz); }
    else { E.limparPend=d.limpafaz||null; render(); } }
  else if(d.regerar){ const f=usuario().fazendas.find(x=>x.id===d.regerar); if(f){ track('feature_used', {funcao:'regerar_exemplo'}); regerarExemplo(f); } }
  else if(d.safra){ E.safraSel=+d.safra; track('feature_used', {funcao:'safra_trocada'}); render(); }
  else if(d.tal){ E.talSel=d.tal; E.ramSel=null; E.editar=null; E.confirmar=null; render(); }
  else if(d.fl){ E.flMode=d.fl; render(); }
  else if(d.ram!==undefined){ E.ramSel=d.ram||null; E.editar=null; E.confirmar=null; render(); if(E.ramSel) document.getElementById('cardRam')?.scrollIntoView({block:'nearest'}); }
  else if(d.op){ E.opTipo=d.op; E.apSel=null; render(); }
  else if(d.aptal){ E.apTal=d.aptal; E.apSel=null; render(); }
  else if(d.apall){ document.querySelectorAll('#fAp input[name=ram]').forEach(c=>c.checked=d.apall==='1'); syncAp(); }
  else if(d.goap){ E.atual='floresta'; E.flMode='apontar'; E.opTipo=d.goap; E.apSel=null; render(); window.scrollTo(0,0); }
  else if(d.modo){ E.modoCaixa=d.modo; E.editar=null; E.confirmar=null; E.sel=null; render(); }
  else if(d.tipo){ E.tipoLanc=d.tipo; render(); }
  else if(d.sel!==undefined){ E.sel = d.sel ? {tab:d.sel, ids:new Set()} : null; E.editar=null; E.confirmar=null; render(); }
  else if(d.selall){ document.querySelectorAll('input[name=selid]').forEach(c=>c.checked=d.selall==='1'); syncSel(); }
  else if(d.realizar){ const c=S.comp.find(x=>x.id===d.realizar); if(!c) return; track('feature_used', {funcao:'compromisso_pago'});
    /* o pagamento entra com a data de hoje (ou a do vencimento, se já passou), na conta do CPF/CNPJ; a competência é a do compromisso */
    const ent=usuario().entidades.find(x=>x.id===c.entidade);
    salvarLote([['compromissos',{id:c.id, deleted_at:agoraIso()}], ['lancamentos', linha.lancamento({...c, id:uid(), competencia:c.competencia||c.data,
      data: c.data<hoje()? c.data : hoje(), conta:contaPara(ent)?.id||null})]]); }
  else if(d.emitir){ abrirEmissao(d.emitir); }
  else if(d.comnota){ E.aberta=d.comnota; salvar('vendas', {id:d.comnota, com_nota:true}); abrirEmissao(d.comnota); }
  else if(d.excluir!==undefined){
    if(!d.excluir){ E.confirmar=null; render(); }
    else if(!d.ok){ E.confirmar=d.excluir; E.editar=null; render(); }
    else { const [tab,id]=d.excluir.split(':'); E.confirmar=null; if(tab==='ramais') E.ramSel=null; if(tab==='entidades_fiscais') E.entEdit=null; apagar(itensExcluir(tab,id)); } }
  else if(d.editar!==undefined){ E.editar=d.editar||null; E.confirmar=null; render(); }
});
app.addEventListener('toggle',e=>{ const d=e.target; if(!d.matches?.('details.venda')) return;
  if(d.open) E.aberta=d.dataset.venda; else if(E.aberta===d.dataset.venda) E.aberta=null; }, true);
app.addEventListener('change',e=>{
  const t=e.target, f=t.form;
  if(t.id==='ideal'){ const v=+t.value; if(v>=7&&v<=30 && E.fazSel){ track('feature_used', {funcao:'intervalo_alterado'}); salvar('fazendas', {id:E.fazSel, intervalo_ideal:v}); } }
  if(t.name==='ram') syncAp();
  if(t.name==='mod') syncMods(t);
  if(t.name==='selid') syncSel();
  /* trocou o CPF/CNPJ: a conta e a inscrição acompanham */
  if(t.name==='ent' && f) sugerirConta(f);
  if((t.name==='ent' || t.name==='faz') && f?.id==='fVenda') sugerirIe(f);
  if(f?.id==='fVenda') syncVenda();
});
function syncSel(){
  if(!E.sel) return;
  E.sel.ids=new Set([...document.querySelectorAll('input[name=selid]:checked')].map(c=>c.value));
  const el=document.getElementById('selN'); if(el) el.textContent=plural(E.sel.ids.size,'selecionado','selecionados');
}
const entDoForm = f => usuario().entidades.find(x=>x.id===f.elements.namedItem('ent')?.value) || null;
function sugerirConta(f){
  const sel=f.elements.namedItem('conta'), ent=entDoForm(f); if(!sel || !ent) return;
  const atual=sel.selectedOptions[0];
  if(!atual?.value || atual.dataset.ent!==ent.id) sel.value = contaPara(ent)?.id || '';
}
function sugerirIe(f){
  const sel=f.elements.namedItem('ie'), ent=entDoForm(f); if(!sel || !ent) return;
  const faz=usuario().fazendas.find(x=>x.id===f.elements.namedItem('faz')?.value);
  sel.value = inscricaoPara(ent, faz)?.id || '';
}
/* IE nova ou alterada: formato, dígito verificador e se já existe (nesta conta ou em outra) */
async function erroIe(ie, uf, id){
  if(ie.length<8 || ie.length>14) return 'A Inscrição Estadual deve ter de 8 a 14 dígitos.';
  if(!ieValida(ie, uf)) return `Inscrição Estadual inválida para ${uf}.`;
  if(usuario().entidades.some(e=>e.inscricoes.some(i=>i.ie===ie && i.id!==id))) return 'Esta inscrição já está cadastrada num dos seus CPFs/CNPJs.';
  if(await ieDisponivel(ie, id||null)===false) return 'Esta Inscrição Estadual já está cadastrada em outra conta.';
  return null;
}
/* campos de "Documento, contraparte e IR" (lançamentos e compromissos) */
function lerDoc(el){
  const cdoc=soDig(el('cdoc')?.value);
  if(cdoc && !docValido(cdoc)) return {erro:'CPF/CNPJ da contraparte inválido: confira os números.'};
  return {competencia:el('comp')?.value||null, catIr:el('catir')?.value||null, tipoDoc:el('tdoc')?.value||null, numDoc:el('ndoc')?.value.trim()||'',
    contraparteNome:el('cnome')?.value.trim()||'', contraparteDoc:cdoc, conta:el('conta')?.value||null};
}
app.addEventListener('submit',async e=>{
  e.preventDefault(); const $=id=>document.getElementById(id); const f=e.target.id, fm=e.target, el=n=>fm.elements.namedItem(n);
  const erro=(id,m)=>{ const x=id?$(id):fm.querySelector('.err'); x.textContent=m; x.hidden=false; };
  if(f==='fLogin'){ E.lAviso=''; E.lErro=''; const email=$('lEmail').value.trim().toLowerCase(), senha=$('lSenha').value, btn=e.target.querySelector('.btn');
    btn.disabled=true;
    try {
      if(E.lMode==='entrar') return await aposLogin(await entrar(email, senha), 'senha');
      const modulos=Object.fromEntries(MODS.map(m=>[m.k, !!e.target.querySelector(`input[name=mod][value="${m.k}"]`)?.checked]));
      const u=await cadastrar($('lNome').value.trim(), email, senha, modulos);
      if(u) return await aposLogin(u, 'cadastro');
      /* confirmação de e-mail ligada no Supabase: a conta só entra depois do link */
      E.lMode='entrar'; E.emailPre=email; E.lAviso=`Enviamos um link para ${email}. Confirme e depois entre.`; return render();
    } catch(err){ btn.disabled=false; if(err.suspensa) apagarCacheDoEmail(email); return erro('lErr', err.message); } }
  if(f==='fSenha'){ const nova=$('sNova').value, btn=e.target.querySelector('.btn');
    if(nova!==$('sRep').value) return erro('sErr','As duas senhas não são iguais.');
    btn.disabled=true;
    try { await trocarSenha(nova); E.senhaTrocada=SES.L?.userId; render(); sincronizar(); }
    catch(err){ btn.disabled=false; erro('sErr', err.message); }
    return; }
  if(f==='fUser'){ salvar('perfis', {id:usuario().id, nome:$('uNome').value.trim()}); return; }
  /* fazenda = o imóvel (sem inscrição estadual) */
  if(f==='fFaz'){ const id=fm.dataset.id, area=$('zArea').value;
    const campos={nome:$('zNome').value.trim(), municipio:$('zMun').value.trim(), uf:$('zUf').value, area_ha:area===''?null:+area, nirf_cib:$('zNirf').value.trim(), car:$('zCar').value.trim()};
    if(usuario().fazendas.some(z=>z.nome.toLowerCase()===campos.nome.toLowerCase() && z.id!==id)) return erro('zErr','Você já tem uma fazenda com esse nome.');
    if(id) return salvar('fazendas', {id, ...campos});
    const nova={id:uid(), doc:'', ...campos};
    if($('zEx').checked){ track('record_created', {tabela:'fazendas'}); track('feature_used', {funcao:'dados_exemplo'});
      const ent=entPadrao();
      salvarLote(linhasExemplo(nova, exemplo(2+Math.floor(Math.random()*997)), {padrao: ent ? {ent:ent.id, ie:inscricaoPara(ent, nova)?.id||null, conta:contaPara(ent)?.id||null} : null}), {metrica:false}); }
    else salvar('fazendas', linha.fazenda(nova, vazio()));
    return irFazenda(nova.id); }
  if(f==='fEnt'){ const u=usuario(), id=fm.dataset.id, antes=u.entidades.find(x=>x.id===id), tipo=el('tipo').value, doc=soDig(el('doc').value);
    if(doc && !docValido(doc, tipo)) return erro(null, tipo==='PF'?'CPF inválido: confira os números (11 dígitos).':'CNPJ inválido: confira os números (14 dígitos).');
    if(doc && u.entidades.some(x=>x.documento===doc && x.id!==id)) return erro(null, 'Este CPF/CNPJ já está cadastrado.');
    const padrao=antes?.padrao || el('padrao').checked || !u.entidades.length;
    const ent={id:id||uid(), tipo, nome:el('nome').value.trim(), apelido:el('apelido').value.trim(), documento:doc, cor:el('cor')?.value||CORES_ENT[0],
      regime:el('regime').value, previdencia:el('prev').value, padrao, ativo:padrao || el('ativo').checked};
    E.entEdit = id ? null : ent.id;   // CPF/CNPJ novo continua aberto, para cadastrar inscrições e contas
    /* marcar como padrão desmarca o anterior (o banco faz o mesmo; aqui é para a tela já mostrar certo) */
    const antigo=padrao && !antes?.padrao ? u.entidades.filter(x=>x.padrao && x.id!==ent.id).map(x=>['entidades_fiscais', {id:x.id, padrao:false}]) : [];
    return salvarLote([...antigo, ['entidades_fiscais', linha.entidade(ent)]]); }
  if(f==='fIns'){ const ie=soDig(el('ie').value), uf=el('uf').value;
    const m=await erroIe(ie, uf, null); if(m) return erro(null, m);
    return salvar('inscricoes_estaduais', linha.inscricao({id:uid(), entidade:fm.dataset.ent, ie, uf, municipio:el('mun').value.trim(), descricao:el('desc').value.trim()})); }
  if(f==='fConta'){ return salvar('contas_bancarias', linha.conta({id:uid(), entidade:fm.dataset.ent, banco:el('banco').value.trim(), apelido:el('apelido').value.trim(),
    agencia:el('ag').value.trim(), conta:el('cc').value.trim(), saldoInicial:+el('saldo').value||0})); }
  if(f==='fCaixa'){ const dc=lerDoc(el); if(dc.erro) return erro(null, dc.erro);
    const it={id:uid(), data:el('data').value, tipo:E.tipoLanc, cat:el('cat').value, desc:el('desc').value.trim(), valor:+el('valor').value,
      entidade:el('ent')?.value||entPadrao()?.id||null, fazenda:el('faz').value||null, ...dc};
    return salvar(E.modoCaixa==='real'?'lancamentos':'compromissos', linha.lancamento(it)); }
  if(f==='fMover'){ const tab=fm.dataset.tab, ids=[...(E.sel?.ids||[])], ent=el('ent').value, faz=el('faz').value;
    if(!ids.length) return erro(null, 'Marque ao menos um registro.');
    if(!ent && !faz) return erro(null, 'Escolha o CPF/CNPJ ou a fazenda de destino.');
    const muda={...(ent?{entidade_id:ent}:{}), ...(faz?{fazenda_id:faz==='-'?null:faz}:{})};
    /* venda que muda de CPF/CNPJ troca também a inscrição de quem emite (a do novo, na UF da fazenda) */
    const e2=usuario().entidades.find(x=>x.id===ent);
    const itens=ids.map(id=>{ if(tab!=='vendas' || !e2) return [tab, {id, ...muda}];
      const v=S.vendas.find(x=>x.id===id), fz=usuario().fazendas.find(x=>x.id===(faz||v?.fazenda));
      return [tab, {id, ...muda, inscricao_id:inscricaoPara(e2, fz)?.id||null}]; });
    track('feature_used', {funcao:'mover_lote', tabela:tab, qtd:ids.length});
    E.sel=null;
    return salvarLote(itens, {metrica:false}); }
  if(f==='fPerda'){ return salvar('perdas', linha.perda({id:uid(), data:el('data').value, kg:+el('kg').value, motivo:el('motivo').value, talhao:el('tal').value||null,
    obs:el('obs').value.trim()}, E.fazSel)); }
  if(f==='fAp'){ const t=talById(E.apTal), ids=[...E.apSel];
    if(!ids.length){ $('apSum').innerHTML='<span class="down">Marque ao menos um ramal.</span>'; return; }
    E.apSel=null;
    if(E.opTipo==='estria') return salvar('estrias', linha.estria({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,qtd:sum(ramsDe(t,ids),arv),dias:+$('aDias').value,resineiro:$('aRes').value.trim()}, t.fazenda));
    return salvar('coletas', linha.coleta({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,kg:+$('aKg').value}, t.fazenda)); }
  if(f==='fTal'){ const nome=$('tNome').value.trim();
    if(talByNome(nome)) return erro('tErr','Já existe um talhão com esse nome.');
    const t={id:uid(),nome}; E.talSel=t.id; return salvar('talhoes', linha.talhao(t, E.fazSel)); }
  if(f==='fRam'){ const t=talById(E.talSel), cod=$('rCod').value.trim();
    if(t.ramais.some(r=>r.cod===cod)) return erro('rErr','Já existe um ramal com esse código neste talhão.');
    const r={id:uid(),cod}, h={id:uid(),data:hoje(),arv:+$('rArv').value,motivo:'Contagem inicial'};
    return salvarLote([['ramais', linha.ramal(r, t.id)], ['contagens', linha.contagem(h, r.id)]]); }
  if(f==='fCont'){ if(!E.ramSel) return;
    return salvar('contagens', linha.contagem({id:uid(),data:$('kData').value,arv:+$('kArv').value,motivo:$('kMot').value}, E.ramSel)); }
  if(f==='fEdTal'){ const id=e.target.dataset.id, nome=$('etNome').value.trim();
    if(S.talhoes.some(t=>t.nome===nome && t.id!==id)) return erro('etErr','Já existe um talhão com esse nome.');
    E.editar=null; return salvar('talhoes', {id, nome}); }
  if(f==='fEdRam'){ const id=e.target.dataset.id, cod=$('erCod').value.trim(), t=talById(E.talSel);
    if(t?.ramais.some(r=>r.cod===cod && r.id!==id)) return erro('erErr','Já existe um ramal com esse código neste talhão.');
    E.editar=null; return salvar('ramais', {id, cod}); }
  /* venda: sai de uma fazenda e é emitida por um CPF/CNPJ (uma das inscrições dele); o desconto é o do regime dele */
  if(f==='fVenda'){ const ent=entDoForm(fm) || entPadrao(), nota=mod('nfe')&&$('vNota')?.value==='1';
    const v={id:uid(),data:$('vData').value,comprador:$('vComp').value.trim(),kg:+$('vKg').value,preco:+$('vPreco').value,fator:(REG[ent?.previdencia]||REG.funrural).f,
      comNota:nota,nf:null,recs:[],venc:$('vVenc').value||hoje(), fazenda:el('faz').value, entidade:ent?.id||null, inscricao:el('ie')?.value||null, tipoDoc:nota?'NF':null};
    const itens=[['vendas', linha.venda(v)]];
    if($('vRec').value==='1') itens.push(['recebimentos', linha.recebimento({id:uid(),data:v.data,valor:liqV(v),forma:'Dinheiro',conta:contaPara(ent)?.id||null}, v.id)]);
    E.aberta=v.id; E.safraSel=safraIni(v.data);
    salvarLote(itens);
    if(v.comNota) abrirEmissao(v.id);
    return;
  }
  if(fm.classList.contains('fRec')){
    const v=S.vendas.find(x=>x.id===fm.dataset.id), val=Math.min(+el('val').value, saldoV(v));
    if(val>0){ E.aberta=v.id; salvar('recebimentos', linha.recebimento({id:uid(),data:el('d').value,valor:val,forma:el('f').value,conta:el('conta')?.value||null}, v.id)); }
    return;
  }
  if(fm.classList.contains('fEdLanc')){ const dc=lerDoc(el); if(dc.erro) return erro(null, dc.erro);
    const tipo=fm.dataset.tipo, cat=el('cat').value;
    E.editar=null;
    return salvar(fm.dataset.tab, {id:fm.dataset.id, data:el('data').value, valor:+el('valor').value, cat, descr:el('desc').value.trim(),
      ...(el('ent')?{entidade_id:el('ent').value}:{}), fazenda_id:el('faz').value||null,
      data_competencia:dc.competencia||el('data').value, categoria_irpf:dc.catIr||catIrDe({tipo, cat}), tipo_documento:dc.tipoDoc, numero_documento:dc.numDoc,
      contraparte_nome:dc.contraparteNome, contraparte_documento:dc.contraparteDoc, ...(el('conta')?{conta_bancaria_id:dc.conta}:{})}); }
  if(fm.classList.contains('fEdVenda')){ const v=S.vendas.find(x=>x.id===fm.dataset.id);
    if(v && abaixoDoRecebido(v, +el('kg').value, +el('preco').value)){ const p=fm.querySelector('.err');
      p.textContent=`Já foram recebidos ${brl(recV(v))} nesta venda. O valor não pode ficar abaixo disso.`; p.hidden=false; return; }
    E.editar=null;
    return salvar('vendas', {id:fm.dataset.id, comprador:el('comprador').value.trim(), kg:+el('kg').value, preco:+el('preco').value, data:el('data').value, venc:el('venc').value||null,
      fazenda_id:el('faz').value, ...(el('ent')?{entidade_id:el('ent').value, inscricao_id:el('ie')?.value||null}:{})}); }
});
function syncAp(){
  const t=talById(E.apTal), box=document.getElementById('apSum'); if(!t||!box) return;
  E.apSel=new Set([...document.querySelectorAll('#fAp input[name=ram]:checked')].map(c=>c.value));
  const rr=ramsDe(t,[...E.apSel]), a=sum(rr,arv);
  box.innerHTML = rr.length ? `<div class="rec"><span>${rr.length} de ${plural(t.ramais.length,'ramal','ramais')}</span><b>${plural(a,'árvore','árvores')}${E.opTipo==='estria'?' = '+plural(a,'estria','estrias'):''}</b></div>` : '<span class="note">Nenhum ramal marcado.</span>';
}
/* prévia da venda com o regime (Funrural ou folha) de quem emite a nota */
function syncVenda(){
  const box=document.getElementById('vPrev'), f=document.getElementById('fVenda'); if(!box||!f) return;
  const kg=+document.getElementById('vKg').value||0, p=+document.getElementById('vPreco').value||0;
  const r=REG[(entDoForm(f)||entPadrao())?.previdencia]||REG.funrural;
  box.innerHTML=`<div class="rec"><span>Preço livre (${r.nome})</span><b class="liv">${brl(p*r.f)}/kg</b></div><div class="rec"><span>Você recebe</span><b>${brl(kg*p*r.f)}</b></div>`;
}
app.addEventListener('input',e=>{
  if(e.target.id==='vKg'||e.target.id==='vPreco') syncVenda();
  if(e.target.dataset.mask==='doc'){ e.target.value=mascaraDoc(e.target.value); }
});

/* sincroniza ao voltar a conexão, ao voltar para a aba e a cada minuto com a aba visível */
/* a rede pode demorar uns segundos para funcionar depois do aviso de conexão: tenta mais uma vez */
window.addEventListener('online',async()=>{ if((await sincronizar()).offline) agendar(5000); });
window.addEventListener('offline',()=>{ if(SES.L){ SES.sync='offline'; mostrarSync(); } });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && SES.L) sincronizar(); });
setInterval(()=>{ if(document.visibilityState==='visible' && SES.L) sincronizar(); }, 60000);
/* tempo de uso: conta só com a aba visível e toque, tecla ou rolagem nos últimos 2 min */
for (const ev of ['pointerdown','keydown','scroll']) window.addEventListener(ev, ()=>atividade(), {passive:true, capture:true});
document.addEventListener('visibilitychange', ()=>tique(document.visibilityState==='hidden'));   // ao esconder, fecha o trecho em que estava visível
setInterval(()=>tique(document.visibilityState==='visible'), 15000);

/* abertura: sessão salva neste aparelho; sem rede, abre o cache do último usuário */
async function iniciar(){
  E.atual='carregando'; render();
  const s=await sessao(), ult=ultimoUsuario();
  if (s.estado==='bloqueado') return ult ? suspender(ult) : (E.lErro=SUSPENSA, E.atual='login', render());
  if (s.estado==='ok') abrirSessao(s.session.user.id, {email:s.session.user.email, nome:s.session.user.user_metadata?.nome||''});
  else if (ult && (s.estado==='offline' || !navigator.onLine)) abrirSessao(ult);   // sem rede (ou rede ruim): abre o cache
  if (SES.L) track('app_open', {online:navigator.onLine});
  E.atual = SES.L ? 'fazendas' : 'login';
  render();
  if (SES.L) await sincronizarECompletar();
  if (SES.L) { E.admin = await ehAdmin(); if (E.atual==='conta') render({seguro:true}); }
}
iniciar();
/* guarda o app no aparelho para abrir sem internet */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
