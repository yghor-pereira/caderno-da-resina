import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';
import { CATALOGO, dispositivo, limpar, abrirMetricas, fecharMetricas, apagarMetricas, atividade, tique, track, enviarMetricas, estadoMetricas } from '../js/metricas.js';

const T0 = Date.parse('2026-10-28T12:00:00Z');
let arm;
beforeEach(() => { arm = memoria(); abrirMetricas('u1', { arm, agora: T0 }); });

test('evento guarda tela, sessão e hora, e sobrevive a fechar o app', () => {
  track('page_view', { tela: 'floresta', modo: 'apontar' }, T0 + 1000);
  track('record_created', { tabela: 'estrias' }, T0 + 2000);
  const M = estadoMetricas(), [a, b] = M.fila;
  assert.equal(a.tela, 'floresta');
  assert.deepEqual(a.props, { modo: 'apontar' });
  assert.equal(b.tela, 'floresta');            // herda a tela atual
  assert.equal(b.sessao_id, M.atual);
  assert.equal(b.criado_em, '2026-10-28T12:00:02.000Z');
  fecharMetricas();
  abrirMetricas('u1', { arm, agora: T0 + 5000 });
  assert.equal(estadoMetricas().fila.length, 2);
  assert.equal(Object.keys(estadoMetricas().sessoes).length, 2);   // a anterior e a nova
});

test('valores em reais e texto livre não entram nas propriedades', () => {
  assert.deepEqual(limpar({ tabela: 'vendas', qtd: 3, valor: 1234.56, descr: 'diária do João', online: true, 'Chave Ruim': 'x' }),
    { tabela: 'vendas', qtd: 3, online: true });
});

test('fila tem limite: os eventos mais antigos saem primeiro', () => {
  for (let i = 0; i < 1005; i++) track('feature_used', { funcao: 'safra_trocada' }, T0 + i);
  const f = estadoMetricas().fila;
  assert.equal(f.length, 1000);
  assert.equal(f[0].criado_em, new Date(T0 + 5).toISOString());
});

test('tempo de uso conta só com a aba visível e uso nos últimos 2 minutos', () => {
  const s = () => estadoMetricas().sessoes[estadoMetricas().atual];
  tique(true, T0 + 15000);                  // usando: +15 s
  tique(false, T0 + 30000);                 // aba escondida: não conta
  tique(true, T0 + 45000);                  // voltou, ainda dentro dos 2 min do último toque: +15 s
  assert.equal(s().segundos_ativos, 30);
  tique(true, T0 + 200000);                 // parado há mais de 2 min: não conta
  assert.equal(s().segundos_ativos, 30);
  atividade(T0 + 210000); tique(true, T0 + 300000);   // tocou de novo: conta no máximo 60 s por intervalo
  assert.equal(s().segundos_ativos, 90);
});

test('depois de 30 minutos parado, a próxima atividade abre outra sessão', () => {
  const primeira = estadoMetricas().atual;
  atividade(T0 + 10 * 60e3);
  assert.equal(estadoMetricas().atual, primeira);
  atividade(T0 + 50 * 60e3);
  assert.notEqual(estadoMetricas().atual, primeira);
});

const cliente = rpc => ({ chamadas: [], rpc(nome, args) { this.chamadas.push([nome, structuredClone(args)]); return rpc(args); } });

test('envio em lote: o servidor recebeu, a fila esvazia e a sessão fica limpa', async () => {
  track('login', { modo: 'senha' }, T0 + 1);
  const c = cliente(async () => ({ data: 2, error: null }));
  assert.equal(await enviarMetricas(c), true);
  assert.equal(c.chamadas[0][0], 'registrar_uso');
  assert.equal(c.chamadas[0][1].p_eventos.length, 1);
  assert.equal(c.chamadas[0][1].p_sessoes[0].sujo, undefined);
  assert.equal(estadoMetricas().fila.length, 0);
  assert.equal(await enviarMetricas(c), true);
  assert.equal(c.chamadas.length, 1);       // nada novo: não chama o servidor
});

test('sem sinal, nada se perde; erro de dado descarta o lote para não travar a fila', async () => {
  track('login', {}, T0 + 1);
  assert.equal(await enviarMetricas(cliente(async () => { throw new TypeError('Failed to fetch'); })), false);
  assert.equal(await enviarMetricas(cliente(async () => ({ error: { code: 'PGRST301', message: 'JWT expired' } }))), false);
  assert.equal(estadoMetricas().fila.length, 1);
  assert.equal(await enviarMetricas(cliente(async () => ({ error: { code: '22P02', message: 'invalid uuid' } }))), false);
  assert.equal(estadoMetricas().fila.length, 0);
});

test('evento registrado durante o envio vai no próximo lote', async () => {
  track('login', {}, T0 + 1);
  let liberar; const espera = new Promise(r => { liberar = r; });
  const envio = enviarMetricas(cliente(async () => { await espera; return { error: null }; }));
  track('logout', {}, T0 + 2);
  tique(true, T0 + 15000);
  liberar(); await envio;
  assert.deepEqual(estadoMetricas().fila.map(e => e.evento), ['logout']);
  assert.equal(estadoMetricas().sessoes[estadoMetricas().atual].sujo, true);
});

test('sem usuário (ou com falha no armazenamento), track não quebra o app', () => {
  fecharMetricas();
  assert.doesNotThrow(() => { track('login'); tique(true); atividade(); });
  const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); }, removeItem() {} };
  abrirMetricas('u2', { arm: quebrado });
  assert.doesNotThrow(() => track('login'));
  apagarMetricas('u1', arm);
  assert.equal(arm.getItem('caderno-resina-metricas:u1'), null);
});

test('dispositivo simplificado', () => {
  assert.equal(dispositivo('Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', true), 'Android · Samsung · app');
  assert.equal(dispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), 'iPhone · Safari · navegador');
  assert.equal(dispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Windows · Chrome · navegador');
});

test('catálogo cobre todas as tabelas sincronizadas', async () => {
  const { ORDEM } = await import('../js/nuvem.js');
  assert.deepEqual([...CATALOGO.tabelas].sort(), [...ORDEM].sort());
});
