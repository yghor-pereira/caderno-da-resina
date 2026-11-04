import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { definirHoje } from '../js/util.js';
import { usarDados, tot, saldoAtual, estoque, fluxo, catIrDe } from '../js/regras.js';
import { exemplo } from '../js/exemplo.js';
import { abrir, gravar, gravarLote } from '../js/local.js';
import { montarDados, dadosParaLinhas, linha, entidadesDe, fazendasDe } from '../js/mapa.js';

/* duas fazendas, um CPF e um CNPJ, cada um com uma conta; despesas gerais (sem fazenda) do CNPJ.
   Na fazenda 1, metade das vendas e um terço das despesas saem pelo CNPJ; a fazenda 2 é toda do CNPJ. */
const F1 = '00000000-0000-4000-8000-0000000000f1', F2 = '00000000-0000-4000-8000-0000000000f2';
const CPF = '00000000-0000-4000-8000-00000000ecpf', CNPJ = '00000000-0000-4000-8000-0000000ecnpj';
const C1 = '00000000-0000-4000-8000-0000000000c1', C2 = '00000000-0000-4000-8000-0000000000c2';
let L, ex1, ex2;
const grava = (tabela, l) => gravar(L, tabela, l);
beforeEach(() => {
  definirHoje('2026-10-26');
  L = abrir('u1', memoria());
  const itens = [
    ['entidades_fiscais', linha.entidade({ id: CPF, tipo: 'PF', nome: 'João', documento: '52998224725', cor: '#2f6b4f', regime: 'PF_ATIVIDADE_RURAL', padrao: true })],
    ['entidades_fiscais', linha.entidade({ id: CNPJ, tipo: 'PJ', nome: 'Resinas Silva', documento: '11222333000181', cor: '#b5722d', regime: 'SIMPLES', previdencia: 'folha' })],
    ['contas_bancarias', linha.conta({ id: C1, entidade: CPF, banco: 'Sicredi', saldoInicial: 5000 })],
    ['contas_bancarias', linha.conta({ id: C2, entidade: CNPJ, banco: 'BB', saldoInicial: 3000 })]
  ];
  ex1 = exemplo(11); ex2 = exemplo(23);
  ex1.vendas.forEach((v, i) => Object.assign(v, i % 2 ? { entidade: CNPJ } : { entidade: CPF }));
  ex1.vendas.forEach(v => v.recs.forEach(r => { r.conta = v.entidade === CPF ? C1 : C2; }));
  ex1.caixa.forEach((x, i) => Object.assign(x, i % 3 ? { entidade: CPF, conta: C1 } : { entidade: CNPJ, conta: C2 }));
  ex2.vendas.forEach(v => { v.entidade = CNPJ; v.recs.forEach(r => { r.conta = C2; }); });
  ex2.caixa.forEach(x => Object.assign(x, { entidade: CNPJ, conta: C2 }));
  for (const [fid, nome, ex] of [[F1, 'Capão Alto', ex1], [F2, 'Boa Esperança', ex2]]) {
    itens.push(['fazendas', linha.fazenda({ id: fid, nome, municipio: 'x', uf: 'SC', area_ha: 10 }, ex)]);
    for (const [t, ls] of Object.entries(dadosParaLinhas(ex, fid))) for (const l of ls) itens.push([t, l]);
  }
  /* despesa geral, sem fazenda: contador do CNPJ */
  itens.push(['lancamentos', linha.lancamento({ id: crypto.randomUUID(), data: '2026-10-10', tipo: 'd', cat: 'Outros', desc: 'Contador', valor: 350, entidade: CNPJ, conta: C2, fazenda: null })]);
  gravarLote(L, itens);
});

const resumo = d => { usarDados(d); const T = tot(2026); return { receita: T.receita, desp: T.desp, liquido: T.liquido, saldo: saldoAtual(), kgVend: T.kgVend, fluxo: fluxo(6).at(-1).saldo }; };
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} ≠ ${b}`);

test('a visão global junta as duas fazendas e as despesas gerais', () => {
  const S = montarDados(L);
  assert.equal(S.talhoes.length, ex1.talhoes.length + ex2.talhoes.length);
  assert.equal(S.vendas.length, ex1.vendas.length + ex2.vendas.length);
  assert.equal(S.caixa.length, ex1.caixa.length + ex2.caixa.length + 1);
  assert.equal(S.saldoInicial, 8000, 'saldo inicial = soma das contas');
  assert.ok(S.caixa.some(x => x.fazenda === null && x.desc === 'Contador'));
});

test('a soma por CPF/CNPJ é igual ao consolidado', () => {
  const todos = resumo(montarDados(L));
  const cpf = resumo(montarDados(L, { entidade: CPF }));
  const cnpj = resumo(montarDados(L, { entidade: CNPJ }));
  for (const k of Object.keys(todos)) perto(cpf[k] + cnpj[k], todos[k], k);
  assert.ok(cpf.receita > 0 && cnpj.receita > 0, 'os dois têm receita');
});

test('a soma por fazenda mais o geral é igual ao consolidado', () => {
  const todos = resumo(montarDados(L));
  const f1 = resumo(montarDados(L, { fazenda: F1 })), f2 = resumo(montarDados(L, { fazenda: F2 }));
  for (const k of ['receita', 'liquido', 'kgVend']) perto(f1[k] + f2[k], todos[k], k);
  perto(f1.desp + f2.desp + 350, todos.desp, 'despesas: fazendas + geral (contador)');
});

test('filtro de CPF/CNPJ não muda produção, perdas nem estoque', () => {
  const todos = montarDados(L), cnpj = montarDados(L, { entidade: CNPJ });
  usarDados(todos); const [kg, est, perda] = [tot(2026).kgProd, estoque(), tot(2026).kgPerda];
  usarDados(cnpj);
  assert.equal(tot(2026).kgProd, kg);
  assert.equal(tot(2026).kgPerda, perda);
  assert.equal(estoque(), est);
  assert.ok(cnpj.vendas.length < todos.vendas.length);
});

test('estoque desconta as perdas de resina', () => {
  const S = montarDados(L, { fazenda: F1 });
  usarDados(S);
  const antes = estoque();
  gravar(L, 'perdas', linha.perda({ id: crypto.randomUUID(), data: '2026-10-20', kg: 40, motivo: 'Chuva' }, F1));
  usarDados(montarDados(L, { fazenda: F1 }));
  assert.equal(estoque(), antes - 40);
});

test('saldo de cada conta: saldo inicial + pagamentos e recebimentos com aquela conta; a soma fecha com o saldo global', () => {
  const es = entidadesDe(L), cpf = es.find(e => e.id === CPF), cnpj = es.find(e => e.id === CNPJ);
  const total = cpf.contas[0].saldo + cpf.semConta + cnpj.contas[0].saldo + cnpj.semConta;
  usarDados(montarDados(L));
  perto(total, saldoAtual(), 'saldo das contas = saldo global');
  usarDados(montarDados(L, { entidade: CNPJ }));
  perto(cnpj.contas[0].saldo + cnpj.semConta, saldoAtual(), 'saldo do CNPJ');
});

test('lançamento antigo sem CPF/CNPJ conta para o padrão; sem conta, vai para "sem conta"', () => {
  grava('lancamentos', { id: 'velho', fazenda_id: F1, data: '2026-10-01', tipo: 'd', cat: 'Outros', descr: '', valor: 50 });
  const x = montarDados(L).caixa.find(l => l.id === 'velho');
  assert.equal(x.entidade, CPF);
  assert.equal(x.competencia, '2026-10-01');
  assert.equal(x.catIr, 'CUSTEIO');
  assert.equal(entidadesDe(L).find(e => e.id === CPF).semConta, -50);
});

test('lançamento guarda a competência separada da data do pagamento e a fazenda é opcional', () => {
  const l = linha.lancamento({ id: 'x', data: '2027-01-10', competencia: '2026-12-20', tipo: 'd', cat: 'Mão de obra', valor: 100, entidade: CPF });
  assert.equal(l.data, '2027-01-10');
  assert.equal(l.data_competencia, '2026-12-20');
  assert.equal(l.categoria_irpf, 'CUSTEIO');
  assert.equal(l.fazenda_id, null);
  assert.equal(linha.lancamento({ id: 'y', data: '2026-05-01', tipo: 'd', cat: 'Outros', valor: 1, fazenda: F1 }).fazenda_id, F1);
});

test('categoria no IR sugerida pela categoria do lançamento', () => {
  assert.equal(catIrDe({ tipo: 'r', cat: 'Outras receitas' }), 'RECEITA_RURAL');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Máquinas e benfeitorias' }), 'INVESTIMENTO');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Despesas pessoais' }), 'NAO_DEDUTIVEL');
  assert.equal(catIrDe({ tipo: 'd', cat: 'Pasta estimulante' }), 'CUSTEIO');
});

test('CPFs/CNPJs com inscrições e contas; fazenda sem inscrição estadual', () => {
  grava('inscricoes_estaduais', linha.inscricao({ id: 'i1', entidade: CNPJ, ie: '9012345678', uf: 'PR', municipio: 'Rio Negro' }));
  const es = entidadesDe(L);
  assert.equal(es[0].id, CPF, 'o padrão vem primeiro');
  assert.equal(es.find(e => e.id === CNPJ).inscricoes[0].ie, '9012345678');
  assert.equal(es.find(e => e.id === CNPJ).previdencia, 'folha');
  assert.ok(fazendasDe(L).every(f => f.ie === null && f.area_ha === 10));
});

test('mover para outro CPF/CNPJ e outra fazenda muda onde o registro aparece', () => {
  const v = montarDados(L, { fazenda: F1, entidade: CPF }).vendas[0];
  gravar(L, 'vendas', { id: v.id, fazenda_id: F2, entidade_id: CNPJ });
  assert.ok(!montarDados(L, { fazenda: F1 }).vendas.some(x => x.id === v.id));
  const m = montarDados(L, { fazenda: F2, entidade: CNPJ }).vendas.find(x => x.id === v.id);
  assert.equal(m.recs.length, v.recs.length, 'os recebimentos acompanham a venda');
});
