import { brl, num, esc, uid, hoje, safraIni, sum } from './util.js';
import { saldoV, REG, liqV, livre, arv, talByNome, ramsDe, S, usarDados, dados } from './regras.js';
import { exemplo } from './exemplo.js';
import { MODS, NAV_MOD, hashS, DB, salvar, usuario, fazAtual, mod, vazio, CUR, E, EX, garantirExemplo } from './estado.js';
import { soDig, abrirEmissao } from './nfe.js';
import { V } from './telas.js';

function usarFazenda(fid){
  DB.sessao.fid = fid; salvar();
  usarDados(fazAtual()?.dados || vazio());
  E.talSel=null; E.ramSel=null; E.apTal=null; E.apSel=null; E.aberta=null; E.safraSel=CUR; E.fazEdit=null;
  E.atual = fid==='todas' ? 'geral' : 'inicio';
  render(); window.scrollTo(0,0);
}
function entrar(u){ DB.sessao={uid:u.id, fid:null}; salvar(); usarDados(vazio()); E.atual='fazendas'; render(); window.scrollTo(0,0); }
function criarDemo(){ entrar(garantirExemplo()); }
/* dependências entre funções: Produção precisa de Floresta; NF-e precisa de Vendas */
function syncMods(src){
  const box=src.closest('.mods'); if(!box) return;
  const cb=k=>box.querySelector(`input[value="${k}"]`);
  MODS.filter(m=>m.req).forEach(m=>{
    if (src.value===m.k && src.checked) cb(m.req).checked=true;
    if (src.value===m.req && !src.checked) cb(m.k).checked=false;
  });
  if (E.atual==='conta') { const u=usuario(); box.querySelectorAll('input[name=mod]').forEach(c=>u.modulos[c.value]=c.checked); salvar(); }
}

/* ---------- render e eventos ---------- */
const app = document.getElementById('app');
E.render = render;
function render(){
  const u=usuario(), fid=DB.sessao?.fid;
  if (!u) E.atual='login';
  else if (!fid && E.atual!=='conta') E.atual='fazendas';
  else if (fid==='todas' && !['geral','conta','fazendas'].includes(E.atual)) E.atual='geral';
  if (fazAtual() && NAV_MOD[E.atual] && !mod(NAV_MOD[E.atual])) E.atual='inicio';
  if (E.atual==='inicio' && !fazAtual()) E.atual = u? (fid==='todas'?'geral':'fazendas') : 'login';
  app.innerHTML = `<div class="view wrap" style="max-width:none">${V[E.atual]()}</div>`;
  const f=fazAtual(), g=fid==='todas';
  hdr.innerHTML = !u ? `<h1>Caderno da Resina</h1><p>Gestão simples para quem vive do pinus</p>`
    : `<div class="hrow"><div><h1>${g?'Visão geral':f?esc(f.nome):'Caderno da Resina'}</h1>
        <p>${g? u.fazendas.length+' fazendas · '+esc(u.nome) : f? 'IE '+esc(f.ie)+' · '+esc(f.municipio)+'/'+f.uf : esc(u.nome)}</p></div>
        <div class="hbtn">${(f||g)?'<button type="button" class="btn sm ghost" data-trocar="1">Trocar fazenda</button>':''}<button type="button" class="btn sm ghost" data-conta="1" ${E.atual==='conta'?'aria-current="page"':''}>Conta</button></div></div>`;
  nav.hidden = !f;
  nav.querySelectorAll('button').forEach(b=>{ b.hidden = !!NAV_MOD[b.dataset.v] && !mod(NAV_MOD[b.dataset.v]);
    if(b.dataset.v===E.atual) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  document.getElementById('demo').hidden = !(f && S.demo);
  syncAp(); syncVenda();
}
const hdr=document.getElementById('hdr'), nav=document.getElementById('nav');
function ir(v){ E.atual=v; render(); window.scrollTo(0,0); }
nav.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) ir(b.dataset.v); });
hdr.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.trocar){ DB.sessao.fid=null; salvar(); usarDados(vazio()); ir('fazendas'); }
  if(b.dataset.conta){ E.fazEdit=null; ir('conta'); } });
document.getElementById('limpar').addEventListener('click',()=>{ const f=fazAtual(); if(!f) return;
  f.dados = {...vazio(), regime:S.regime, ideal:S.ideal}; usarDados(f.dados); salvar(); render(); });

app.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const d=b.dataset;
  if(d.faz){ usarFazenda(d.faz); }
  else if(d.lmode){ E.lMode=d.lmode; render(); }
  else if(d.demo){ criarDemo(); }
  else if(d.preencher){ document.getElementById('lEmail').value=EX.email; document.getElementById('lSenha').value=EX.senha; document.getElementById('lEmail').focus(); }
  else if(d.sair){ DB.sessao=null; salvar(); usarDados(vazio()); E.lMode='entrar'; ir('login'); }
  else if(d.editfaz!==undefined){ E.fazEdit=d.editfaz||null; E.limparPend=null; render(); if(E.fazEdit) document.getElementById('fFaz')?.scrollIntoView({block:'start'}); }
  else if(d.limpafaz!==undefined){
    if(d.ok){ const z=usuario().fazendas.find(x=>x.id===d.limpafaz); z.dados={...vazio(),regime:z.dados.regime,ideal:z.dados.ideal}; if(z.id===DB.sessao.fid) usarDados(z.dados); E.limparPend=null; salvar(); }
    else E.limparPend=d.limpafaz||null;
    render(); }
  else if(d.safra){ E.safraSel=+d.safra; render(); }
  else if(d.tal){ E.talSel=d.tal; E.ramSel=null; render(); }
  else if(d.fl){ E.flMode=d.fl; render(); }
  else if(d.ram!==undefined){ E.ramSel=d.ram||null; render(); if(E.ramSel) document.getElementById('cardRam')?.scrollIntoView({block:'nearest'}); }
  else if(d.op){ E.opTipo=d.op; E.apSel=null; render(); }
  else if(d.aptal){ E.apTal=d.aptal; E.apSel=null; render(); }
  else if(d.apall){ document.querySelectorAll('#fAp input[name=ram]').forEach(c=>c.checked=d.apall==='1'); syncAp(); }
  else if(d.goap){ E.atual='floresta'; E.flMode='apontar'; E.opTipo=d.goap; E.apSel=null; render(); window.scrollTo(0,0); }
  else if(d.reg){ S.regime=d.reg; salvar(); render(); }
  else if(d.modo){ E.modoCaixa=d.modo; render(); }
  else if(d.tipo){ E.tipoLanc=d.tipo; render(); }
  else if(d.realizar){ const i=S.comp.findIndex(c=>c.id===d.realizar); const c=S.comp.splice(i,1)[0];
    S.caixa.push({...c, data: c.data<hoje()? c.data : hoje()}); salvar(); render(); }
  else if(d.emitir){ abrirEmissao(d.emitir); }
  else if(d.comnota){ const v=S.vendas.find(x=>x.id===d.comnota); v.comNota=true; E.aberta=v.id; salvar(); render(); abrirEmissao(v.id); }
});
app.addEventListener('toggle',e=>{ const d=e.target; if(!d.matches?.('details.venda')) return;
  if(d.open) E.aberta=d.dataset.venda; else if(E.aberta===d.dataset.venda) E.aberta=null; }, true);
app.addEventListener('change',e=>{
  if(e.target.id==='ideal'){ const v=+e.target.value; if(v>=7&&v<=30){ S.ideal=v; salvar(); render(); } }
  if(e.target.name==='ram') syncAp();
  if(e.target.name==='mod') syncMods(e.target);
});
app.addEventListener('submit',e=>{
  e.preventDefault(); const $=id=>document.getElementById(id); const f=e.target.id;
  if(f==='fLogin'){ const email=$('lEmail').value.trim().toLowerCase(), err=$('lErr'), falha=m=>{ err.textContent=m; err.hidden=false; };
    if(E.lMode==='entrar'){ const u=DB.users.find(x=>x.email===email);
      if(!u || u.senha!==hashS($('lSenha').value)) return falha('E-mail ou senha incorretos.');
      return entrar(u); }
    if(DB.users.some(x=>x.email===email)) return falha('Já existe uma conta com este e-mail. Use Entrar.');
    const modulos=Object.fromEntries(MODS.map(m=>[m.k, !!e.target.querySelector(`input[name=mod][value="${m.k}"]`)?.checked]));
    const u={id:uid(), nome:$('lNome').value.trim(), email, senha:hashS($('lSenha').value), modulos, fazendas:[]};
    DB.users.push(u); return entrar(u); }
  if(f==='fUser'){ usuario().nome=$('uNome').value.trim(); salvar(); render(); return; }
  if(f==='fFaz'){ const u=usuario(), id=e.target.dataset.id, ie=soDig($('zIe').value), err=$('zErr'), falha=m=>{ err.textContent=m; err.hidden=false; };
    if(ie.length<8 || ie.length>14) return falha('A Inscrição Estadual deve ter de 8 a 14 dígitos.');
    const dono=DB.users.find(x=>x.fazendas.some(z=>z.ie===ie && z.id!==id));
    if(dono) return falha(dono.id===u.id ? 'Você já tem uma fazenda com esta Inscrição Estadual.' : 'Esta Inscrição Estadual já está cadastrada em outra conta.');
    const campos={nome:$('zNome').value.trim(), ie, doc:soDig($('zDoc').value), municipio:$('zMun').value.trim(), uf:$('zUf').value};
    if(id){ const z=u.fazendas.find(x=>x.id===id); Object.assign(z,campos); z.dados.regime=$('zReg').value; E.fazEdit=null; salvar(); render(); return; }
    const dados = $('zEx').checked ? exemplo(2+Math.floor(Math.random()*997)) : vazio(); dados.regime=$('zReg').value;
    const z={id:uid(), ...campos, dados}; u.fazendas.push(z); salvar();
    if(E.atual==='fazendas') return usarFazenda(z.id);
    render(); return; }
  if(f==='fCaixa'){ const it={id:uid(),data:$('cData').value,tipo:E.tipoLanc,cat:$('cCat').value,desc:$('cDesc').value.trim(),valor:+$('cValor').value};
    (E.modoCaixa==='real'?S.caixa:S.comp).push(it); }
  if(f==='fAp'){ const t=talByNome(E.apTal), ids=[...E.apSel];
    if(!ids.length){ document.getElementById('apSum').innerHTML='<span class="down">Marque ao menos um ramal.</span>'; return; }
    if(E.opTipo==='estria') S.estrias.push({id:uid(),data:$('aData').value,talhao:t.nome,ramais:ids,qtd:sum(ramsDe(t,ids),arv),dias:+$('aDias').value,resineiro:$('aRes').value.trim()});
    else S.producao.push({id:uid(),data:$('aData').value,talhao:t.nome,ramais:ids,kg:+$('aKg').value});
    E.apSel=null; }
  if(f==='fTal'){ const nome=$('tNome').value.trim(); if(!talByNome(nome)){ S.talhoes.push({id:uid(),nome,ramais:[]}); E.talSel=nome; } }
  if(f==='fRam'){ const t=talByNome(E.talSel); t.ramais.push({id:uid(),cod:$('rCod').value.trim(),hist:[{data:hoje(),arv:+$('rArv').value,motivo:'Contagem inicial'}]}); }
  if(f==='fCont'){ const t=talByNome(E.talSel), r=t?.ramais.find(x=>x.id===E.ramSel);
    if(r){ r.hist.push({data:$('kData').value,arv:+$('kArv').value,motivo:$('kMot').value}); r.hist.sort((a,b)=>a.data.localeCompare(b.data)); } }
  if(f==='fFlo'){ S.floresta=$('fNome').value.trim(); }
  if(f==='fVenda'){
    const v={id:uid(),data:$('vData').value,comprador:$('vComp').value.trim(),kg:+$('vKg').value,preco:+$('vPreco').value,
      comNota:mod('nfe')&&$('vNota')?.value==='1',nf:null,recs:[],venc:$('vVenc').value||hoje()};
    if($('vRec').value==='1') v.recs.push({id:uid(),data:v.data,valor:liqV(v),forma:'Dinheiro'});
    S.vendas.push(v); E.aberta=v.id; E.safraSel=safraIni(v.data); salvar(); render();
    if(v.comNota) abrirEmissao(v.id);
    return;
  }
  if(e.target.classList.contains('fRec')){
    const fm=e.target, el=n=>fm.elements.namedItem(n), v=S.vendas.find(x=>x.id===fm.dataset.id), val=Math.min(+el('val').value, saldoV(v));
    if(val>0){ v.recs.push({id:uid(),data:el('d').value,valor:val,forma:el('f').value}); E.aberta=v.id; }
  }
  salvar(); render();
});
function syncAp(){
  const t=talByNome(E.apTal), box=document.getElementById('apSum'); if(!t||!box) return;
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
render();
