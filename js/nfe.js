import { brl, num, esc, hoje } from './util.js';
import { totalV, chave, S, dados } from './regras.js';
import { salvar, E } from './estado.js';

/* ---------- NF-e (simulada) ---------- */
function proxNumero(){ return S.vendas.reduce((m,v)=>v.nf? Math.max(m,v.nf.numero):m,0)+1; }
const UFS='AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const soDig = x => String(x||'').replace(/\D/g,'');
function mascaraDoc(d){ d=soDig(d).slice(0,14);
  return d.length<=11 ? d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')
    : d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'); }
function cnpjValido(c){ c=soDig(c); if(c.length!==14||/^(\d)\1+$/.test(c)) return false;
  const dv=n=>{ let s=0,p=n-7; for(let i=0;i<n;i++){ s+=+c[i]*p--; if(p<2) p=9; } const r=s%11; return r<2?0:11-r; };
  return dv(12)===+c[12] && dv(13)===+c[13]; }
/* Consulta pública de CNPJ (dados da Receita Federal): BrasilAPI e, se falhar, Minha Receita */
async function buscarCnpj(cnpj){
  const urls=[`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,`https://minhareceita.org/${cnpj}`];
  let ultimo;
  for(const u of urls){
    try{
      const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),8000);
      const r=await fetch(u,{signal:ctl.signal}); clearTimeout(t);
      if(r.status===404) throw Object.assign(new Error('CNPJ não encontrado na Receita.'),{fim:true});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json();
      const end=[[j.descricao_tipo_de_logradouro,j.logradouro].filter(Boolean).join(' '), j.numero, j.complemento].filter(x=>x&&String(x).trim()).join(', ');
      return { razao:j.razao_social||'', fantasia:j.nome_fantasia||'', situacao:j.descricao_situacao_cadastral||'',
        endereco:end, bairro:j.bairro||'', municipio:j.municipio||'', uf:j.uf||'', cep:j.cep? String(j.cep).replace(/^(\d{5})(\d{3})$/,'$1-$2'):'',
        telefone:j.ddd_telefone_1||'', email:j.email||'', atividade:j.cnae_fiscal_descricao||'' };
    }catch(e){ if(e.fim) throw e; ultimo=e; }
  }
  throw new Error('Não foi possível consultar agora ('+(ultimo?.message||'sem conexão')+'). Preencha manualmente.');
}
function abrirEmissao(id){
  const v=S.vendas.find(x=>x.id===id), dlg=document.getElementById('dlgNf');
  if(!v||!dlg) return;
  const conhecido=S.compradores[v.comprador];
  let dest=conhecido?.dest||null;
  dlg.innerHTML=`<form class="dlg" id="fNf">
    <h2>Emitir NF-e</h2>
    <p class="note">Protótipo: a transmissão é simulada. Na versão real, a nota iria para a SEFAZ com o certificado digital do produtor.</p>
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
      <label>CPF/CNPJ do comprador<input id="nfDoc" inputmode="numeric" required placeholder="00.000.000/0000-00" value="${esc(conhecido?.doc||'')}"></label>
      <button type="button" class="btn sm" id="nfBuscar">Buscar CNPJ</button>
    </div>
    <div id="nfDest"></div>
    <div class="danfe">
      <dl class="kv"><dt>Produto</dt><dd>Goma resina de pinus</dd>
        <dt>Quantidade</dt><dd>${num(v.kg)} kg × ${brl(v.preco)}</dd>
        <dt>Total da nota</dt><dd><b>${brl(totalV(v))}</b></dd>
        <dt>Número</dt><dd>${proxNumero()} · série 1</dd></dl>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label>Sua UF<select id="nfUfProd"><option value="">—</option>${UFS.map(u=>`<option ${S.uf===u?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>Data de emissão<input id="nfData" type="date" value="${hoje()}" required></label>
      <label style="grid-column:1/-1">Operação (CFOP)<select id="nfCfop"><option value="5101">5101 · venda dentro do estado</option><option value="6101">6101 · venda para outro estado</option></select></label>
    </div>
    <div class="acts"><button type="button" class="btn sm ghost" id="nfCancel">Cancelar</button><button class="btn sm">Transmitir NF-e</button></div>
  </form>`;
  const q=sel=>dlg.querySelector(sel), docEl=q('#nfDoc'), box=q('#nfDest'), btn=q('#nfBuscar');
  const ajustaCfop=()=>{ if(dest?.uf && S.uf) q('#nfCfop').value = dest.uf===S.uf ? '5101':'6101'; };
  const mostra=()=>{
    if(!dest){ box.innerHTML=''; return; }
    const ativa=!dest.situacao || /ATIVA/i.test(dest.situacao);
    box.innerHTML=`<div class="box">
      <h3>${esc(dest.razao||v.comprador)} ${dest.situacao?`<span class="pill ${ativa?'ok':'pend'}">${esc(dest.situacao)}</span>`:''}</h3>
      <dl class="kv">${dest.fantasia?`<dt>Fantasia</dt><dd>${esc(dest.fantasia)}</dd>`:''}
        ${dest.endereco?`<dt>Endereço</dt><dd>${esc(dest.endereco)}${dest.bairro?' – '+esc(dest.bairro):''}</dd>`:''}
        <dt>Cidade</dt><dd>${esc(dest.municipio)}${dest.uf?' / '+esc(dest.uf):''}${dest.cep?' · CEP '+esc(dest.cep):''}</dd>
        ${dest.telefone?`<dt>Telefone</dt><dd>${esc(dest.telefone)}</dd>`:''}
        ${dest.email?`<dt>E-mail</dt><dd>${esc(dest.email)}</dd>`:''}
        ${dest.atividade?`<dt>Atividade</dt><dd>${esc(dest.atividade)}</dd>`:''}</dl>
      ${ativa?'':'<span class="note" style="color:var(--bad)">Atenção: CNPJ não está ativo na Receita. Confirme com o comprador antes de emitir.</span>'}
    </div>`;
    ajustaCfop();
  };
  const aviso=(t,erro)=>{ box.innerHTML=`<p class="note" style="${erro?'color:var(--bad)':''}">${esc(t)}</p>`; };
  async function consultar(){
    const d=soDig(docEl.value);
    if(d.length===11){ dest=null; aviso('CPF não tem consulta pública: confira o nome e o endereço com o comprador.'); return; }
    if(!cnpjValido(d)){ dest=null; aviso('CNPJ inválido: confira os números digitados.',true); return; }
    btn.disabled=true; btn.textContent='Buscando…'; aviso('Consultando a Receita Federal…');
    try{ dest=await buscarCnpj(d); mostra(); }
    catch(e){ dest=null; aviso(e.message,true); }
    finally{ btn.disabled=false; btn.textContent='Buscar CNPJ'; }
  }
  docEl.addEventListener('input',()=>{ docEl.value=mascaraDoc(docEl.value); if(soDig(docEl.value).length===14) consultar(); });
  btn.onclick=consultar;
  q('#nfUfProd').onchange=e=>{ S.uf=e.target.value; salvar(); ajustaCfop(); };
  mostra();
  dlg.onclose=()=>E.render();
  dlg.showModal();
  q('#nfCancel').onclick=()=>dlg.close();
  q('#fNf').addEventListener('submit',e=>{
    e.preventDefault(); e.stopPropagation();
    if(!docEl.value.trim()){ docEl.focus(); return; }
    const d=soDig(docEl.value);
    if(d.length===14 && !cnpjValido(d)){ aviso('CNPJ inválido: confira os números digitados.',true); docEl.focus(); return; }
    v.nf={numero:proxNumero(),serie:1,data:q('#nfData').value,doc:mascaraDoc(d),dest,
          cfop:q('#nfCfop').value,chave:chave(),protocolo:'1352'+Date.now().toString().slice(-11)};
    S.compradores[v.comprador]={doc:mascaraDoc(d),dest};
    salvar(); E.aberta=v.id; dlg.close();
  });
}

export { proxNumero, UFS, soDig, mascaraDoc, cnpjValido, buscarCnpj, abrirEmissao };
