import { num, kfmt, esc } from './util.js';

/* ---------- gráficos SVG ---------- */
function niceMax(v){ if(!(v>0)) return 1; const p=10**Math.floor(Math.log10(v)); for(const m of [1,1.2,1.5,2,2.5,3,4,5,6,8,10]) if(m*p>=v*1.02) return m*p; return 10*p; }
function chart(o){
  const W=340, H=o.h||170, hasR=(o.lines||[]).some(l=>l.axis==='r'), pl=36, pr=hasR?36:10, pt=10, pb=22;
  const iw=W-pl-pr, ih=H-pt-pb, n=o.labels.length, bw=iw/Math.max(n,1);
  const ax = side => {
    const v=[...(side==='l'?(o.bars||[]).flatMap(b=>b.vals):[]), ...(o.lines||[]).filter(l=>(l.axis||'l')===side).flatMap(l=>l.vals), ...(o.refs||[]).filter(r=>(r.axis||'l')===side).map(r=>r.v)].filter(x=>x!=null&&isFinite(x));
    const mx=niceMax(Math.max(0,...v)), mn=Math.min(0,...v)<0? -niceMax(-Math.min(...v)) : 0;
    return {mn,mx,y:x=>pt+ih*(1-(x-mn)/(mx-mn||1))};
  };
  const L=ax('l'), R=hasR?ax('r'):null;
  let g='';
  for(let i=0;i<=3;i++){ const yy=pt+ih*i/3, vl=L.mx-(L.mx-L.mn)*i/3;
    g+=`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}"/><text x="${pl-4}" y="${yy+3}" text-anchor="end">${(o.fmtL||kfmt)(vl)}</text>`;
    if(R){ const vr=R.mx-(R.mx-R.mn)*i/3; g+=`<text x="${W-pr+4}" y="${yy+3}">${(o.fmtR||kfmt)(vr)}</text>`; } }
  if(L.mn<0) g+=`<line x1="${pl}" x2="${W-pr}" y1="${L.y(0)}" y2="${L.y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
  const bars=o.bars||[], k=bars.length, gw=bw*(k>1?0.78:0.62);
  bars.forEach((b,j)=>b.vals.forEach((v,i)=>{ if(v==null) return;
    const x=pl+i*bw+(bw-gw)/2+j*gw/k, y0=L.y(0), y1=L.y(v);
    g+=`<rect x="${x.toFixed(1)}" y="${Math.min(y0,y1).toFixed(1)}" width="${(gw/k-1).toFixed(1)}" height="${Math.max(Math.abs(y0-y1),v?1:0).toFixed(1)}" rx="2" fill="${(b.cols&&b.cols[i])||b.color}"/>`; }));
  (o.refs||[]).forEach(r=>{ const A=r.axis==='r'?R:L, yy=A.y(r.v);
    g+=`<line x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}" stroke="${r.color}" stroke-width="1.5" stroke-dasharray="5 4"/>`; });
  (o.lines||[]).forEach(l=>{ const A=l.axis==='r'?R:L; let d='', pen=false;
    l.vals.forEach((v,i)=>{ if(v==null){pen=false;return;} const x=pl+i*bw+bw/2, y=A.y(v); d+=(pen?'L':'M')+x.toFixed(1)+' '+y.toFixed(1); pen=true; });
    g+=`<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2.2" ${l.dash?'stroke-dasharray="4 3"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if(l.dots) l.vals.forEach((v,i)=>{ if(v!=null) g+=`<circle cx="${(pl+i*bw+bw/2).toFixed(1)}" cy="${A.y(v).toFixed(1)}" r="3" fill="var(--surface)" stroke="${l.color}" stroke-width="2"/>`; }); });
  const step=Math.ceil(n/12);
  o.labels.forEach((t,i)=>{ if(i%step===0) g+=`<text x="${(pl+i*bw+bw/2).toFixed(1)}" y="${H-6}" text-anchor="middle">${esc(t)}</text>`; });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title||'')}">${g}</svg>`;
}
const legend = items => `<div class="legend">${items.map(i=>`<span class="${i.ln?'ln':''} ${i.dash?'dash':''}" style="--c:${i.c}">${i.t}</span>`).join('')}</div>`;
const delta = d => `<span class="d ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} ${num(Math.abs(d),1)}%</span>`;

export { niceMax, chart, legend, delta };
