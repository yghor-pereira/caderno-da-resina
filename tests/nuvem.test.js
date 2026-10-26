import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoria, clienteFalso } from './apoio.js';
import { abrir, gravar, pendentes, ativas } from '../js/local.js';
import { criarNuvem, classificarSessao } from '../js/nuvem.js';

const novoL = () => abrir('user-1', memoria());

test('envia a fila em ordem de dependência e esvazia a fila', async () => {
  const L = novoL();
  gravar(L, 'vendas', { id: 'v1', fazenda_id: 'f1', kg: 10 });
  gravar(L, 'fazendas', { id: 'f1', nome: 'F', ie: '12345678', uf: 'PR', updated_at: '2026-01-01T00:00:00Z' });
  gravar(L, 'recebimentos', { id: 'r1', venda_id: 'v1', valor: 5 });
  const c = clienteFalso();
  const r = await criarNuvem(c, L).enviar();
  assert.deepEqual(c.chamadas.map(([t]) => t), ['fazendas', 'vendas', 'recebimentos']);
  assert.equal(pendentes(L), 0);
  assert.equal(r.offline, false);
  const [, [faz]] = c.chamadas[0];
  assert.equal(faz.updated_at, undefined);
  assert.equal(faz.user_id, 'user-1');
});

test('perfil é enviado sem user_id (a chave é o próprio id)', async () => {
  const L = novoL();
  gravar(L, 'perfis', { id: 'user-1', nome: 'Yghor', modulos: { caixa: true } });
  const c = clienteFalso();
  await criarNuvem(c, L).enviar();
  assert.equal(c.chamadas[0][1][0].user_id, undefined);
});

test('sem conexão, a fila fica intacta', async () => {
  for (const upsert of [async () => { throw new TypeError('Failed to fetch'); },
                        async () => ({ error: { message: 'TypeError: Failed to fetch', code: '' } })]) {
    const L = novoL();
    gravar(L, 'fazendas', { id: 'f1', nome: 'F', ie: '12345678', uf: 'PR' });
    const r = await criarNuvem(clienteFalso({ upsert }), L).enviar();
    assert.equal(r.offline, true);
    assert.equal(pendentes(L), 1);
  }
});

test('IE já usada em outra conta: a fazenda fica com erro e o resto segue', async () => {
  const L = novoL();
  gravar(L, 'fazendas', { id: 'f1', nome: 'Repetida', ie: '111', uf: 'PR' });
  gravar(L, 'fazendas', { id: 'f2', nome: 'Boa', ie: '222', uf: 'PR' });
  gravar(L, 'talhoes', { id: 't1', fazenda_id: 'f2', nome: 'A' });
  const upsert = async (t, rows) => rows.some(r => r.ie === '111') ? { error: { code: '23505', message: 'duplicate key value' } } : { error: null };
  const c = clienteFalso({ upsert });
  const r = await criarNuvem(c, L).enviar();
  assert.equal(L.linhas.fazendas.f1._erro, 'Esta Inscrição Estadual já está cadastrada em outra conta.');
  assert.equal(L.linhas.fazendas.f2._erro, undefined);
  assert.equal(pendentes(L), 0);
  assert.ok(c.chamadas.some(([t, rows]) => t === 'talhoes' && rows[0].id === 't1'));
  assert.equal(r.erros, 1);
});

test('busca em páginas de 1000 e avança o cursor', async () => {
  const L = novoL();
  const linhas = { fazendas: Array.from({ length: 1003 }, (_, i) => ({ id: 'f' + i, nome: 'F', updated_at: `2026-10-26T10:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(4, '0')}Z` })) };
  const r = await criarNuvem(clienteFalso({ linhas }), L).buscar();
  assert.equal(r.mudou, 1003);
  assert.equal(ativas(L, 'fazendas').length, 1003);
  assert.equal(L.cursor.fazendas, linhas.fazendas.map(f => f.updated_at).sort().at(-1));
});

test('erro de formato do PostgREST marca o registro em vez de tentar para sempre', async () => {
  const L = novoL();
  gravar(L, 'talhoes', { id: 't1', fazenda_id: 'f1', nome: 'A', coluna_que_nao_existe: 1 });
  const upsert = async () => ({ error: { code: 'PGRST204', message: "Could not find the 'coluna_que_nao_existe' column" } });
  const r = await criarNuvem(clienteFalso({ upsert }), L).enviar();
  assert.equal(r.offline, false);
  assert.equal(pendentes(L), 0);
  assert.match(L.linhas.talhoes.t1._erro, /coluna_que_nao_existe/);
});

test('registro cujo pai ainda não chegou ao banco espera na fila (não vira erro)', async () => {
  const L = novoL();
  gravar(L, 'fazendas', { id: 'f1', nome: 'Repetida', ie: '111', uf: 'PR' });
  gravar(L, 'talhoes', { id: 't1', fazenda_id: 'f1', nome: 'A' });
  const upsert = async (t, rows) => t === 'fazendas' ? { error: { code: '23505', message: 'duplicate' } }
    : t === 'talhoes' ? { error: { code: '23503', message: 'violates foreign key constraint' } } : { error: null };
  await criarNuvem(clienteFalso({ upsert }), L).enviar();
  assert.equal(L.linhas.talhoes.t1._erro, undefined);
  assert.deepEqual(L.fila, [['talhoes', 't1']]);
  // corrigida a IE, a fazenda e o talhão sobem juntos
  gravar(L, 'fazendas', { id: 'f1', ie: '222' });
  const c = clienteFalso();
  await criarNuvem(c, L).enviar();
  assert.deepEqual(c.chamadas.map(([t]) => t), ['fazendas', 'talhoes']);
  assert.equal(pendentes(L), 0);
});

test('depois de sincronizar, registros apagados já enviados saem do aparelho', async () => {
  const L = novoL();
  gravar(L, 'talhoes', { id: 't1', fazenda_id: 'f1', nome: 'A' });
  gravar(L, 'talhoes', { id: 't2', fazenda_id: 'f1', nome: 'B', deleted_at: '2026-10-26T00:00:00Z' });
  const linhas = { talhoes: [{ id: 't3', nome: 'C', deleted_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T01:00:00Z' }] };
  await criarNuvem(clienteFalso({ linhas }), L).sincronizar();
  assert.deepEqual(Object.keys(L.linhas.talhoes).sort(), ['t1']);
});

test('edição feita enquanto o registro está sendo enviado não se perde', async () => {
  const L = novoL();
  gravar(L, 'vendas', { id: 'v1', fazenda_id: 'f1', kg: 10, nf: null });
  let liberar; const espera = new Promise(r => { liberar = r; });
  const servidor = {};
  const c = clienteFalso({ upsert: async (t, rows) => { const copia = structuredClone(rows); await espera; for (const r of copia) servidor[r.id] = r; return { error: null }; } });
  const envio = criarNuvem(c, L).enviar();
  gravar(L, 'vendas', { id: 'v1', nf: { numero: 1 } });   // NF-e emitida durante o envio
  liberar(); await envio;
  assert.deepEqual(L.fila, [['vendas', 'v1']]);
  assert.deepEqual(L.linhas.vendas.v1.nf, { numero: 1 });
  await criarNuvem(c, L).enviar();
  assert.deepEqual(servidor.v1.nf, { numero: 1 });
  assert.equal(pendentes(L), 0);
});

test('sessão vencida no envio um a um não marca erro nem tira da fila', async () => {
  const L = novoL();
  gravar(L, 'talhoes', { id: 't1', fazenda_id: 'f1', nome: 'A' });
  gravar(L, 'talhoes', { id: 't2', fazenda_id: 'f1', nome: 'B' });
  let n = 0;
  const upsert = async () => (++n === 1 ? { error: { code: '23514', message: 'lote' } } : { error: { code: 'PGRST303', message: 'JWT expired' } });
  const r = await criarNuvem(clienteFalso({ upsert }), L).enviar();
  assert.equal(r.sessao, false);
  assert.equal(pendentes(L), 2);
  assert.equal(L.linhas.talhoes.t1._erro, undefined);
});

test('busca que falha por erro de dado não conta como sincronização bem-sucedida', async () => {
  const L = novoL();
  const c = clienteFalso();
  c.from = () => ({ select: () => { const b = { gt: () => b, order: () => b, range: () => b, then: (res) => Promise.resolve({ data: null, error: { code: '42P01', message: 'tabela' } }).then(res) }; return b; } });
  const r = await criarNuvem(c, L).sincronizar();
  assert.equal(r.ok, false);
});

test('se a sessão trocou de usuário, a sincronização para sem gravar no cache antigo', async () => {
  const L = novoL();
  gravar(L, 'fazendas', { id: 'f1', nome: 'F', ie: '12345678', uf: 'PR' });
  let ativo = true;
  const linhas = { fazendas: [{ id: 'fB', nome: 'Do outro', updated_at: '2026-10-26T10:00:00Z' }] };
  const c = clienteFalso({ linhas, upsert: async () => { ativo = false; return { error: null }; } });
  await criarNuvem(c, L, { ativo: () => ativo }).sincronizar();
  assert.equal(L.linhas.fazendas.fB, undefined);
});

test('classificarSessao separa sessão válida, sem rede e sem sessão', () => {
  assert.equal(classificarSessao({ data: { session: { user: { id: 'u' } } }, error: null }), 'ok');
  assert.equal(classificarSessao({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }), 'offline');
  assert.equal(classificarSessao({ data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } }), 'nenhuma');
  assert.equal(classificarSessao({ data: { session: null }, error: null }), 'nenhuma');
});
