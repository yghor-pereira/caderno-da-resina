import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTROS_PADRAO, filtrar, ordenar, duracao, quando, rotulo } from '../js/admin-lista.js';
import { CATALOGO } from '../js/metricas.js';
import { NOMES_TELA, NOMES_TABELA, NOMES_FUNCAO } from '../js/admin-lista.js';

const AGORA = Date.parse('2026-10-28T12:00:00Z'), dias = n => new Date(AGORA - n * 864e5).toISOString();
const U = [
  { id: '1', nome: 'João Resineiro', email: 'joao@x.com', criado_em: dias(100), ultimo_acesso: dias(2), sessoes: 10, segundos: 6000, bloqueado: false },
  { id: '2', nome: 'Maria', email: 'maria@x.com', criado_em: dias(5), ultimo_login: dias(40), sessoes: 1, segundos: 60, bloqueado: true },
  { id: '3', nome: 'Exemplo', email: 'produtor@exemplo.com', criado_em: dias(200), ultimo_acesso: dias(0), sessoes: 50, segundos: 90000, is_demo: true },
  { id: '4', nome: 'Zé', email: 'ze@x.com', criado_em: dias(20), sessoes: 0, segundos: 0, bloqueado: false }
];
const ids = l => l.map(u => u.id);
const f = extra => ({ ...FILTROS_PADRAO, ...extra });

test('conta de exemplo fica fora da lista por padrão', () => {
  assert.deepEqual(ids(filtrar(U, f(), AGORA)), ['1', '2', '4']);
  assert.deepEqual(ids(filtrar(U, f({ demo: true }), AGORA)), ['1', '2', '3', '4']);
});

test('busca por nome ou e-mail, sem diferenciar acento e maiúscula', () => {
  assert.deepEqual(ids(filtrar(U, f({ busca: 'joao' }), AGORA)), ['1']);
  assert.deepEqual(ids(filtrar(U, f({ busca: 'MARIA@' }), AGORA)), ['2']);
});

test('filtros de situação, cadastro e último acesso (sem métrica, vale o último login)', () => {
  assert.deepEqual(ids(filtrar(U, f({ status: 'bloqueados' }), AGORA)), ['2']);
  assert.deepEqual(ids(filtrar(U, f({ cadastro: '30' }), AGORA)), ['2', '4']);
  assert.deepEqual(ids(filtrar(U, f({ acesso: '7' }), AGORA)), ['1']);
  assert.deepEqual(ids(filtrar(U, f({ acesso: 'inativos' }), AGORA)), ['2', '4']);
  assert.deepEqual(ids(filtrar(U, f({ acesso: 'nunca' }), AGORA)), ['4']);
});

test('ordenação', () => {
  assert.deepEqual(ids(ordenar(U, 'acesso')), ['3', '1', '2', '4']);
  assert.deepEqual(ids(ordenar(U, 'tempo')), ['3', '1', '2', '4']);
  assert.deepEqual(ids(ordenar(U, 'nome')), ['3', '1', '2', '4']);
  assert.deepEqual(ids(ordenar(U, 'cadastro')), ['2', '4', '1', '3']);
});

test('durações e datas relativas', () => {
  assert.equal(duracao(0), '0 min');
  assert.equal(duracao(2700), '45 min');
  assert.equal(duracao(7500), '2 h 05 min');
  assert.equal(quando(null, AGORA), 'nunca');
  assert.equal(quando(dias(0.5), AGORA), 'hoje');
  assert.equal(quando(dias(1), AGORA), 'ontem');
  assert.equal(quando(dias(1), AGORA + 864e5), 'há 2 dias');
});

test('todo item do catálogo de métricas tem nome legível', () => {
  assert.deepEqual(CATALOGO.telas.filter(t => !NOMES_TELA[t]), []);
  assert.deepEqual(CATALOGO.tabelas.filter(t => !NOMES_TABELA[t]), []);
  assert.deepEqual(CATALOGO.funcoes.filter(t => !NOMES_FUNCAO[t]), []);
  assert.equal(rotulo('page_view', 'floresta:apontar'), 'Abriu Floresta · apontar');
  assert.equal(rotulo('record_created', 'estrias'), 'Criou estria');
  assert.equal(rotulo('feature_used', 'nfe_emitida'), 'Emitiu NF-e');
});
