import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { definirHoje } from '../js/util.js';
import { usarDados, tot, statusTalhoes, saldoAtual } from '../js/regras.js';
import { exemplo } from '../js/exemplo.js';
import { abrir, gravar, excluir } from '../js/local.js';
import { montarDados, dadosParaLinhas, linha, linhasDaFazenda, linhasDoTalhao, fazendasDe } from '../js/mapa.js';

const FID = '00000000-0000-4000-8000-000000000001';
let ex, L;
beforeEach(() => {
  definirHoje('2026-10-26');
  ex = exemplo(11);
  L = abrir('u1', memoria());
  gravar(L, 'fazendas', linha.fazenda({ id: FID, nome: 'Capão Alto', ie: '254123987', doc: '', municipio: 'Itaiópolis', uf: 'SC' }, ex));
  for (const [tabela, linhas] of Object.entries(dadosParaLinhas(ex, FID))) for (const l of linhas) gravar(L, tabela, l);
});

test('ida e volta: tabelas remontam os mesmos dados do exemplo', () => {
  const S = montarDados(L, FID);
  assert.equal(S.talhoes.length, ex.talhoes.length);
  assert.deepEqual(S.talhoes.map(t => t.ramais.length), ex.talhoes.map(t => t.ramais.length));
  for (const k of ['estrias', 'producao', 'vendas', 'caixa', 'comp']) assert.equal(S[k].length, ex[k].length, k);
  assert.equal(S.vendas.flatMap(v => v.recs).length, ex.vendas.flatMap(v => v.recs).length);
  assert.equal(S.regime, 'funrural'); assert.equal(S.ideal, 14); assert.equal(S.saldoInicial, 9000); assert.equal(S.demo, true);
  usarDados(ex); const a = [tot(2026), tot(2025), statusTalhoes().map(s => s.atraso), saldoAtual()];
  usarDados(S); const b = [tot(2026), tot(2025), statusTalhoes().map(s => s.atraso), saldoAtual()];
  assert.deepEqual(b, a);
});

test('colunas no formato do banco', () => {
  const l = dadosParaLinhas(ex, FID);
  assert.deepEqual(Object.keys(l.vendas[0]).sort(), ['com_nota', 'comprador', 'data', 'fator', 'fazenda_id', 'id', 'kg', 'nf', 'preco', 'venc']);
  assert.deepEqual(Object.keys(l.lancamentos[0]).sort(), ['cat', 'data', 'descr', 'fazenda_id', 'id', 'tipo', 'valor']);
  assert.deepEqual(Object.keys(l.contagens[0]).sort(), ['arvores', 'data', 'id', 'motivo', 'ramal_id']);
  assert.deepEqual(Object.keys(l.estrias[0]).sort(), ['data', 'dias', 'fazenda_id', 'id', 'qtd', 'ramais', 'resineiro', 'talhao_id']);
});

test('excluir um talhão esconde seus ramais, estrias e coletas', () => {
  const t = ex.talhoes[0];
  excluir(L, 'talhoes', t.id);
  const S = montarDados(L, FID);
  assert.ok(!S.talhoes.some(x => x.id === t.id));
  assert.ok(!S.estrias.some(e => e.talhao === t.id));
  assert.ok(!S.producao.some(p => p.talhao === t.id));
});

test('excluir uma venda esconde seus recebimentos', () => {
  const v = ex.vendas.find(x => x.recs.length);
  excluir(L, 'vendas', v.id);
  assert.ok(!montarDados(L, FID).vendas.some(x => x.id === v.id));
});

test('ramais e talhões aparecem em ordem de código e nome', () => {
  const S = montarDados(L, FID);
  assert.deepEqual(S.talhoes.map(t => t.nome), ['Talhão A', 'Talhão B', 'Talhão C']);
  assert.deepEqual(S.talhoes[0].ramais.slice(0, 3).map(r => r.cod), ['R-01', 'R-02', 'R-03']);
});

test('linhasDaFazenda reúne todos os registros da fazenda, sem a própria fazenda', () => {
  const total = Object.values(dadosParaLinhas(ex, FID)).reduce((n, l) => n + l.length, 0);
  const itens = linhasDaFazenda(L, FID);
  assert.equal(itens.length, total);
  assert.ok(!itens.some(([t]) => t === 'fazendas'));
});

test('linhasDoTalhao reúne o talhão, seus ramais, contagens, estrias e coletas', () => {
  const t = ex.talhoes[0];
  const itens = linhasDoTalhao(L, t.id);
  const conta = tab => itens.filter(([x]) => x === tab).length;
  assert.equal(conta('talhoes'), 1);
  assert.equal(conta('ramais'), t.ramais.length);
  assert.equal(conta('contagens'), t.ramais.reduce((n, r) => n + r.hist.length, 0));
  assert.equal(conta('estrias'), ex.estrias.filter(e => e.talhao === t.id).length);
  assert.equal(conta('coletas'), ex.producao.filter(p => p.talhao === t.id).length);
});

test('fazendasDe lista as fazendas ativas com seus dados montados', () => {
  const fs = fazendasDe(L);
  assert.equal(fs.length, 1);
  assert.equal(fs[0].nome, 'Capão Alto');
  assert.equal(fs[0].dados.talhoes.length, 3);
  excluir(L, 'fazendas', FID);
  assert.deepEqual(fazendasDe(L), []);
});
