import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural } from '../js/util.js';

test('plural usa o singular só para 1', () => {
  assert.equal(plural(1, 'ramal', 'ramais'), '1 ramal');
  assert.equal(plural(3, 'ramal', 'ramais'), '3 ramais');
  assert.equal(plural(0, 'talhão', 'talhões'), '0 talhões');
  assert.equal(plural(1, 'dia', 'dias'), '1 dia');
  assert.equal(plural(1234, 'árvore', 'árvores'), '1.234 árvores');
});
