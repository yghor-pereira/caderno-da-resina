const brl = n => (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num = (n,d=0) => (n||0).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});
const kfmt = n => Math.abs(n)>=1000 ? num(n/1000,1)+'k' : num(n, Math.abs(n)<10 && n%1 ? 2 : 0);
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid = () => crypto.randomUUID();
let hojeFixo = null;
/* permite fixar a data de hoje nos testes */
const definirHoje = s => { hojeFixo = s; };
const hoje = () => hojeFixo || new Date().toLocaleDateString('sv-SE');
const Dt = s => new Date(s+'T00:00:00Z');
const iso = d => d.toISOString().slice(0,10);
const addD = (s,n) => { const d=Dt(s); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const addM = (ym,n) => { let [y,m]=ym.split('-').map(Number); m+=n; y+=Math.floor((m-1)/12); m=((m-1)%12+12)%12+1; return `${y}-${String(m).padStart(2,'0')}`; };
const diff = (a,b) => Math.round((Dt(b)-Dt(a))/864e5);
const fdata = s => s.slice(8,10)+'/'+s.slice(5,7);
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MES_SAFRA = ['Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago'];
const safraIni = s => { const y=+s.slice(0,4), m=+s.slice(5,7); return m>=9?y:y-1; };
const safraLbl = y => `${String(y%100).padStart(2,'0')}/${String((y+1)%100).padStart(2,'0')}`;
const mIdx = s => (+s.slice(5,7)+3)%12;            // Set=0 … Ago=11
const sum = (a,f) => a.reduce((t,x)=>t+f(x),0);
function rng(seed){ return () => { seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const r2 = n => Math.round(n*100)/100;

export { brl, num, kfmt, esc, uid, hojeFixo, definirHoje, hoje, Dt, iso, addD, addM, diff, fdata, MESES, MES_SAFRA, safraIni, safraLbl, mIdx, sum, rng, r2 };
