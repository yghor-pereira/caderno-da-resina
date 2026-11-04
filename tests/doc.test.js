import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soDig, mascaraDoc, cpfValido, cnpjValido, docValido } from '../js/doc.js';

test('CPF: dígitos verificadores', () => {
  for (const ok of ['123.456.789-09', '52998224725', '111.444.777-35']) assert.ok(cpfValido(ok), ok);
  for (const mau of ['123.456.789-00', '52998224724', '1234567890', '123456789091', '']) assert.ok(!cpfValido(mau), mau);
});

test('CPF e CNPJ com todos os dígitos iguais são recusados', () => {
  for (let d = 0; d <= 9; d++) {
    assert.ok(!cpfValido(String(d).repeat(11)), `cpf ${d}`);
    assert.ok(!cnpjValido(String(d).repeat(14)), `cnpj ${d}`);
  }
});

test('CNPJ: dígitos verificadores', () => {
  for (const ok of ['12.345.678/0001-95', '11222333000181', '11.444.777/0001-61']) assert.ok(cnpjValido(ok), ok);
  for (const mau of ['12.345.678/0001-96', '11222333000180', '1122233300018']) assert.ok(!cnpjValido(mau), mau);
});

test('docValido confere o tipo: PF só aceita CPF e PJ só aceita CNPJ', () => {
  assert.ok(docValido('52998224725', 'PF'));
  assert.ok(!docValido('11222333000181', 'PF'));
  assert.ok(docValido('11222333000181', 'PJ'));
  assert.ok(!docValido('52998224725', 'PJ'));
  assert.ok(docValido('52998224725') && docValido('11222333000181'));
});

test('máscara e só dígitos', () => {
  assert.equal(mascaraDoc('52998224725'), '529.982.247-25');
  assert.equal(mascaraDoc('11222333000181'), '11.222.333/0001-81');
  assert.equal(mascaraDoc('5299'), '529.9');
  assert.equal(soDig('11.222.333/0001-81'), '11222333000181');
});
