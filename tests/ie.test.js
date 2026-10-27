import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ieValida, REGRAS } from '../js/ie.js';
import { UFS } from '../js/nfe.js';

/* exemplos publicados pelo Sintegra (só os números) */
const VALIDAS = {
  AC: ['0100482300112'], AL: ['240000048'], AP: ['030123459'], BA: ['12345663', '100000306'], CE: ['060000015'],
  DF: ['0730000100109'], GO: ['109876547'], MA: ['120000385'], MG: ['0623079040081'], MT: ['00130000019'],
  PA: ['159999995'], PB: ['060000015'], PE: ['032141840', '18100100000049'], PI: ['012345679'], PR: ['1234567850'],
  RJ: ['99999993'], RN: ['200400401', '2000400400'], RO: ['00000000625213'], RR: ['240066281'], RS: ['2243658792'],
  SC: ['251040852'], SE: ['271234563'], SP: ['110042490114', '011004243002'], TO: ['29010227836']
};

test('todas as UFs têm regra', () => {
  assert.deepEqual(UFS.filter(uf => !REGRAS[uf]), []);
});

test('aceita as Inscrições Estaduais de exemplo do Sintegra', () => {
  for (const [uf, ies] of Object.entries(VALIDAS))
    for (const ie of ies) assert.ok(ieValida(ie, uf), `${uf} ${ie}`);
});

test('recusa a mesma IE com o último dígito trocado', () => {
  for (const [uf, ies] of Object.entries(VALIDAS))
    for (const ie of ies.filter(x => x !== '011004243002')) {   // produtor rural de SP: os 3 últimos são sequência
      const errada = ie.slice(0, -1) + ((+ie.at(-1) + 1) % 10);
      assert.equal(ieValida(errada, uf), false, `${uf} ${errada}`);
    }
});

test('recusa IE de outra UF, tamanho errado e letras', () => {
  assert.equal(ieValida('251040852', 'PR'), false);
  assert.equal(ieValida('1234567850', 'SC'), false);
  assert.equal(ieValida('25104085', 'SC'), false);
  assert.equal(ieValida('25104085X', 'SC'), false);
  assert.equal(ieValida('', 'SC'), false);
  assert.equal(ieValida('251040852', 'XX'), false);
});

test('primeiro dígito do PR e de MG também é conferido', () => {
  assert.equal(ieValida('1234567950', 'PR'), false);
  assert.equal(ieValida('0623079040071', 'MG'), false);
  assert.equal(ieValida('011004244002', 'SP'), false);
});
