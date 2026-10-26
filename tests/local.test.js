import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { abrir, gravar, excluir, mesclar, pendentes, tirarDaFila, marcarErro, ativas, erros, ultimoUsuario, definirUltimo } from '../js/local.js';

const faz = (id, extra) => ({ id, nome: 'Fazenda', ie: '12345678', uf: 'PR', ...extra });

test('gravação sobrevive a fechar e reabrir o app antes de sincronizar', () => {
  const arm = memoria();
  gravar(abrir('u1', arm), 'fazendas', faz('f1'));
  const L = abrir('u1', arm);
  assert.equal(L.linhas.fazendas.f1.nome, 'Fazenda');
  assert.deepEqual(L.fila, [['fazendas', 'f1']]);
});

test('gravar o mesmo registro duas vezes deixa um item na fila', () => {
  const L = abrir('u1', memoria());
  gravar(L, 'fazendas', faz('f1'));
  gravar(L, 'fazendas', { id: 'f1', nome: 'Outro nome' });
  assert.equal(pendentes(L), 1);
  assert.equal(L.linhas.fazendas.f1.nome, 'Outro nome');
  assert.equal(L.linhas.fazendas.f1.ie, '12345678');
});

test('alteração local ainda não enviada vence a versão que chega do servidor', () => {
  const L = abrir('u1', memoria());
  gravar(L, 'fazendas', faz('f1', { nome: 'Local' }));
  mesclar(L, 'fazendas', [faz('f1', { nome: 'Servidor', updated_at: '2026-10-26T10:00:00Z' }),
                         faz('f2', { nome: 'Nova', updated_at: '2026-10-26T11:00:00Z' })]);
  assert.equal(L.linhas.fazendas.f1.nome, 'Local');
  assert.equal(L.linhas.fazendas.f2.nome, 'Nova');
  assert.equal(L.cursor.fazendas, '2026-10-26T11:00:00Z');
});

test('depois de enviado, o registro passa a aceitar a versão do servidor', () => {
  const L = abrir('u1', memoria());
  gravar(L, 'fazendas', faz('f1', { nome: 'Local' }));
  tirarDaFila(L, 'fazendas', ['f1']);
  mesclar(L, 'fazendas', [faz('f1', { nome: 'Servidor', updated_at: '2026-10-26T10:00:00Z' })]);
  assert.equal(L.linhas.fazendas.f1.nome, 'Servidor');
  assert.equal(pendentes(L), 0);
});

test('excluir marca deleted_at, enfileira e some das linhas ativas', () => {
  const L = abrir('u1', memoria());
  gravar(L, 'fazendas', faz('f1')); tirarDaFila(L, 'fazendas', ['f1']);
  excluir(L, 'fazendas', 'f1');
  assert.ok(L.linhas.fazendas.f1.deleted_at);
  assert.equal(pendentes(L), 1);
  assert.deepEqual(ativas(L, 'fazendas'), []);
});

test('erro de dado tira da fila e fica visível; gravar de novo limpa o erro', () => {
  const L = abrir('u1', memoria());
  gravar(L, 'fazendas', faz('f1'));
  marcarErro(L, 'fazendas', 'f1', 'IE repetida');
  assert.equal(pendentes(L), 0);
  assert.deepEqual(erros(L).map(e => [e.tabela, e.linha.id, e.linha._erro]), [['fazendas', 'f1', 'IE repetida']]);
  gravar(L, 'fazendas', { id: 'f1', ie: '87654321' });
  assert.equal(L.linhas.fazendas.f1._erro, undefined);
  assert.equal(pendentes(L), 1);
});

test('cada usuário tem seu próprio cache no mesmo aparelho', () => {
  const arm = memoria();
  gravar(abrir('A', arm), 'fazendas', faz('fa'));
  assert.deepEqual(abrir('B', arm).linhas, {});
  assert.ok(abrir('A', arm).linhas.fazendas.fa);
  definirUltimo('A', arm);
  assert.equal(ultimoUsuario(arm), 'A');
});
