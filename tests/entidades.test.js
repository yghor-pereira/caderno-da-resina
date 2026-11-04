import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { definirHoje, sum } from '../js/util.js';
import { usarDados, tot, saldoAtual, estoque, fluxo, catIrDe } from '../js/regras.js';
import { exemplo } from '../js/exemplo.js';
import { abrir, gravar } from '../js/local.js';
import { montarDados, dadosParaLinhas, linha, propriedadesDe, entidadesDe } from '../js/mapa.js';

/* uma propriedade com duas inscrições; o CPF fatura pela primeira e o CNPJ pela segunda,
   e parte das vendas e despesas da primeira sai pelo CNPJ */
const P = '00000000-0000-4000-8000-0000000000p1', F1 = '00000000-0000-4000-8000-0000000000f1', F2 = '00000000-0000-4000-8000-0000000000f2';
const CPF = '00000000-0000-4000-8000-00000000ecpf', CNPJ = '00000000-0000-4000-8000-0000000ecnpj';
let L, ex1, ex2;
const grava = (tabela, l) => gravar(L, tabela, l);
beforeEach(() => {
  definirHoje('2026-10-26');
  L = abrir('u1', memoria());
  grava('propriedades', linha.propriedade({ id: P, nome: 'Capão Alto', municipio: 'Itaiópolis', uf: 'SC', area_ha: 40 }));
  grava('entidades_fiscais', linha.entidade({ id: CPF, tipo: 'PF', nome: 'João', documento: '52998224725', cor: '#2f6b4f', regime: 'PF_ATIVIDADE_RURAL', padrao: true }));
  grava('entidades_fiscais', linha.entidade({ id: CNPJ, tipo: 'PJ', nome: 'Resinas Silva', documento: '11222333000181', cor: '#b5722d', regime: 'SIMPLES' }));
  ex1 = exemplo(11); ex2 = exemplo(23, null, 'folha');
  ex1.vendas.forEach((v, i) => { if (i % 2) v.entidade = CNPJ; else v.entidade = CPF; });
  ex1.caixa.forEach((x, i) => { x.entidade = i % 3 ? CPF : CNPJ; });
  for (const [fid, ie, ex] of [[F1, '254123987', ex1], [F2, '254123988', ex2]]) {
    grava('fazendas', linha.fazenda({ id: fid, propriedade_id: P, nome: 'Capão Alto', ie, municipio: 'Itaiópolis', uf: 'SC' }, ex));
    for (const [t, ls] of Object.entries(dadosParaLinhas(ex, fid))) for (const l of ls) grava(t, l);
  }
  grava('vinculos', linha.vinculo({ id: crypto.randomUUID(), fazenda: F1, entidade: CPF, percentual: 70, padrao: true }));
  grava('vinculos', linha.vinculo({ id: crypto.randomUUID(), fazenda: F1, entidade: CNPJ, percentual: 30, condicao: 'PARCEIRO' }));
  grava('vinculos', linha.vinculo({ id: crypto.randomUUID(), fazenda: F2, entidade: CNPJ, percentual: 100, condicao: 'ARRENDATARIO', padrao: true }));
});

const resumo = d => { usarDados(d); const T = tot(2026); return { receita: T.receita, desp: T.desp, liquido: T.liquido, saldo: saldoAtual(), kgVend: T.kgVend, fluxo: fluxo(6).at(-1).saldo }; };
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} ≠ ${b}`);

test('a propriedade junta as duas inscrições: talhões, produção e financeiro', () => {
  const S = montarDados(L, [F1, F2]);
  assert.equal(S.talhoes.length, ex1.talhoes.length + ex2.talhoes.length);
  assert.equal(S.producao.length, ex1.producao.length + ex2.producao.length);
  assert.equal(S.vendas.length, ex1.vendas.length + ex2.vendas.length);
  assert.equal(S.saldoInicial, 18000);
  assert.deepEqual(S.fazendas.map(f => f.regime), ['funrural', 'folha']);
  assert.ok(S.talhoes.every(t => [F1, F2].includes(t.fazenda)));
});

test('quem faturou: o gravado, senão o vínculo padrão da inscrição', () => {
  const S = montarDados(L, [F1, F2]);
  assert.ok(S.vendas.filter(v => v.fazenda === F2).every(v => v.entidade === CNPJ), 'F2 não tem entidade gravada: vai para o padrão dela (CNPJ)');
  assert.equal(S.caixa.filter(x => x.fazenda === F1 && x.entidade === CNPJ).length, ex1.caixa.filter((_, i) => i % 3 === 0).length);
});

test('a soma dos relatórios por CPF/CNPJ é igual ao consolidado', () => {
  const todos = resumo(montarDados(L, [F1, F2]));
  const cpf = resumo(montarDados(L, [F1, F2], { entidade: CPF }));
  const cnpj = resumo(montarDados(L, [F1, F2], { entidade: CNPJ }));
  for (const k of Object.keys(todos)) perto(cpf[k] + cnpj[k], todos[k], k);
  assert.ok(cpf.receita > 0 && cnpj.receita > 0, 'os dois têm receita');
});

test('o filtro de CPF/CNPJ não muda a produção nem o estoque da propriedade', () => {
  const todos = montarDados(L, [F1, F2]), cnpj = montarDados(L, [F1, F2], { entidade: CNPJ });
  usarDados(todos); const [kg, est] = [tot(2026).kgProd, estoque()];
  usarDados(cnpj);
  assert.equal(tot(2026).kgProd, kg);
  assert.equal(estoque(), est);
  assert.ok(cnpj.vendas.length < todos.vendas.length);
});

test('registro antigo sem CPF/CNPJ e inscrição sem vínculo ficam com o CPF/CNPJ padrão do produtor', () => {
  const F3 = '00000000-0000-4000-8000-0000000000f3';
  grava('fazendas', linha.fazenda({ id: F3, propriedade_id: P, nome: 'Nova', ie: '254123989', municipio: 'x', uf: 'SC' }, { regime: 'funrural' }));
  grava('lancamentos', { id: crypto.randomUUID(), fazenda_id: F3, data: '2026-10-01', tipo: 'd', cat: 'Outros', descr: '', valor: 50 });
  const x = montarDados(L, [F3]).caixa[0];
  assert.equal(x.entidade, CPF);
  assert.equal(x.competencia, '2026-10-01');
  assert.equal(x.catIr, 'CUSTEIO');
});

test('lançamento guarda a competência separada da data do pagamento', () => {
  const l = linha.lancamento({ id: 'x', data: '2027-01-10', competencia: '2026-12-20', tipo: 'd', cat: 'Mão de obra', valor: 100, entidade: CPF }, F1);
  assert.equal(l.data, '2027-01-10');
  assert.equal(l.data_competencia, '2026-12-20');
  assert.equal(l.categoria_irpf, 'CUSTEIO');
  assert.equal(linha.lancamento({ id: 'y', data: '2026-05-01', tipo: 'd', cat: 'Outros', valor: 1 }, F1).data_competencia, '2026-05-01');
});

test('categoria no IR sugerida pela categoria do lançamento', () => {
  assert.equal(catIrDe({ tipo: 'r', cat: 'Outras receitas' }), 'RECEITA_RURAL');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Máquinas e benfeitorias' }), 'INVESTIMENTO');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Despesas pessoais' }), 'NAO_DEDUTIVEL');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Pasta estimulante' }), 'CUSTEIO');
});

test('propriedadesDe: inscrições agrupadas; fazenda sem propriedade vira propriedade virtual', () => {
  const F4 = '00000000-0000-4000-8000-0000000000f4';
  grava('fazendas', linha.fazenda({ id: F4, nome: 'Antiga', ie: '11122233', municipio: 'Lapa', uf: 'PR' }, { regime: 'funrural' }));
  const ps = propriedadesDe(L);
  const cap = ps.find(p => p.id === P), ant = ps.find(p => p.id === F4);
  assert.deepEqual(cap.fazendas.map(f => f.id), [F1, F2]);
  assert.equal(cap.dados.talhoes.length, ex1.talhoes.length + ex2.talhoes.length);
  assert.equal(ant.virtual, true);
  assert.equal(ant.nome, 'Antiga');
});

test('entidadesDe: o padrão vem primeiro e cada um traz as contas bancárias', () => {
  grava('contas_bancarias', linha.conta({ id: 'c1', entidade: CNPJ, banco: 'Sicredi', agencia: '0101', conta: '12345-6' }));
  const es = entidadesDe(L);
  assert.equal(es[0].id, CPF);
  assert.equal(es.find(e => e.id === CNPJ).contas[0].banco, 'Sicredi');
});

test('mover para outra inscrição e CPF/CNPJ muda onde o registro aparece', () => {
  const v = montarDados(L, [F1, F2]).vendas.find(x => x.fazenda === F1 && x.entidade === CPF);
  gravar(L, 'vendas', { id: v.id, fazenda_id: F2, entidade_id: CNPJ });
  const S = montarDados(L, [F1, F2]);
  const m = S.vendas.find(x => x.id === v.id);
  assert.equal(m.fazenda, F2); assert.equal(m.entidade, CNPJ);
  assert.equal(m.recs.length, v.recs.length, 'os recebimentos acompanham a venda');
});
