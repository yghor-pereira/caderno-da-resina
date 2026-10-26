import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definirHoje } from '../js/util.js';
import { exemplo } from '../js/exemplo.js';

definirHoje('2026-10-26');
const d = exemplo(11);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('toda venda do exemplo grava o fator do Funrural', () => {
  assert.ok(d.vendas.length > 0);
  for (const v of d.vendas) assert.equal(v.fator, 0.9837);
});

test('exemplo com regime folha usa o fator da folha', () => {
  for (const v of exemplo(11, null, 'folha').vendas) assert.equal(v.fator, 0.998);
});

test('estrias e coletas apontam para o id de um talhão existente', () => {
  const ids = new Set(d.talhoes.map(t => t.id));
  for (const x of [...d.estrias, ...d.producao]) assert.ok(ids.has(x.talhao), x.talhao);
});

test('todos os ids do exemplo são UUID', () => {
  const ids = [...d.talhoes.flatMap(t => [t.id, ...t.ramais.flatMap(r => [r.id, ...r.hist.map(h => h.id)])]), ...d.estrias.map(x => x.id),
    ...d.producao.map(x => x.id), ...d.vendas.flatMap(v => [v.id, ...v.recs.map(r => r.id)]), ...d.caixa.map(x => x.id), ...d.comp.map(x => x.id)];
  for (const id of ids) assert.match(id, UUID);
});

test('exemplo traz cadastro de compradores vazio, como uma fazenda nova', () => {
  assert.deepEqual(d.compradores, {});
});
