/* armazenamento em memória com a mesma interface do localStorage */
export const memoria = () => {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

/* cliente com a interface usada do supabase-js; `upsert(tabela, linhas)` decide a resposta */
export function clienteFalso({ upsert, linhas = {} } = {}) {
  const chamadas = [];
  return {
    chamadas,
    from(t) {
      return {
        upsert: async rows => { chamadas.push([t, rows]); return upsert ? upsert(t, rows) : { error: null }; },
        select() {
          const q = { gt: null, a: 0, b: 999 };
          const b = {
            gt(_c, v) { q.gt = v; return b; },
            order() { return b; },
            range(a, z) { q.a = a; q.b = z; return b; },
            then(res, rej) {
              const todas = (linhas[t] || []).filter(r => !q.gt || r.updated_at > q.gt);
              return Promise.resolve({ data: todas.slice(q.a, q.b + 1), error: null }).then(res, rej);
            }
          };
          return b;
        }
      };
    }
  };
}
