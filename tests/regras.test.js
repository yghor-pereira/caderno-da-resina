import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { definirHoje } from '../js/util.js';
import { usarDados, tot, statusTalhoes, fluxo, saldoAtual } from '../js/regras.js';
import { exemplo } from '../js/exemplo.js';

beforeEach(() => { definirHoje('2026-10-26'); usarDados(exemplo(11)); });

test('safra atual do exemplo tem produção e preço livre com Funrural', () => {
  const T = tot(2026);
  assert.ok(T.kgProd > 0);
  assert.ok(Math.abs(T.precoLivre - T.precoMedio * 0.9837) < 0.01);
});

test('Talhão C do exemplo está com estria atrasada', () => {
  assert.ok(statusTalhoes()[2].atraso > 0);
});

test('fluxo projeta 6 meses e saldo atual é finito', () => {
  assert.equal(fluxo(6).length, 6);
  assert.ok(Number.isFinite(saldoAtual()));
});
