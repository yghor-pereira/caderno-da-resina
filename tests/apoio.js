/* armazenamento em memória com a mesma interface do localStorage */
export const memoria = () => {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null };
};

/* cliente com a interface usada do supabase-js; `upsert(tabela, linhas)` decide a resposta;
   `aoBuscar(tabela, página)` roda depois de cada página (para simular alterações durante a busca) */
export function clienteFalso({ upsert, linhas = {}, aoBuscar } = {}) {
  const chamadas = [];
  return {
    chamadas,
    from(t) {
      return {
        upsert: async rows => { chamadas.push([t, rows]); return upsert ? upsert(t, rows) : { error: null }; },
        select() {
          const q = { filtro: () => true, n: Infinity };
          const b = {
            gte(_c, v) { q.filtro = r => r.updated_at >= v; return b; },
            /* entende só o filtro de depoisDe(): updated_at.gt."t",and(updated_at.eq."t",id.gt.id) */
            or(s) {
              const [, t, id] = s.match(/^updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."[^"]+",id\.gt\.([^)]+)\)$/);
              q.filtro = r => r.updated_at > t || (r.updated_at === t && r.id > id); return b;
            },
            order() { return b; },
            limit(n) { q.n = n; return b; },
            then(res, rej) {
              const ordem = (x, y) => x.updated_at < y.updated_at ? -1 : x.updated_at > y.updated_at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
              const todas = (linhas[t] || []).filter(q.filtro).sort(ordem).slice(0, q.n).map(r => ({ ...r }));
              const r = Promise.resolve({ data: todas, error: null });
              aoBuscar?.(t, todas);
              return r.then(res, rej);
            }
          };
          return b;
        }
      };
    }
  };
}
