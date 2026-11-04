/* ---------- CPF e CNPJ: só dígitos, máscara e dígito verificador ---------- */
const soDig = x => String(x||'').replace(/\D/g,'');
function mascaraDoc(d){ d=soDig(d).slice(0,14);
  return d.length<=11 ? d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')
    : d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'); }
function cpfValido(c){ c=soDig(c); if(c.length!==11||/^(\d)\1+$/.test(c)) return false;
  const dv=n=>{ let s=0; for(let i=0;i<n;i++) s+=+c[i]*(n+1-i); const r=s*10%11; return r===10?0:r; };
  return dv(9)===+c[9] && dv(10)===+c[10]; }
function cnpjValido(c){ c=soDig(c); if(c.length!==14||/^(\d)\1+$/.test(c)) return false;
  const dv=n=>{ let s=0,p=n-7; for(let i=0;i<n;i++){ s+=+c[i]*p--; if(p<2) p=9; } const r=s%11; return r<2?0:11-r; };
  return dv(12)===+c[12] && dv(13)===+c[13]; }
/* tipo 'PF' pede CPF, 'PJ' pede CNPJ; sem tipo aceita qualquer um dos dois */
function docValido(d, tipo){
  d=soDig(d);
  if (tipo==='PF') return cpfValido(d);
  if (tipo==='PJ') return cnpjValido(d);
  return d.length===11 ? cpfValido(d) : cnpjValido(d);
}

export { soDig, mascaraDoc, cpfValido, cnpjValido, docValido };
