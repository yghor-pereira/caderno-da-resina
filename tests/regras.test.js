import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { definirHoje } from '../js/util.js';
import { usarDados, tot, statusTalhoes, fluxo, saldoAtual, liqV, saldoV, pctRec, ramStats, talById, abaixoDoRecebido } from '../js/regras.js';
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

const base = extra => ({demo:false, regime:'funrural', saldoInicial:0, ideal:14, talhoes:[], estrias:[], producao:[], vendas:[], caixa:[], comp:[], compradores:{}, ...extra});

test('trocar o regime não altera o líquido de vendas já registradas', () => {
  const v = {id:'v1', data:'2026-10-01', comprador:'X', kg:100, preco:6, fator:0.9837, comNota:false, nf:null, recs:[{id:'r1', data:'2026-10-01', valor:590.22, forma:'Pix'}]};
  usarDados(base({regime:'folha', vendas:[v]}));
  assert.equal(liqV(v), 590.22);
  assert.equal(saldoV(v), 0);
});

test('venda sem kg não gera percentual inválido', () => {
  const v = {id:'v2', data:'2026-10-01', comprador:'X', kg:0, preco:6, fator:0.9837, recs:[]};
  usarDados(base({vendas:[v]}));
  assert.equal(liqV(v), 0);
  assert.equal(saldoV(v), 0);
  assert.equal(pctRec(v), 0);
});

test('estria e coleta ficam ligadas ao talhão pelo id, mesmo após renomear', () => {
  const r = {id:'r1', cod:'R-01', hist:[{data:'2026-08-01', arv:100, motivo:'Contagem inicial'}]};
  const t = {id:'t1', nome:'Talhão Novo Nome', ramais:[r]};
  usarDados(base({talhoes:[t],
    estrias:[{id:'e1', data:'2026-10-20', talhao:'t1', ramais:['r1'], qtd:100, resineiro:'João', dias:1}],
    producao:[{id:'p1', data:'2026-10-25', talhao:'t1', ramais:['r1'], kg:50}]}));
  const s = ramStats(t, r, 2026);
  assert.equal(s.ult, '2026-10-20');
  assert.equal(s.kg, 50);
  assert.equal(talById('t1'), t);
});

test('venda editada não pode ficar abaixo do que já foi recebido', () => {
  const v = {id:'v3', data:'2026-10-01', comprador:'X', kg:100, preco:6, fator:0.9837, recs:[{id:'r1', valor:300}, {id:'r2', valor:290.22}]};
  assert.equal(abaixoDoRecebido(v, 100, 6), false);       // 590,22 líquido = 590,22 recebido
  assert.equal(abaixoDoRecebido(v, 120, 6), false);
  assert.equal(abaixoDoRecebido(v, 99, 6), true);
  assert.equal(abaixoDoRecebido(v, 100, 5.99), true);
  assert.equal(abaixoDoRecebido({...v, recs:[]}, 1, 0.01), false);
});
