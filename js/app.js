import { brl, num, plural, esc, uid, hoje, safraIni, sum } from './util.js';
import { saldoV, recV, abaixoDoRecebido, REG, liqV, arv, talByNome, talById, ramsDe, S, CORES_ENT, catIrDe } from './regras.js';
import { exemplo } from './exemplo.js';
import { MODS, NAV_MOD, vazio, CUR, E, SES, usuario, propAtual, mod, abrirSessao, fecharSessao, suspender, usarPropriedadeId, definirEntidade, nomeEnt, lerFat,
  completarCadastro, salvar, salvarLote, apagar, limparFazenda, agendar, sincronizar, nPendentes, listaErros, EX, linhasExemplo, regerarExemplo, prepararExemplo } from './estado.js';
import { ultimoUsuario, apagarCacheDoEmail } from './local.js';
import { track, atividade, tique } from './metricas.js';
import { linha, linhasDoTalhao } from './mapa.js';
import { SUSPENSA, entrar, cadastrar, sessao, trocarSenha, ehAdmin, ieDisponivel } from './nuvem.js';
import { abrirEmissao } from './nfe.js';
import { soDig, mascaraDoc, docValido } from './doc.js';
import { ieValida } from './ie.js';
import { V, chipEnt } from './telas.js';

function usarPropriedade(pid){
  usarPropriedadeId(pid);
  E.talSel=null; E.ramSel=null; E.apTal=null; E.apSel=null; E.aberta=null; E.safraSel=CUR; E.fazEdit=null; E.editar=null; E.confirmar=null;
  E.atual = pid==='todas' ? 'geral' : 'inicio';
  render(); window.scrollTo(0,0);
}
/* depois de uma sincronização que deu certo: completa o cadastro (CPF padrão, vínculos) e prepara a conta de exemplo.
   Se o servidor ainda não tem as tabelas novas (migração 0006 não aplicada), não mexe em nada. */
async function sincronizarECompletar(){
  const r = await sincronizar();
  if (r.ok && !r.faltam?.length) { completarCadastro(); prepararExemplo(); }
}
/* depois do login: abre o cache do usuário, mostra as fazendas e sincroniza */
async function aposLogin(u, modo){
  abrirSessao(u.id, {email:u.email, nome:u.user_metadata?.nome||''});
  track('login', {modo});
  E.atual='fazendas'; E.sairPend=false; render(); window.scrollTo(0,0);
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
/* {seguro:true}: vindo da sincronização; não redesenha por cima de um formulário sendo preenchido */
function render(op){
  if (op?.seguro && emUso()) { renderPendente=true; return; }
  renderPendente=false;
  const u=usuario(), fid=SES.pid;
  if (E.atual==='carregando') { app.innerHTML='<p class="note">Abrindo o caderno…</p>'; hdr.innerHTML='<h1>Caderno da Resina</h1>'; nav.hidden=true; return; }
  if (!u) E.atual='login';
  else if (u.trocarSenha) E.atual='senha';   // senha temporária: nada mais abre antes de trocar
  else if (E.atual==='senha') E.atual='fazendas';
  else if (!fid && !['conta','cadastros'].includes(E.atual)) E.atual='fazendas';
  else if (fid==='todas' && !['geral','conta','fazendas','cadastros'].includes(E.atual)) E.atual='geral';
  if (propAtual() && NAV_MOD[E.atual] && !mod(NAV_MOD[E.atual])) E.atual='inicio';
  if (E.atual==='inicio' && !propAtual()) E.atual = u? (fid==='todas'?'geral':'fazendas') : 'login';
  app.innerHTML = `<div class="view wrap" style="max-width:none">${V[E.atual]()}</div>`;
  const f=propAtual(), g=fid==='todas';
  const ies = f ? (f.fazendas.length===1 ? 'IE '+esc(f.fazendas[0].ie) : f.fazendas.length+' inscrições') : '';
  hdr.innerHTML = !u ? `<h1>Caderno da Resina</h1><p>Gestão simples para quem vive do pinus</p>`
    : `<div class="hrow"><div><h1>${g?'Visão geral':f?esc(f.nome):'Caderno da Resina'}</h1>
        <p>${g? u.propriedades.filter(p=>p.fazendas.length).length+' propriedades · '+esc(u.nome) : f? ies+' · '+esc(f.municipio)+'/'+esc(f.uf) : esc(u.nome)}</p>
        <button type="button" id="sync" class="sync"></button></div>
        <div class="hbtn">${(f||g)?'<button type="button" class="btn sm ghost" data-trocar="1">Trocar propriedade</button>':''}<button type="button" class="btn sm ghost" data-conta="1" ${E.atual==='conta'?'aria-current="page"':''}>Conta</button></div></div>
        ${seletorEntidade(u, f, g)}`;
  nav.hidden = !f || E.atual==='senha';
  nav.querySelectorAll('button').forEach(b=>{ b.hidden = !!NAV_MOD[b.dataset.v] && !mod(NAV_MOD[b.dataset.v]);
    if(b.dataset.v===E.atual) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  document.getElementById('demo').hidden = !(f && S.demo);
  if (E.atual==='login' && E.emailPre) { const el=document.getElementById('lEmail'); if (el) el.value=E.emailPre; }
  mostrarSync(); syncAp(); syncVenda();
  /* métrica de tela: uma por troca de tela (ou de aba interna de Caixa e Floresta) */
  const modo = E.atual==='floresta' ? E.flMode : E.atual==='caixa' ? E.modoCaixa : null, tela = E.atual+(modo?':'+modo:'');
  if (u && tela!==telaMedida) track('page_view', {tela:E.atual, ...(modo?{modo}:{})});
  telaMedida = u ? tela : null;
}
/* seletor no topo: "Todos" ou um CPF/CNPJ. Filtra o financeiro (Início, Caixa, Vendas, Resultado e Visão geral) */
function seletorEntidade(u, f, g){
  if ((!f && !g) || u.entidades.length<2 || ['conta','cadastros','fazendas','senha'].includes(E.atual)) return '';
  const ligados = g ? null : new Set(f.fazendas.flatMap(z=>z.vinculos.map(v=>v.entidade)));
  const ents = u.entidades.filter(e=>(e.ativo && (!ligados || ligados.has(e.id))) || e.id===u.entidadeSel);
  if (ents.length<2 && !u.entidadeSel) return '';
  return `<div class="chips entsel" role="group" aria-label="Mostrar o financeiro de"><button type="button" data-ent="" aria-pressed="${!u.entidadeSel}">Todos</button>${ents.map(e=>`<button type="button" data-ent="${e.id}" aria-pressed="${e.id===u.entidadeSel}">${chipEnt(e)}</button>`).join('')}</div>`;
}
function ir(v){ E.atual=v; E.editar=null; E.confirmar=null; E.sel=null; render(); window.scrollTo(0,0); }
app.addEventListener('focusout',()=>setTimeout(()=>{ if(renderPendente && !emUso()) render(); },0));
nav.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) ir(b.dataset.v); });
hdr.addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.trocar){ usarPropriedadeId(null); ir('fazendas'); }
  if(b.dataset.ent!==undefined){ definirEntidade(b.dataset.ent||null); }
  if(b.dataset.conta){ E.fazEdit=null; ir('conta'); }
  if(b.id==='sync'){
    if(b.dataset.sync==='erros'){ ir('conta'); document.getElementById('erros')?.scrollIntoView({block:'start'}); }
    else if(b.dataset.sync==='login'){ E.emailPre=usuario()?.email||''; await fecharSessao(); E.lMode='entrar'; ir('login'); }
    else { track('feature_used', {funcao:'sincronizar_manual'}); sincronizar(); }
  } });
document.getElementById('limpar').addEventListener('click',()=>{ for (const f of propAtual()?.fazendas||[]) if (f.demo) limparFazenda(f.id); });

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
  if(d.faz){ usarPropriedade(d.faz); }
  else if(d.ir){ ir(d.ir); }
  else if(d.lmode){ E.lMode=d.lmode; E.lAviso=''; E.lErro=''; render(); }
  else if(d.demo){ b.disabled=true; b.textContent='Entrando…';
    try { await aposLogin(await entrar(EX.email, EX.senha), 'exemplo'); }
    catch(err){ b.disabled=false; b.textContent='Entrar como exemplo'; const el=document.getElementById('lErr'); el.textContent=err.message; el.hidden=false; } }
  else if(d.preencher){ document.getElementById('lEmail').value=EX.email; document.getElementById('lSenha').value=EX.senha; document.getElementById('lEmail').focus(); }
  else if(d.sair!==undefined){
    if(d.sair===''){ E.sairPend=false; render(); }
    else if(!d.ok && nPendentes()){ E.sairPend=true; render(); }
    else { track('logout'); await fecharSessao(); E.sairPend=false; E.lMode='entrar'; E.emailPre=''; ir('login'); } }
  else if(d.editfaz!==undefined){ E.fazEdit=d.editfaz||null; E.limparPend=null; E.vincEdit=null; render(); document.getElementById('fFaz')?.scrollIntoView({block:'nearest'}); }
  else if(d.propedit!==undefined){ E.propEdit=d.propedit||null; render(); }
  else if(d.entedit!==undefined){ E.entEdit=d.entedit||null; E.confirmar=null; render(); document.getElementById('fEnt')?.scrollIntoView({block:'nearest'}); }
  else if(d.vincedit!==undefined){ E.vincEdit=d.vincedit||null; E.fazEdit=null; render(); document.getElementById('fVinc')?.scrollIntoView({block:'nearest'}); }
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
  else if(d.reg){ track('feature_used', {funcao:'regime_alterado'}); salvar('fazendas', {id:d.regfaz, regime:d.reg}); }
  else if(d.modo){ E.modoCaixa=d.modo; E.editar=null; E.confirmar=null; E.sel=null; render(); }
  else if(d.tipo){ E.tipoLanc=d.tipo; render(); }
  else if(d.sel!==undefined){ E.sel = d.sel ? {tab:d.sel, ids:new Set()} : null; E.editar=null; E.confirmar=null; render(); }
  else if(d.selall){ document.querySelectorAll('input[name=selid]').forEach(c=>c.checked=d.selall==='1'); syncSel(); }
  else if(d.realizar){ const c=S.comp.find(x=>x.id===d.realizar); if(!c) return; track('feature_used', {funcao:'compromisso_pago'});
    /* o pagamento entra no caixa com a data de hoje (ou a do vencimento, se já passou); a competência é a do compromisso */
    salvarLote([['compromissos',{id:c.id, deleted_at:agoraIso()}], ['lancamentos', linha.lancamento({...c, id:uid(), competencia:c.competencia||c.data, data: c.data<hoje()? c.data : hoje()}, c.fazenda)]]); }
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
  if(e.target.id==='ideal'){ const v=+e.target.value; if(v>=7&&v<=30){ track('feature_used', {funcao:'intervalo_alterado'});
    /* o intervalo vale para a propriedade toda: grava em todas as inscrições dela */
    salvarLote((propAtual()?.fazendas||[]).map(f=>['fazendas', {id:f.id, intervalo_ideal:v}])); } }
  if(e.target.name==='ram') syncAp();
  if(e.target.name==='mod') syncMods(e.target);
  if(e.target.name==='selid') syncSel();
  if(e.target.name==='fat' && e.target.form?.id==='fVenda') syncVenda();
});
function syncSel(){
  if(!E.sel) return;
  E.sel.ids=new Set([...document.querySelectorAll('input[name=selid]:checked')].map(c=>c.value));
  const el=document.getElementById('selN'); if(el) el.textContent=plural(E.sel.ids.size,'selecionado','selecionados');
}
/* IE nova ou alterada: formato, dígito verificador e se já existe (nesta conta ou em outra) */
async function erroIe(ie, uf, id, antes){
  if(ie.length<8 || ie.length>14) return 'A Inscrição Estadual deve ter de 8 a 14 dígitos.';
  /* só confere o dígito de IE nova ou alterada: a conta de exemplo usa IEs fictícias */
  if((!antes || antes.ie!==ie || antes.uf!==uf) && !ieValida(ie, uf)) return `Inscrição Estadual inválida para ${uf}.`;
  if(usuario().fazendas.some(z=>z.ie===ie && z.id!==id)) return 'Você já tem uma inscrição com este número.';
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
  const p=propAtual(), principal=p?.fazendas[0]?.id;
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
  /* propriedade nova, já com a primeira inscrição e o vínculo com o CPF/CNPJ que fatura por ela */
  if(f==='fProp'){ const u=usuario(), ie=soDig($('pIe').value), uf=$('pUf').value;
    const m=await erroIe(ie, uf, null, null); if(m) return erro('pErr', m);
    const prop={id:uid(), nome:$('pNome').value.trim(), municipio:$('pMun').value.trim(), uf}, regime=$('pReg').value;
    const ent=$('pEnt')?.value || (u.entidades.find(x=>x.padrao)||u.entidades[0])?.id || null;
    const faz={id:uid(), propriedade_id:prop.id, nome:prop.nome, ie, doc:'', municipio:prop.municipio, uf};
    const itens=[['propriedades', linha.propriedade(prop)]];
    if($('pEx').checked){ track('record_created', {tabela:'fazendas'}); track('feature_used', {funcao:'dados_exemplo'});
      itens.push(...linhasExemplo(faz, exemplo(2+Math.floor(Math.random()*997), null, regime), {padrao:ent})); }
    else itens.push(['fazendas', linha.fazenda(faz, {...vazio(), regime})]);
    if(ent) itens.push(['vinculos', linha.vinculo({id:uid(), fazenda:faz.id, entidade:ent, percentual:100, condicao:'PROPRIETARIO', padrao:true})]);
    salvarLote(itens, {metrica:!$('pEx').checked});
    if(E.atual==='fazendas') usarPropriedade(prop.id);
    return; }
  if(f==='fPropEd'){ const u=usuario(), pr=u.propriedades.find(x=>x.id===fm.dataset.id); if(!pr) return;
    const area=el('area').value, campos={nome:el('nome').value.trim(), municipio:el('mun').value.trim(), uf:el('uf').value, area_ha:area===''?null:+area, nirf_cib:el('nirf').value.trim(), car:el('car').value.trim()};
    E.propEdit=null;
    /* propriedade virtual (fazenda antiga sem propriedade): vira uma propriedade de verdade */
    if(pr.virtual){ const id=uid(); if(SES.pid===pr.id) SES.pid=id;
      return salvarLote([['propriedades', linha.propriedade({id, ...campos})], ...pr.fazendas.map(z=>['fazendas', {id:z.id, propriedade_id:id}])]); }
    return salvar('propriedades', {id:pr.id, ...campos}); }
  if(f==='fFaz'){ const u=usuario(), id=fm.dataset.id, ie=soDig($('zIe').value), uf=$('zUf').value, antes=u.fazendas.find(z=>z.id===id);
    const m=await erroIe(ie, uf, id, antes); if(m) return erro('zErr', m);
    const campos={nome:$('zNome').value.trim(), ie, municipio:$('zMun').value.trim(), uf, regime:$('zReg').value};
    const pr=u.propriedades.find(x=>x.id===fm.dataset.prop), destino=$('zProp')?.value;
    E.fazEdit=null;
    if(id) return salvar('fazendas', {id, ...campos, ...(destino && destino!==pr?.id ? {propriedade_id:destino} : {})});
    /* inscrição nova: na propriedade (se virtual, a propriedade é criada junto) e vinculada ao CPF/CNPJ padrão */
    const itens=[], ent=(u.entidades.find(x=>x.padrao)||u.entidades[0])?.id;
    let pid=pr.id;
    if(pr.virtual){ pid=uid(); itens.push(['propriedades', linha.propriedade({...pr, id:pid})], ...pr.fazendas.map(z=>['fazendas', {id:z.id, propriedade_id:pid}])); }
    const nova={id:uid(), propriedade_id:pid, doc:'', ...campos};
    itens.push(['fazendas', linha.fazenda(nova, {...vazio(), regime:campos.regime})]);
    if(ent) itens.push(['vinculos', linha.vinculo({id:uid(), fazenda:nova.id, entidade:ent, percentual:100, condicao:'PROPRIETARIO', padrao:true})]);
    return salvarLote(itens); }
  if(f==='fEnt'){ const u=usuario(), id=fm.dataset.id, antes=u.entidades.find(x=>x.id===id), tipo=el('tipo').value, doc=soDig(el('doc').value);
    if(doc && !docValido(doc, tipo)) return erro(null, tipo==='PF'?'CPF inválido: confira os números (11 dígitos).':'CNPJ inválido: confira os números (14 dígitos).');
    if(doc && u.entidades.some(x=>x.documento===doc && x.id!==id)) return erro(null, 'Este CPF/CNPJ já está cadastrado.');
    const padrao=antes?.padrao || el('padrao').checked || !u.entidades.length;
    const ent={id:id||uid(), tipo, nome:el('nome').value.trim(), apelido:el('apelido').value.trim(), documento:doc, cor:el('cor')?.value||CORES_ENT[0],
      regime:el('regime').value, padrao, ativo:padrao || el('ativo').checked};
    E.entEdit=null;
    /* marcar como padrão desmarca o anterior (o banco faz o mesmo; aqui é para a tela já mostrar certo) */
    const antigo=padrao && !antes?.padrao ? u.entidades.filter(x=>x.padrao && x.id!==ent.id).map(x=>['entidades_fiscais', {id:x.id, padrao:false}]) : [];
    return salvarLote([...antigo, ['entidades_fiscais', linha.entidade(ent)]]); }
  if(f==='fConta'){ salvar('contas_bancarias', linha.conta({id:uid(), entidade:fm.dataset.ent, banco:el('banco').value.trim(), apelido:el('apelido').value.trim(),
    agencia:el('ag').value.trim(), conta:el('cc').value.trim()})); return; }
  if(f==='fVinc'){ const u=usuario(), fz=u.fazendas.find(x=>x.id===fm.dataset.fazenda), id=fm.dataset.id, antes=fz?.vinculos.find(v=>v.id===id);
    const ent=antes?.entidade || el('ent').value, ini=el('ini').value||null, fim=el('fim').value||null;
    if(!fz || !ent) return;
    if(!antes && fz.vinculos.some(v=>v.entidade===ent)) return erro(null, 'Este CPF/CNPJ já está vinculado a esta inscrição.');
    if(ini && fim && fim<ini) return erro(null, 'O fim da vigência é antes do início.');
    const padrao=antes?.padrao || el('padrao').checked || !fz.vinculos.length;
    const v={id:id||uid(), fazenda:fz.id, entidade:ent, percentual:+el('pct').value, condicao:el('cond').value, padrao, inicio:ini, fim};
    E.vincEdit=null;
    const antigo=padrao && !antes?.padrao ? fz.vinculos.filter(x=>x.padrao && x.id!==v.id).map(x=>['vinculos', {id:x.id, padrao:false}]) : [];
    return salvarLote([...antigo, ['vinculos', linha.vinculo(v)]]); }
  if(f==='fCaixa'){ const dc=lerDoc(el); if(dc.erro) return erro(null, dc.erro);
    const it={id:uid(), data:el('data').value, tipo:E.tipoLanc, cat:el('cat').value, desc:el('desc').value.trim(), valor:+el('valor').value, ...lerFatForm(el, principal), ...dc};
    return salvar(E.modoCaixa==='real'?'lancamentos':'compromissos', linha.lancamento(it, principal)); }
  if(f==='fMover'){ const {fazenda, entidade}=lerFat(el('dest').value), tab=fm.dataset.tab, ids=[...(E.sel?.ids||[])];
    if(!ids.length) return erro(null, 'Marque ao menos um registro.');
    track('feature_used', {funcao:'mover_lote', tabela:tab, qtd:ids.length});
    E.sel=null;
    return salvarLote(ids.map(id=>[tab, {id, fazenda_id:fazenda, entidade_id:entidade}]), {metrica:false}); }
  if(f==='fAp'){ const t=talById(E.apTal), ids=[...E.apSel];
    if(!ids.length){ $('apSum').innerHTML='<span class="down">Marque ao menos um ramal.</span>'; return; }
    E.apSel=null;
    /* a operação é da inscrição dona do talhão */
    if(E.opTipo==='estria') return salvar('estrias', linha.estria({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,qtd:sum(ramsDe(t,ids),arv),dias:+$('aDias').value,resineiro:$('aRes').value.trim()}, t.fazenda));
    return salvar('coletas', linha.coleta({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,kg:+$('aKg').value}, t.fazenda)); }
  if(f==='fTal'){ const nome=$('tNome').value.trim();
    if(talByNome(nome)) return erro('tErr','Já existe um talhão com esse nome.');
    const t={id:uid(),nome}; E.talSel=t.id; return salvar('talhoes', linha.talhao(t, $('tFaz')?.value || principal)); }
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
  if(f==='fVenda'){ const q=lerFatForm(el, principal), faz=S.fazendas.find(z=>z.id===q.fazenda);
    const v={id:uid(),data:$('vData').value,comprador:$('vComp').value.trim(),kg:+$('vKg').value,preco:+$('vPreco').value,fator:(REG[faz?.regime]||REG.funrural).f,
      comNota:mod('nfe')&&$('vNota')?.value==='1',nf:null,recs:[],venc:$('vVenc').value||hoje(), ...q, tipoDoc:mod('nfe')&&$('vNota')?.value==='1'?'NF':null};
    const itens=[['vendas', linha.venda(v, principal)]];
    if($('vRec').value==='1') itens.push(['recebimentos', linha.recebimento({id:uid(),data:v.data,valor:liqV(v),forma:'Dinheiro'}, v.id)]);
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
    const q=lerFatForm(el, null), tipo=fm.dataset.tipo, cat=el('cat').value;
    E.editar=null;
    return salvar(fm.dataset.tab, {id:fm.dataset.id, data:el('data').value, valor:+el('valor').value, cat, descr:el('desc').value.trim(),
      ...(q.fazenda?{fazenda_id:q.fazenda, entidade_id:q.entidade}:{}),
      data_competencia:dc.competencia||el('data').value, categoria_irpf:dc.catIr||catIrDe({tipo, cat}), tipo_documento:dc.tipoDoc, numero_documento:dc.numDoc,
      contraparte_nome:dc.contraparteNome, contraparte_documento:dc.contraparteDoc, conta_bancaria_id:dc.conta}); }
  if(fm.classList.contains('fEdVenda')){ const v=S.vendas.find(x=>x.id===fm.dataset.id);
    if(v && abaixoDoRecebido(v, +el('kg').value, +el('preco').value)){ const p=fm.querySelector('.err');
      p.textContent=`Já foram recebidos ${brl(recV(v))} nesta venda. O valor não pode ficar abaixo disso.`; p.hidden=false; return; }
    const q=lerFatForm(el, null);
    E.editar=null;
    return salvar('vendas', {id:fm.dataset.id, comprador:el('comprador').value.trim(), kg:+el('kg').value, preco:+el('preco').value, data:el('data').value, venc:el('venc').value||null,
      ...(q.fazenda?{fazenda_id:q.fazenda, entidade_id:q.entidade}:{})}); }
});
/* "Faturado por" marcado no formulário → {fazenda, entidade}; sem o campo, a inscrição principal */
function lerFatForm(el, principal){
  const v=el('fat')?.value;
  return v ? lerFat(v) : {fazenda:principal, entidade:null};
}
function syncAp(){
  const t=talById(E.apTal), box=document.getElementById('apSum'); if(!t||!box) return;
  E.apSel=new Set([...document.querySelectorAll('#fAp input[name=ram]:checked')].map(c=>c.value));
  const rr=ramsDe(t,[...E.apSel]), a=sum(rr,arv);
  box.innerHTML = rr.length ? `<div class="rec"><span>${rr.length} de ${plural(t.ramais.length,'ramal','ramais')}</span><b>${plural(a,'árvore','árvores')}${E.opTipo==='estria'?' = '+plural(a,'estria','estrias'):''}</b></div>` : '<span class="note">Nenhum ramal marcado.</span>';
}
/* prévia da venda com o regime da inscrição escolhida em "Faturado por" */
function syncVenda(){
  const box=document.getElementById('vPrev'); if(!box) return;
  const kg=+document.getElementById('vKg').value||0, p=+document.getElementById('vPreco').value||0;
  const fz=document.querySelector('#fVenda input[name=fat]:checked')?.value, faz=S.fazendas.find(z=>z.id===lerFat(fz).fazenda) || S.fazendas[0];
  const r=REG[faz?.regime]||REG.funrural;
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
