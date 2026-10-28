import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar, cabecalhos } from '../supabase/functions/admin-acoes/regras.js';

const eu = '11111111-1111-4111-8111-111111111111', outro = '22222222-2222-4222-8222-222222222222';

test('ação administrativa exige ação conhecida, usuário válido e motivo', () => {
  assert.equal(validar({ acao: 'bloquear', alvo: outro, motivo: 'Uso indevido' }, eu), null);
  assert.equal(validar({ acao: 'desbloquear', alvo: outro, motivo: 'Resolvido' }, eu), null);
  assert.equal(validar({ acao: 'apagar', alvo: outro, motivo: 'x x x' }, eu), 'Ação desconhecida.');
  assert.equal(validar({ acao: 'bloquear', alvo: 'abc', motivo: 'Uso indevido' }, eu), 'Usuário inválido.');
  assert.equal(validar({ acao: 'bloquear', alvo: outro, motivo: '  ' }, eu), 'Informe o motivo.');
  assert.equal(validar({ acao: 'bloquear', alvo: eu, motivo: 'Teste' }, eu), 'Você não pode fazer isso na sua própria conta.');
  assert.equal(validar(null, eu), 'Ação desconhecida.');
});

test('a função só libera o navegador para o endereço do app', () => {
  assert.equal(cabecalhos('https://yghor-pereira.github.io')['Access-Control-Allow-Origin'], 'https://yghor-pereira.github.io');
  assert.equal(cabecalhos('https://site-qualquer.com')['Access-Control-Allow-Origin'], 'https://yghor-pereira.github.io');
});
