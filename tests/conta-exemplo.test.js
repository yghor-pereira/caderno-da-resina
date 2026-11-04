import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoria } from './apoio.js';

globalThis.localStorage = memoria();
const { definirHoje, sum } = await import('../js/util.js');
definirHoje('2026-10-26');
const est = await import('../js/estado.js');
const { V } = await import('../js/telas.js');
const { gravarLote } = await import('../js/local.js');
const { linha } = await import('../js/mapa.js');
const { cpfValido, cnpjValido } = await import('../js/doc.js');
const { usarDados, saldoAtual } = await import('../js/regras.js');

test('cadastro completado: quem não tem CPF/CNPJ nem conta ganha os dois; rodar de novo não cria nada', () => {
  est.abrirSessao('u-antigo', { email: 'antigo@x.com', nome: 'Maria' });
  est.recarregar();
  est.completarCadastro();
  const u = est.usuario();
  assert.equal(u.entidades.length, 1);
  assert.ok(u.entidades[0].padrao);
  assert.equal(u.entidades[0].nome, 'Maria');
  assert.equal(u.entidades[0].contas[0].apelido, 'Conta principal');
  const n = est.SES.L.fila.length;
  est.completarCadastro();
  assert.equal(est.SES.L.fila.length, n);
});

/* como a migração deixa a conta de exemplo: CPF padrão sem documento, com as IEs das fazendas antigas e a conta principal */
const CPF0 = '00000000-0000-4000-8000-00000000e000';
test('conta de exemplo: 2 fazendas, 1 CPF e 1 CNPJ com inscrições e contas; vendas e despesas dos dois', () => {
  est.abrirSessao('u-exemplo', { email: est.EX.email, nome: 'Produtor' });
  gravarLote(est.SES.L, [
    ['entidades_fiscais', linha.entidade({ id: CPF0, tipo: 'PF', nome: 'Produtor', cor: '#2f6b4f', regime: 'PF_ATIVIDADE_RURAL', padrao: true })],
    ['inscricoes_estaduais', linha.inscricao({ id: 'ie-velha', entidade: CPF0, ie: '9012345678', uf: 'PR' })],
    ['contas_bancarias', linha.conta({ id: 'cp', entidade: CPF0, apelido: 'Conta principal', saldoInicial: 18000 })]]);
  est.recarregar();
  est.prepararExemplo();
  const u = est.usuario();
  assert.equal(u.fazendas.length, 2);
  assert.ok(u.fazendas.every(f => f.area_ha > 0 && f.nirf_cib && f.car));
  assert.equal(u.entidades.length, 2, 'reaproveita o CPF criado no cadastro');
  const cpf = u.entidades.find(e => e.tipo === 'PF'), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  assert.equal(cpf.id, CPF0);
  assert.ok(cpfValido(cpf.documento) && cnpjValido(cnpj.documento));
  assert.ok(cpf.padrao && !cnpj.padrao);
  assert.deepEqual(cnpj.inscricoes.map(i => i.uf).sort(), ['PR', 'SC']);
  assert.ok(cnpj.inscricoes.some(i => i.id === 'ie-velha'), 'a IE que a migração deu ao CPF passou para o CNPJ (a IE é única)');
  assert.equal(sum(u.entidades.flatMap(e => e.contas), c => c.saldoInicial), 18000, 'conta principal zerada; o saldo está nas contas do exemplo');
  const sc = u.fazendas.find(f => f.uf === 'SC'), pr = u.fazendas.find(f => f.uf === 'PR');
  const dSC = est.dadosFazenda(sc.id), dPR = est.dadosFazenda(pr.id);
  assert.ok(dSC.vendas.some(v => v.entidade === cpf.id) && dSC.vendas.some(v => v.entidade === cnpj.id), 'Capão Alto vende pelos dois');
  assert.ok(dSC.vendas.every(v => v.inscricao && [...cpf.inscricoes, ...cnpj.inscricoes].find(i => i.id === v.inscricao).uf === 'SC'), 'a nota sai pela IE de SC');
  assert.ok(dPR.vendas.every(v => v.entidade === cnpj.id));
  assert.ok(dSC.vendas.flatMap(v => v.recs).every(r => r.conta), 'recebimentos na conta de quem vendeu');
  assert.ok(dSC.perdas.length > 0, 'tem perdas de resina');
  assert.ok(u.global.caixa.some(x => !x.fazenda && x.entidade === cnpj.id), 'despesa geral (contador) do CNPJ, sem fazenda');
  /* entrar de novo não remonta (só regera depois de 7 dias) */
  const n = est.SES.L.fila.length;
  est.prepararExemplo();
  assert.equal(est.SES.L.fila.length, n);
});

test('regerar o exemplo mantém a divisão entre CPF e CNPJ e não duplica o contador', () => {
  const u = est.usuario(), f = u.fazendas.find(x => x.uf === 'SC'), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  const contador = () => est.usuario().global.caixa.filter(x => x.desc === 'Honorários do contador (exemplo)').length;
  const n = contador();
  est.regerarExemplo(f);
  assert.ok(est.dadosFazenda(f.id).vendas.some(v => v.entidade === cnpj.id));
  assert.equal(contador(), n);
});

test('telas: filtros do topo, emitente marcado e saldo das contas', () => {
  const u = est.usuario(), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  est.E.atual = 'caixa'; est.E.modoCaixa = 'real'; est.recarregar();
  const html = V.caixa();
  assert.match(html, /Em nome de/);
  assert.match(html, /Geral \(sem fazenda\)/);
  assert.equal(html.match(/name="ent" value="([^"]+)" checked/)[1], u.entidades.find(e => e.padrao).id);
  est.definirFiltro('entidade', cnpj.id);
  assert.equal(V.caixa().match(/name="ent" value="([^"]+)" checked/)[1], cnpj.id, 'com o CNPJ no filtro, ele vem marcado');
  assert.equal(est.SES.L.meta.entidade, cnpj.id, 'a escolha fica guardada no cache do usuário');
  est.E.modoCaixa = 'contas';
  const contas = V.caixa();
  assert.match(contas, /Conta da empresa/);
  assert.ok(!/Conta da safra/.test(contas), 'com o filtro, só as contas do CNPJ');
  est.definirFiltro('entidade', null);
  est.E.atual = 'vendas'; est.recarregar();
  const vendas = V.vendas();
  assert.match(vendas, /Quem emite a nota/);
  assert.match(vendas, /Fazenda de onde saiu a resina/);
  assert.match(vendas, /Inscrição estadual de quem emite/);
});

test('telas: cadastros financeiros e declarações em desenvolvimento; perdas e cadastro da fazenda', () => {
  const html = V.cadastros();
  assert.match(html, /529\.982\.247-25/);
  assert.match(html, /11\.222\.333\/0001-81/);
  assert.match(html, /Declarações de Imposto de Renda/);
  assert.match(html, /será disponibilizado em futuras versões/);
  const sc = est.usuario().fazendas.find(f => f.uf === 'SC');
  est.abrirFazenda(sc.id); est.E.atual = 'perdas'; est.recarregar();
  assert.match(V.perdas(), /Resina perdida na safra/);
  est.E.atual = 'fazenda'; est.recarregar();
  assert.match(V.fazenda(), /NIRF \/ CIB/);
  assert.ok(!/Inscrição Estadual \(ICMS\)/.test(V.fazenda()), 'a fazenda não tem mais IE');
  est.E.atual = 'inicio'; est.recarregar();
  assert.match(V.inicio(), /Geral \(sem fazenda\)/, 'o comparativo do Início mostra as despesas gerais');
});

test('telas: relatórios por CPF/CNPJ, por fazenda, produção por mês e venda cruzada', () => {
  est.E.atual = 'resultado'; est.E.modoRes = 'rel'; est.recarregar();
  const html = V.resultado();
  for (const t of ['Por CPF/CNPJ', 'Por fazenda', 'Produção por mês', 'Venda cruzada', 'Geral (sem fazenda)', 'CPF João', 'Resinas Silva'])
    assert.ok(html.includes(t), t);
  est.E.periodo = { ...est.E.periodo, base: 'caixa' };
  assert.match(V.resultado(), /<b>Caixa<\/b>: vendas pelo que foi recebido/);
  est.E.periodo = { tipo: 'livre', de: '2026-03-01', ate: '2026-05-31', base: 'competencia' };
  assert.match(V.resultado(), /01\/03\/2026 a 31\/05\/2026/);
  est.E.modoRes = 'margem';
});

test('tela: tamanho da letra e modo campo ficam guardados; o Início do modo campo mostra só os atalhos', () => {
  est.definirTela('letra', 'gg'); est.definirTela('campo', true);
  assert.deepEqual(est.tela(), { letra: 'gg', campo: true });
  assert.equal(est.SES.L.meta.letra, 'gg');
  est.E.atual = 'inicio'; est.E.inicioCompleto = false; est.recarregar();
  const html = V.inicio();
  for (const t of ['O que você vai registrar?', 'Apontar estria', 'Apontar coleta', 'Anotar perda', 'Lançar despesa', 'Registrar venda', 'Ver o Início completo'])
    assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Mercado hoje'), 'o modo campo esconde o mercado');
  est.E.inicioCompleto = true;
  assert.match(V.inicio(), /Mercado hoje/);
  assert.match(V.conta(), /Tela e uso no campo/);
  est.definirTela('letra', 'n'); est.definirTela('campo', false); est.E.inicioCompleto = false;
  assert.match(V.inicio(), /Mercado hoje/);
});

test('estria: sem ramal vencendo no talhão, o app avisa e aponta o talhão que tem ramal vencendo', () => {
  const sc = est.usuario().fazendas.find(f => f.uf === 'SC');
  est.abrirFazenda(sc.id); est.E.atual = 'floresta'; est.E.flMode = 'apontar'; est.E.opTipo = 'estria'; est.recarregar();
  const { S } = est.dadosFazenda(sc.id) && { S: est.dadosFazenda(sc.id) };
  const emDia = S.talhoes.find(t => t.nome === 'Talhão A');
  est.E.apTal = emDia.id; est.E.apSel = null;
  const html = V.floresta();
  if (/Nenhum ramal com estria vencendo/.test(html)) assert.match(html, /data-aptal="[^"]+">Talhão C<\/button>/, 'aponta o Talhão C, que está atrasado');
  else assert.match(html, /Já vêm marcados os ramais com estria vencendo/);
  est.E.apTal = S.talhoes.find(t => t.nome === 'Talhão C').id; est.E.apSel = null;
  assert.match(V.floresta(), /Já vêm marcados os ramais com estria vencendo/);
});
