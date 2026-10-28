import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';

globalThis.localStorage = memoria();
const { definirHoje } = await import('../js/util.js');
definirHoje('2026-10-26');
const est = await import('../js/estado.js');
const { V } = await import('../js/telas.js');
const { exemplo } = await import('../js/exemplo.js');
const { gravarLote } = await import('../js/local.js');
const { linha } = await import('../js/mapa.js');

const FID = '00000000-0000-4000-8000-0000000000aa';
before(() => {
  est.abrirSessao('u-teste');
  gravarLote(est.SES.L, est.linhasExemplo({ id: FID, nome: 'Fazenda X', ie: '11122233', doc: '', municipio: 'Lapa', uf: 'PR' }, exemplo(5)));
  est.usarFazendaId(FID);
});

test('apagar os dados de exemplo zera o saldo inicial', () => {
  assert.equal(est.fazAtual().dados.saldoInicial, 9000);
  est.limparFazenda(FID);
  assert.equal(est.fazAtual().dados.saldoInicial, 0);
  assert.equal(est.fazAtual().dados.demo, false);
  assert.equal(est.fazAtual().dados.vendas.length, 0);
});

test('campos da NF-e são escapados na tela de vendas', () => {
  const v = { id: '00000000-0000-4000-8000-0000000000bb', data: '2026-10-20', comprador: 'X', kg: 10, preco: 6, fator: 0.9837, comNota: true, venc: null,
    nf: { numero: '<img src=x onerror=alert(1)>', serie: '<b>s</b>', data: '2026-10-20', doc: '', cfop: '<i>c</i>', chave: '<script>1</script>' } };
  gravarLote(est.SES.L, [['vendas', linha.venda(v, FID)]]);
  est.recarregar();
  est.E.safraSel = 2026; est.E.aberta = v.id;
  const html = V.vendas();
  for (const mau of ['<img', '<b>s', '<i>c', '<script']) assert.ok(!html.includes(mau), mau);
});

test('gravações viram métricas só com tipo e tabela; dados de exemplo não contam', async () => {
  const { estadoMetricas } = await import('../js/metricas.js');
  const M = () => estadoMetricas();
  M().fila.length = 0;
  const t = { id: '00000000-0000-4000-8000-0000000000t1', fazenda_id: FID, nome: 'Talhão Métrica' };
  est.salvar('talhoes', t);
  est.salvar('talhoes', { id: t.id, nome: 'Outro nome' });
  est.apagar([['talhoes', t.id], ['talhoes', 'nao-existe']]);
  assert.deepEqual(M().fila.map(e => [e.evento, e.props]), [
    ['record_created', { tabela: 'talhoes' }], ['record_updated', { tabela: 'talhoes' }], ['record_deleted', { tabela: 'talhoes' }]]);
  assert.ok(!JSON.stringify(M().fila).includes('Talhão Métrica'));
  M().fila.length = 0;
  est.regerarExemplo(est.usuario().fazendas.find(f => f.id === FID));
  assert.deepEqual(M().fila, []);
});

test('senha temporária: perfil marcado pede troca até o app confirmar a senha nova', () => {
  const uid = est.SES.L.userId;
  gravarLote(est.SES.L, [['perfis', { id: uid, nome: 'Ana', trocar_senha: true }]]);
  est.recarregar();
  assert.equal(est.usuario().trocarSenha, true);
  est.E.senhaTrocada = uid; est.recarregar();
  assert.equal(est.usuario().trocarSenha, false);
  est.E.senhaTrocada = null;
  gravarLote(est.SES.L, [['perfis', { id: uid, trocar_senha: false }]]); est.recarregar();
  assert.equal(est.usuario().trocarSenha, false);
  assert.match(V.senha(), /Crie uma nova senha/);
});
