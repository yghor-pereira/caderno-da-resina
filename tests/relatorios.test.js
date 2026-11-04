import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { definirHoje, sum } from '../js/util.js';
import { usarDados, tot } from '../js/regras.js';
import { exemplo } from '../js/exemplo.js';
import { abrir, gravar, gravarLote } from '../js/local.js';
import { montarDados, dadosParaLinhas, linha } from '../js/mapa.js';
import { movimentos, resumir, porEntidade, porFazenda, producaoMensal, matrizVendas, somaMatriz, resina, periodo, partes, mesesDe } from '../js/relatorios.js';

const F1 = '00000000-0000-4000-8000-0000000000f1', F2 = '00000000-0000-4000-8000-0000000000f2';
const CPF = '00000000-0000-4000-8000-00000000ecpf', CNPJ = '00000000-0000-4000-8000-0000000ecnpj';
const ENTS = [{ id: CPF }, { id: CNPJ }], FAZS = [{ id: F1 }, { id: F2 }];
let L;
const SAFRA = periodo('safra', 2025), ANO = periodo('ano', 2026);
beforeEach(() => {
  definirHoje('2026-10-26');
  L = abrir('u1', memoria());
  const itens = [
    ['entidades_fiscais', linha.entidade({ id: CPF, tipo: 'PF', nome: 'João', cor: '#2f6b4f', regime: 'PF_ATIVIDADE_RURAL', padrao: true })],
    ['entidades_fiscais', linha.entidade({ id: CNPJ, tipo: 'PJ', nome: 'Resinas', cor: '#b5722d', regime: 'SIMPLES' })]];
  const ex1 = exemplo(11), ex2 = exemplo(23);
  ex1.vendas.forEach((v, i) => { v.entidade = i % 2 ? CNPJ : CPF; });
  ex1.caixa.forEach((x, i) => { x.entidade = i % 3 ? CPF : CNPJ; });
  ex2.vendas.forEach(v => { v.entidade = CNPJ; }); ex2.caixa.forEach(x => { x.entidade = CNPJ; });
  for (const [fid, ex] of [[F1, ex1], [F2, ex2]]) {
    itens.push(['fazendas', linha.fazenda({ id: fid, nome: fid, uf: 'SC' }, ex)]);
    for (const [t, ls] of Object.entries(dadosParaLinhas(ex, fid))) for (const l of ls) itens.push([t, l]);
  }
  itens.push(['lancamentos', linha.lancamento({ id: 'contador', data: '2026-03-10', tipo: 'd', cat: 'Outros', desc: 'Contador', valor: 350, entidade: CNPJ, fazenda: null })]);
  gravarLote(L, itens);
});
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} ≠ ${b}`);

test('a soma por CPF/CNPJ e a soma por fazenda (com o Geral) são iguais ao consolidado, nas duas bases', () => {
  const d = montarDados(L);
  for (const base of ['competencia', 'caixa']) for (const p of [SAFRA, ANO]) {
    const ms = movimentos(d, { ...p, base }), t = resumir(ms);
    assert.ok(t.receita > 0 && t.desp > 0, `${base}: tem movimento`);
    for (const linhas of [porEntidade(ms, ENTS), porFazenda(ms, FAZS)])
      for (const k of ['receita', 'desp', 'res']) perto(sum(linhas, r => r[k]), t[k], `${base} ${p.de} ${k}`);
  }
});

test('na base de competência o relatório bate com o Resultado da safra', () => {
  const d = montarDados(L); usarDados(d);
  const T = tot(2025), t = resumir(movimentos(d, { ...SAFRA, base: 'competencia' }));
  perto(t.receita, T.receita, 'receita');
  perto(t.desp, T.desp, 'despesa');
});

test('o filtro de CPF/CNPJ dá a mesma linha que o relatório por CPF/CNPJ', () => {
  const todos = porEntidade(movimentos(montarDados(L), { ...SAFRA, base: 'competencia' }), ENTS);
  for (const e of ENTS) {
    const so = resumir(movimentos(montarDados(L, { entidade: e.id }), { ...SAFRA, base: 'competencia' }));
    const linhaE = todos.find(r => r.id === e.id);
    perto(so.receita, linhaE.receita, 'receita'); perto(so.desp, linhaE.desp, 'despesa');
  }
});

test('regime de caixa: venda de dezembro recebida em janeiro entra no ano seguinte', () => {
  const v = linha.venda({ id: 'vdez', data: '2026-12-20', comprador: 'X', kg: 1000, preco: 6, fator: 1, entidade: CPF, fazenda: F1 });
  gravarLote(L, [['vendas', v], ['recebimentos', linha.recebimento({ id: 'rjan', data: '2027-01-05', valor: 6000, forma: 'Pix' }, 'vdez')],
    ['lancamentos', linha.lancamento({ id: 'ldez', data: '2027-01-08', competencia: '2026-12-15', tipo: 'd', cat: 'Mão de obra', valor: 800, entidade: CPF, fazenda: F1 })]]);
  const d = montarDados(L), a26 = periodo('ano', 2026), a27 = periodo('ano', 2027);
  const tem = (ms, origem, valor) => ms.some(m => m.origem === origem && Math.abs(m.valor - valor) < 0.01);
  assert.ok(tem(movimentos(d, { ...a26, base: 'competencia' }), 'venda', 6000), 'competência: a venda é de 2026');
  assert.ok(!tem(movimentos(d, { ...a26, base: 'caixa' }), 'venda', 6000), 'caixa: não entra em 2026');
  assert.ok(tem(movimentos(d, { ...a27, base: 'caixa' }), 'venda', 6000), 'caixa: entra em 2027, quando foi recebida');
  assert.ok(tem(movimentos(d, { ...a26, base: 'competencia' }), 'lancamento', 800), 'despesa de competência dezembro');
  assert.ok(tem(movimentos(d, { ...a27, base: 'caixa' }), 'lancamento', 800), 'despesa paga em janeiro');
});

test('rateio: despesa geral dividida entre as fazendas; o que não foi rateado fica no Geral', () => {
  gravarLote(L, [['rateios', linha.rateio({ id: 'r1', fazenda: F1, percentual: 60 }, 'contador')], ['rateios', linha.rateio({ id: 'r2', fazenda: F2, percentual: 40 }, 'contador')]]);
  let d = montarDados(L);
  const linhas = porFazenda(movimentos(d, { ...ANO, base: 'competencia' }), FAZS);
  assert.deepEqual(partes({ id: 'contador', valor: 350, fazenda: null }, d.rateios).map(p => [p.fazenda, p.valor]), [[F1, 210], [F2, 140]]);
  assert.ok(!linhas.some(r => r.id === null), 'nada sobrou para o Geral');
  /* rateio parcial: 50% para a fazenda 1, o resto continua Geral */
  gravarLote(L, [['rateios', { id: 'r1', percentual: 50 }], ['rateios', { id: 'r2', deleted_at: '2026-10-26T00:00:00Z' }]]);
  d = montarDados(L);
  assert.deepEqual(partes({ id: 'contador', valor: 350, fazenda: null }, d.rateios).map(p => [p.fazenda, p.valor]), [[F1, 175], [null, 175]]);
  const t = resumir(movimentos(d, { ...ANO, base: 'competencia' })), pf = porFazenda(movimentos(d, { ...ANO, base: 'competencia' }), FAZS);
  perto(sum(pf, r => r.desp), t.desp, 'rateio não muda o total');
});

test('produção por mês e venda cruzada fecham com os totais', () => {
  const d = montarDados(L), r = resina(d, SAFRA);
  const pm = producaoMensal(d, SAFRA, FAZS);
  assert.equal(pm.meses.length, 12);
  assert.equal(pm.meses[0], '2025-09');
  perto(sum(pm.total, x => x), r.coletado, 'kg coletado');
  perto(sum(pm.linhas[F1], x => x) + sum(pm.linhas[F2], x => x), r.coletado, 'por fazenda');
  const m = matrizVendas(d, SAFRA);
  perto(sum(FAZS, f => somaMatriz(m, 'fazenda', f.id).kg), r.vendido, 'kg vendido por fazenda');
  perto(sum(ENTS, e => somaMatriz(m, 'entidade', e.id).kg), r.vendido, 'kg vendido por CPF/CNPJ');
  assert.equal(somaMatriz(m, 'fazenda', F2).kg, somaMatriz(m, 'entidade', CNPJ).kg - (m[F1]?.[CNPJ]?.kg || 0), 'a fazenda 2 vende só pelo CNPJ');
  assert.ok(r.perdido > 0);
});

test('períodos: safra de setembro a agosto, ano civil e período livre', () => {
  assert.deepEqual(periodo('safra', 2026), { de: '2026-09-01', ate: '2027-08-31' });
  assert.deepEqual(periodo('ano', 2026), { de: '2026-01-01', ate: '2026-12-31' });
  assert.deepEqual(periodo('livre', 2026, { de: '2026-03-01', ate: '2026-05-31' }), { de: '2026-03-01', ate: '2026-05-31' });
  assert.deepEqual(mesesDe({ de: '2026-11-15', ate: '2027-02-01' }), ['2026-11', '2026-12', '2027-01', '2027-02']);
});
