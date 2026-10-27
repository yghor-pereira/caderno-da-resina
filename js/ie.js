/* ---------- Inscrição Estadual: dígito verificador por UF ----------
   Regras do Sintegra (www.sintegra.gov.br/insc_est.html). Recebe só os números.
   Os testes conferem cada UF com o exemplo publicado pelo Sintegra.
   AM, ES e MS não têm exemplo publicado: usam o módulo 11 simples, que é a regra descrita. */
const dig = s => [...s].map(Number);
const soma = (ds, pesos) => pesos.reduce((t,p,i)=>t+ds[i]*p, 0);
const de = (a, b) => Array.from({length:a-b+1}, (_,i)=>a-i);     // de(9,2) = [9,8,…,2]
/* módulo 11 mais comum: resto 0 ou 1 dá dígito 0 */
const m11 = (ds, pesos) => { const r = soma(ds, pesos)%11; return r<2 ? 0 : 11-r; };
/* 9 dígitos, pesos 9 a 2 no corpo de 8 */
const simples = ie => ie.length===9 && m11(dig(ie), de(9,2))===+ie[8];
/* confere vários dígitos: cada item é [posição do dígito, função que calcula] */
const confere = (ie, ...dvs) => dvs.every(([pos, f]) => f(dig(ie))===+ie[pos]);

const REGRAS = {
  AC: ie => ie.length===13 && ie.startsWith('01') && confere(ie, [11, d=>m11(d, [4,3,2,...de(9,2)])], [12, d=>m11(d, [5,4,3,2,...de(9,2)])]),
  AL: ie => ie.length===9 && ie.startsWith('24') && (soma(dig(ie), de(9,2))*10%11)%10===+ie[8],
  AP: ie => {
    if (ie.length!==9 || !ie.startsWith('03')) return false;
    const n = +ie.slice(0,8), [p, d] = n<=3017000 ? [5,0] : n<=3019022 ? [9,1] : [0,0];
    const r = 11-(p+soma(dig(ie), de(9,2)))%11;
    return (r===10 ? 0 : r===11 ? d : r)===+ie[8];
  },
  AM: simples,
  BA: ie => {
    if (ie.length!==8 && ie.length!==9) return false;
    const n = ie.length-2, ds = dig(ie), mod = '679'.includes(ie[ie.length===8?0:1]) ? 11 : 10;
    const dv = pesos => { const r = soma(ds, pesos)%mod; return mod===10 ? (r ? 10-r : 0) : (r<2 ? 0 : 11-r); };
    const d2 = dv(de(n+1,2));                      // o último dígito é calculado primeiro
    ds[n] = d2;
    return d2===+ie[n+1] && dv(de(n+2,2))===+ie[n];
  },
  CE: simples,
  DF: ie => ie.length===13 && ie.startsWith('07') && confere(ie, [11, d=>m11(d, [4,3,2,...de(9,2)])], [12, d=>m11(d, [5,4,3,2,...de(9,2)])]),
  ES: simples,
  GO: ie => {
    if (ie.length!==9 || !/^(10|11|15|2\d)/.test(ie)) return false;
    const r = soma(dig(ie), de(9,2))%11, n = +ie.slice(0,8);
    return (r===0 ? 0 : r===1 ? (n>=10103105 && n<=10119997 ? 1 : 0) : 11-r)===+ie[8];
  },
  MA: ie => ie.startsWith('12') && simples(ie),
  MG: ie => {
    if (ie.length!==13) return false;
    const c = ie.slice(0,3)+'0'+ie.slice(3,11);    // insere 0 depois do código do município
    const s1 = [...dig(c).map((d,i)=>d*(i%2?2:1)).join('')].reduce((t,x)=>t+ +x, 0);
    return (10-s1%10)%10===+ie[11] && confere(ie, [12, d=>m11(d, [3,2,...de(11,2)])]);
  },
  MS: simples,
  MT: ie => ie.length===11 && confere(ie, [10, d=>m11(d, [3,2,...de(9,2)])]),
  PA: simples,
  PB: simples,
  PE: ie => ie.length===9 ? confere(ie, [7, d=>m11(d, de(8,2))], [8, d=>m11(d, de(9,2))])
    : ie.length===14 && (11-soma(dig(ie), [5,4,3,2,1,...de(9,2)])%11)%10===+ie[13],   // formato antigo
  PI: simples,
  PR: ie => ie.length===10 && confere(ie, [8, d=>m11(d, [3,2,...de(7,2)])], [9, d=>m11(d, [4,3,2,...de(7,2)])]),
  RJ: ie => ie.length===8 && confere(ie, [7, d=>m11(d, [2,...de(7,2)])]),
  RN: ie => (ie.length===9 || ie.length===10) && ie.startsWith('20') && (soma(dig(ie), de(ie.length,2))*10%11)%10===+ie.at(-1),
  RO: ie => ie.length===14 && (11-soma(dig(ie), [6,5,4,3,2,...de(9,2)])%11)%10===+ie[13],
  RR: ie => ie.length===9 && ie.startsWith('24') && soma(dig(ie), [1,2,3,4,5,6,7,8])%9===+ie[8],
  RS: ie => ie.length===10 && confere(ie, [9, d=>m11(d, [2,...de(9,2)])]),
  SC: simples,
  SE: simples,
  SP: ie => {
    if (ie.length!==12) return false;
    const d1 = d => soma(d, [1,3,4,5,6,7,8,10])%11%10;
    /* comércio e indústria: dois dígitos; produtor rural (P-0MMMSSSSD.SSS, sem o P) confere só o primeiro */
    return confere(ie, [8, d1], [11, d=>soma(d, [3,2,...de(10,2)])%11%10]) || (ie[0]==='0' && confere(ie, [8, d1]));
  },
  TO: ie => {
    if (ie.length===9) return simples(ie);
    /* formato antigo: o 3º e o 4º dígitos (tipo de empresa) ficam fora do cálculo */
    return ie.length===11 && ['01','02','03','99'].includes(ie.slice(2,4)) && m11(dig(ie.slice(0,2)+ie.slice(4)), de(9,2))===+ie[10];
  }
};

/* ie só com números; uf em maiúsculas */
const ieValida = (ie, uf) => /^\d{8,14}$/.test(ie) && !!REGRAS[uf]?.(ie);

export { ieValida, REGRAS };
