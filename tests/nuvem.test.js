import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoria, clienteFalso } from './apoio.js';
import { abrir, gravar, pendentes, ativas } from '../js/local.js';
import { criarNuvem } from '../js/nuvem.js';

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
