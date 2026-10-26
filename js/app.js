import { brl, num, esc, uid, hoje, safraIni, sum } from './util.js';
import { saldoV, REG, fat, liqV, livre, arv, talByNome, talById, ramsDe, S } from './regras.js';
import { exemplo } from './exemplo.js';
import { MODS, NAV_MOD, vazio, CUR, E, SES, usuario, fazAtual, mod, abrirSessao, fecharSessao, usarFazendaId,
  salvar, salvarLote, apagar, sincronizar, nPendentes, listaErros, EX, linhasExemplo, regerarExemplo, prepararExemplo } from './estado.js';
import { ultimoUsuario } from './local.js';
import { linha, linhasDaFazenda, linhasDoTalhao } from './mapa.js';
import { entrar, cadastrar, sessao, ieDisponivel } from './nuvem.js';
import { soDig, abrirEmissao } from './nfe.js';
import { V } from './telas.js';

function usarFazenda(fid){
  usarFazendaId(fid);
  E.talSel=null; E.ramSel=null; E.apTal=null; E.apSel=null; E.aberta=null; E.safraSel=CUR; E.fazEdit=null; E.editar=null; E.confirmar=null;
  E.atual = fid==='todas' ? 'geral' : 'inicio';
  render(); window.scrollTo(0,0);
}
/* depois do login: abre o cache do usuário, mostra as fazendas e sincroniza */
async function aposLogin(u){
  abrirSessao(u.id, {email:u.email, nome:u.user_metadata?.nome||''});
  E.atual='fazendas'; E.sairPend=false; render(); window.scrollTo(0,0);
  if ((await sincronizar()).ok) prepararExemplo();
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
const campoEmFoco = () => app.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
let renderPendente = false;
E.render = render;
/* {seguro:true}: vindo da sincronização; não redesenha por cima de um formulário sendo preenchido */
function render(op){
  if (op?.seguro && campoEmFoco()) { renderPendente=true; return; }
  renderPendente=false;
  const u=usuario(), fid=SES.fid;
  if (E.atual==='carregando') { app.innerHTML='<p class="note">Abrindo o caderno…</p>'; hdr.innerHTML='<h1>Caderno da Resina</h1>'; nav.hidden=true; return; }
  if (!u) E.atual='login';
  else if (!fid && E.atual!=='conta') E.atual='fazendas';
  else if (fid==='todas' && !['geral','conta','fazendas'].includes(E.atual)) E.atual='geral';
  if (fazAtual() && NAV_MOD[E.atual] && !mod(NAV_MOD[E.atual])) E.atual='inicio';
  if (E.atual==='inicio' && !fazAtual()) E.atual = u? (fid==='todas'?'geral':'fazendas') : 'login';
  app.innerHTML = `<div class="view wrap" style="max-width:none">${V[E.atual]()}</div>`;
  const f=fazAtual(), g=fid==='todas';
  hdr.innerHTML = !u ? `<h1>Caderno da Resina</h1><p>Gestão simples para quem vive do pinus</p>`
    : `<div class="hrow"><div><h1>${g?'Visão geral':f?esc(f.nome):'Caderno da Resina'}</h1>
        <p>${g? u.fazendas.length+' fazendas · '+esc(u.nome) : f? 'IE '+esc(f.ie)+' · '+esc(f.municipio)+'/'+f.uf : esc(u.nome)}</p>
        <button type="button" id="sync" class="sync"></button></div>
        <div class="hbtn">${(f||g)?'<button type="button" class="btn sm ghost" data-trocar="1">Trocar fazenda</button>':''}<button type="button" class="btn sm ghost" data-conta="1" ${E.atual==='conta'?'aria-current="page"':''}>Conta</button></div></div>`;
  nav.hidden = !f;
  nav.querySelectorAll('button').forEach(b=>{ b.hidden = !!NAV_MOD[b.dataset.v] && !mod(NAV_MOD[b.dataset.v]);
    if(b.dataset.v===E.atual) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  document.getElementById('demo').hidden = !(f && S.demo);
  if (E.atual==='login' && E.emailPre) { const el=document.getElementById('lEmail'); if (el) el.value=E.emailPre; }
  mostrarSync(); syncAp(); syncVenda();
}
function ir(v){ E.atual=v; E.editar=null; E.confirmar=null; render(); window.scrollTo(0,0); }
app.addEventListener('focusout',()=>setTimeout(()=>{ if(renderPendente && !campoEmFoco()) render(); },0));
nav.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) ir(b.dataset.v); });
hdr.addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.trocar){ usarFazendaId(null); ir('fazendas'); }
  if(b.dataset.conta){ E.fazEdit=null; ir('conta'); }
  if(b.id==='sync'){
    if(b.dataset.sync==='erros'){ ir('conta'); document.getElementById('erros')?.scrollIntoView({block:'start'}); }
    else if(b.dataset.sync==='login'){ E.emailPre=usuario()?.email||''; await fecharSessao(); E.lMode='entrar'; ir('login'); }
    else sincronizar();
  } });
document.getElementById('limpar').addEventListener('click',()=>{ const f=fazAtual(); if(!f) return;
  salvarLote([...linhasDaFazenda(SES.L, f.id).map(([t,id])=>[t,{id, deleted_at:agoraIso()}]), ['fazendas',{id:f.id, demo:false}]]); });

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
  if(d.faz){ usarFazenda(d.faz); }
  else if(d.lmode){ E.lMode=d.lmode; render(); }
  else if(d.demo){ b.disabled=true; b.textContent='Entrando…';
    try { await aposLogin(await entrar(EX.email, EX.senha)); }
    catch(err){ b.disabled=false; b.textContent='Entrar como exemplo'; const el=document.getElementById('lErr'); el.textContent=err.message; el.hidden=false; } }
  else if(d.preencher){ document.getElementById('lEmail').value=EX.email; document.getElementById('lSenha').value=EX.senha; document.getElementById('lEmail').focus(); }
  else if(d.sair!==undefined){
    if(d.sair===''){ E.sairPend=false; render(); }
    else if(!d.ok && nPendentes()){ E.sairPend=true; render(); }
    else { await fecharSessao(); E.sairPend=false; E.lMode='entrar'; E.emailPre=''; ir('login'); } }
  else if(d.editfaz!==undefined){ E.fazEdit=d.editfaz||null; E.limparPend=null; render(); if(E.fazEdit) document.getElementById('fFaz')?.scrollIntoView({block:'start'}); }
  else if(d.limpafaz!==undefined){
    if(d.ok){ const id=d.limpafaz; E.limparPend=null;
      salvarLote([...linhasDaFazenda(SES.L, id).map(([t,x])=>[t,{id:x, deleted_at:agoraIso()}]), ['fazendas',{id, demo:false}]]); }
    else { E.limparPend=d.limpafaz||null; render(); } }
  else if(d.regerar){ const f=usuario().fazendas.find(x=>x.id===d.regerar); if(f) regerarExemplo(f); }
  else if(d.safra){ E.safraSel=+d.safra; render(); }
  else if(d.tal){ E.talSel=d.tal; E.ramSel=null; E.editar=null; E.confirmar=null; render(); }
  else if(d.fl){ E.flMode=d.fl; render(); }
  else if(d.ram!==undefined){ E.ramSel=d.ram||null; E.editar=null; E.confirmar=null; render(); if(E.ramSel) document.getElementById('cardRam')?.scrollIntoView({block:'nearest'}); }
  else if(d.op){ E.opTipo=d.op; E.apSel=null; render(); }
  else if(d.aptal){ E.apTal=d.aptal; E.apSel=null; render(); }
  else if(d.apall){ document.querySelectorAll('#fAp input[name=ram]').forEach(c=>c.checked=d.apall==='1'); syncAp(); }
  else if(d.goap){ E.atual='floresta'; E.flMode='apontar'; E.opTipo=d.goap; E.apSel=null; render(); window.scrollTo(0,0); }
  else if(d.reg){ salvar('fazendas', {id:SES.fid, regime:d.reg}); }
  else if(d.modo){ E.modoCaixa=d.modo; E.editar=null; E.confirmar=null; render(); }
  else if(d.tipo){ E.tipoLanc=d.tipo; render(); }
  else if(d.realizar){ const c=S.comp.find(x=>x.id===d.realizar); if(!c) return;
    salvarLote([['compromissos',{id:c.id, deleted_at:agoraIso()}], ['lancamentos', linha.lancamento({...c, id:uid(), data: c.data<hoje()? c.data : hoje()}, SES.fid)]]); }
  else if(d.emitir){ abrirEmissao(d.emitir); }
  else if(d.comnota){ E.aberta=d.comnota; salvar('vendas', {id:d.comnota, com_nota:true}); abrirEmissao(d.comnota); }
  else if(d.excluir!==undefined){
    if(!d.excluir){ E.confirmar=null; render(); }
    else if(!d.ok){ E.confirmar=d.excluir; E.editar=null; render(); }
    else { const [tab,id]=d.excluir.split(':'); E.confirmar=null; if(tab==='ramais') E.ramSel=null; apagar(itensExcluir(tab,id)); } }
  else if(d.editar!==undefined){ E.editar=d.editar||null; E.confirmar=null; render(); }
});
app.addEventListener('toggle',e=>{ const d=e.target; if(!d.matches?.('details.venda')) return;
  if(d.open) E.aberta=d.dataset.venda; else if(E.aberta===d.dataset.venda) E.aberta=null; }, true);
app.addEventListener('change',e=>{
  if(e.target.id==='ideal'){ const v=+e.target.value; if(v>=7&&v<=30) salvar('fazendas', {id:SES.fid, intervalo_ideal:v}); }
  if(e.target.name==='ram') syncAp();
  if(e.target.name==='mod') syncMods(e.target);
});
app.addEventListener('submit',async e=>{
  e.preventDefault(); const $=id=>document.getElementById(id); const f=e.target.id, fid=SES.fid;
  const erro=(id,m)=>{ const el=$(id); el.textContent=m; el.hidden=false; };
  if(f==='fLogin'){ const email=$('lEmail').value.trim().toLowerCase(), senha=$('lSenha').value, btn=e.target.querySelector('.btn');
    btn.disabled=true;
    try {
      if(E.lMode==='entrar') return await aposLogin(await entrar(email, senha));
      const modulos=Object.fromEntries(MODS.map(m=>[m.k, !!e.target.querySelector(`input[name=mod][value="${m.k}"]`)?.checked]));
      return await aposLogin(await cadastrar($('lNome').value.trim(), email, senha, modulos));
    } catch(err){ btn.disabled=false; return erro('lErr', err.message); } }
  if(f==='fUser'){ salvar('perfis', {id:usuario().id, nome:$('uNome').value.trim()}); return; }
  if(f==='fFaz'){ const u=usuario(), id=e.target.dataset.id, ie=soDig($('zIe').value);
    if(ie.length<8 || ie.length>14) return erro('zErr','A Inscrição Estadual deve ter de 8 a 14 dígitos.');
    if(u.fazendas.some(z=>z.ie===ie && z.id!==id)) return erro('zErr','Você já tem uma fazenda com esta Inscrição Estadual.');
    if(await ieDisponivel(ie, id||null)===false) return erro('zErr','Esta Inscrição Estadual já está cadastrada em outra conta.');
    const campos={nome:$('zNome').value.trim(), ie, doc:soDig($('zDoc').value), municipio:$('zMun').value.trim(), uf:$('zUf').value}, regime=$('zReg').value;
    if(id){ E.fazEdit=null; salvar('fazendas', {id, ...campos, regime}); return; }
    const nova={id:uid(), ...campos};
    if($('zEx').checked) salvarLote(linhasExemplo(nova, exemplo(2+Math.floor(Math.random()*997), null, regime)));
    else salvar('fazendas', linha.fazenda(nova, {...vazio(), regime}));
    if(E.atual==='fazendas') usarFazenda(nova.id);
    return; }
  if(f==='fCaixa'){ const it={id:uid(),data:$('cData').value,tipo:E.tipoLanc,cat:$('cCat').value,desc:$('cDesc').value.trim(),valor:+$('cValor').value};
    return salvar(E.modoCaixa==='real'?'lancamentos':'compromissos', linha.lancamento(it, fid)); }
  if(f==='fAp'){ const t=talById(E.apTal), ids=[...E.apSel];
    if(!ids.length){ $('apSum').innerHTML='<span class="down">Marque ao menos um ramal.</span>'; return; }
    E.apSel=null;
    if(E.opTipo==='estria') return salvar('estrias', linha.estria({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,qtd:sum(ramsDe(t,ids),arv),dias:+$('aDias').value,resineiro:$('aRes').value.trim()}, fid));
    return salvar('coletas', linha.coleta({id:uid(),data:$('aData').value,talhao:t.id,ramais:ids,kg:+$('aKg').value}, fid)); }
  if(f==='fTal'){ const nome=$('tNome').value.trim();
    if(talByNome(nome)) return erro('tErr','Já existe um talhão com esse nome.');
    const t={id:uid(),nome}; E.talSel=t.id; return salvar('talhoes', linha.talhao(t, fid)); }
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
  if(f==='fVenda'){
    const v={id:uid(),data:$('vData').value,comprador:$('vComp').value.trim(),kg:+$('vKg').value,preco:+$('vPreco').value,fator:fat(),
      comNota:mod('nfe')&&$('vNota')?.value==='1',nf:null,recs:[],venc:$('vVenc').value||hoje()};
    const itens=[['vendas', linha.venda(v, fid)]];
    if($('vRec').value==='1') itens.push(['recebimentos', linha.recebimento({id:uid(),data:v.data,valor:liqV(v),forma:'Dinheiro'}, v.id)]);
    E.aberta=v.id; E.safraSel=safraIni(v.data);
    salvarLote(itens);
    if(v.comNota) abrirEmissao(v.id);
    return;
  }
  const fm=e.target, el=n=>fm.elements.namedItem(n);
  if(fm.classList.contains('fRec')){
    const v=S.vendas.find(x=>x.id===fm.dataset.id), val=Math.min(+el('val').value, saldoV(v));
    if(val>0){ E.aberta=v.id; salvar('recebimentos', linha.recebimento({id:uid(),data:el('d').value,valor:val,forma:el('f').value}, v.id)); }
    return;
  }
  if(fm.classList.contains('fEdLanc')){ E.editar=null;
    return salvar(fm.dataset.tab, {id:fm.dataset.id, data:el('data').value, valor:+el('valor').value, cat:el('cat').value, descr:el('desc').value.trim()}); }
  if(fm.classList.contains('fEdVenda')){ E.editar=null;
    return salvar('vendas', {id:fm.dataset.id, comprador:el('comprador').value.trim(), kg:+el('kg').value, preco:+el('preco').value, data:el('data').value, venc:el('venc').value||null}); }
});
function syncAp(){
  const t=talById(E.apTal), box=document.getElementById('apSum'); if(!t||!box) return;
  E.apSel=new Set([...document.querySelectorAll('#fAp input[name=ram]:checked')].map(c=>c.value));
  const rr=ramsDe(t,[...E.apSel]), a=sum(rr,arv);
  box.innerHTML = rr.length ? `<div class="rec"><span>${rr.length} de ${t.ramais.length} ramais</span><b>${num(a)} árvores${E.opTipo==='estria'?' = '+num(a)+' estrias':''}</b></div>` : '<span class="note">Nenhum ramal marcado.</span>';
}
function syncVenda(){
  const box=document.getElementById('vPrev'); if(!box) return;
  const kg=+document.getElementById('vKg').value||0, p=+document.getElementById('vPreco').value||0;
  box.innerHTML=`<div class="rec"><span>Preço livre (${REG[S.regime].nome})</span><b class="liv">${brl(livre(p))}/kg</b></div><div class="rec"><span>Você recebe</span><b>${brl(kg*livre(p))}</b></div>`;
}
app.addEventListener('input',e=>{ if(e.target.id==='vKg'||e.target.id==='vPreco') syncVenda(); });

/* sincroniza ao voltar a conexão, ao voltar para a aba e a cada minuto com a aba visível */
window.addEventListener('online',()=>sincronizar());
window.addEventListener('offline',()=>{ if(SES.L){ SES.sync='offline'; mostrarSync(); } });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && SES.L) sincronizar(); });
setInterval(()=>{ if(document.visibilityState==='visible' && SES.L) sincronizar(); }, 60000);

/* abertura: sessão salva neste aparelho; sem rede, abre o cache do último usuário */
async function iniciar(){
  E.atual='carregando'; render();
  const s=await sessao(), ult=ultimoUsuario();
  if (s) abrirSessao(s.user.id, {email:s.user.email, nome:s.user.user_metadata?.nome||''});
  else if (ult && !navigator.onLine) abrirSessao(ult);
  E.atual = SES.L ? 'fazendas' : 'login';
  render();
  if (SES.L && (await sincronizar()).ok) prepararExemplo();
}
iniciar();
/* guarda o app no aparelho para abrir sem internet */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
