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

test('senha temporária: 3 grupos de 4, sem caracteres parecidos, e diferente a cada vez', async () => {
  const { senhaTemporaria } = await import('../supabase/functions/admin-acoes/regras.js');
  const a = senhaTemporaria(), b = senhaTemporaria();
  assert.match(a, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  assert.notEqual(a, b);
  assert.equal(validar({ acao: 'senha_temporaria', alvo: outro, motivo: 'Esqueceu a senha' }, eu), null);
  // bytes de 248 a 255 são descartados (sem viés): só o 0 seguido de zeros vira "a"
  assert.equal(senhaTemporaria(n => new Uint8Array(n).fill(255).map((v, i) => i % 2 ? 0 : v)), 'aaaa-aaaa-aaaa');
});
