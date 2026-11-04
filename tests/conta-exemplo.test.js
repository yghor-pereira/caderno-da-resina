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

test('cadastro completado: fazenda antiga ganha propriedade, CPF padrão e vínculo', () => {
  est.abrirSessao('u-antigo', { email: 'antigo@x.com', nome: 'Maria' });
  const F = '00000000-0000-4000-8000-0000000000a1';
  gravarLote(est.SES.L, [['fazendas', linha.fazenda({ id: F, nome: 'Sítio', ie: '11122233', municipio: 'Lapa', uf: 'PR' }, { regime: 'funrural' })]]);
  est.recarregar();
  assert.equal(est.usuario().propriedades[0].virtual, true);
  est.completarCadastro();
  const u = est.usuario();
  assert.equal(u.entidades.length, 1);
  assert.equal(u.entidades[0].padrao, true);
  assert.equal(u.entidades[0].nome, 'Maria');
  assert.equal(u.propriedades.length, 1);
  assert.ok(!u.propriedades[0].virtual);
  assert.equal(u.fazendas[0].propriedade_id, u.propriedades[0].id);
  assert.equal(u.fazendas[0].vinculos[0].entidade, u.entidades[0].id);
  /* rodar de novo não cria nada */
  const n = est.SES.L.fila.length;
  est.completarCadastro();
  assert.equal(est.SES.L.fila.length, n);
});

test('conta de exemplo: 2 propriedades, 1 CPF e 1 CNPJ, lançamentos dos dois', () => {
  est.abrirSessao('u-exemplo', { email: est.EX.email, nome: 'Produtor' });
  /* como o servidor deixa a conta: o CPF padrão criado no cadastro, ainda sem documento */
  gravarLote(est.SES.L, [['entidades_fiscais', linha.entidade({ id: '00000000-0000-4000-8000-00000000e000', tipo: 'PF', nome: 'Produtor', cor: '#2f6b4f', regime: 'PF_ATIVIDADE_RURAL', padrao: true })]]);
  est.recarregar();
  est.prepararExemplo();
  const u = est.usuario();
  assert.equal(u.propriedades.length, 2);
  assert.ok(u.propriedades.every(p => !p.virtual && p.area_ha > 0 && p.nirf_cib && p.car));
  assert.equal(u.entidades.length, 2, 'reaproveita o CPF criado no cadastro');
  const cpf = u.entidades.find(e => e.tipo === 'PF'), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  assert.equal(cpf.id, '00000000-0000-4000-8000-00000000e000');
  assert.ok(cpfValido(cpf.documento) && cnpjValido(cnpj.documento));
  assert.ok(cpf.padrao && !cnpj.padrao);
  const sc = u.propriedades.find(p => p.uf === 'SC'), pr = u.propriedades.find(p => p.uf === 'PR');
  assert.deepEqual(sc.fazendas[0].vinculos.map(v => [v.entidade, v.percentual, v.padrao]), [[cpf.id, 70, true], [cnpj.id, 30, false]]);
  assert.deepEqual(pr.fazendas[0].vinculos.map(v => [v.entidade, v.padrao]), [[cnpj.id, true]]);
  const vSC = sc.dados.todas.vendas;
  assert.ok(vSC.some(v => v.entidade === cpf.id) && vSC.some(v => v.entidade === cnpj.id), 'Capão Alto vende pelos dois');
  assert.ok(sc.dados.todas.caixa.some(x => x.entidade === cnpj.id));
  assert.ok(pr.dados.todas.vendas.every(v => v.entidade === cnpj.id), 'Boa Esperança fatura só pelo CNPJ');
  /* entrar de novo não remonta (só regera depois de 7 dias) */
  const n = est.SES.L.fila.length;
  est.prepararExemplo();
  assert.equal(est.SES.L.fila.length, n);
});

test('regerar o exemplo mantém a divisão entre CPF e CNPJ', () => {
  const u = est.usuario(), f = u.fazendas.find(x => x.uf === 'SC'), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  est.regerarExemplo(f);
  const sc = est.usuario().propriedades.find(p => p.uf === 'SC');
  assert.ok(sc.dados.todas.vendas.some(v => v.entidade === cnpj.id));
});

test('telas: seletor de CPF/CNPJ filtra o financeiro e "Faturado por" vem com o padrão', () => {
  const u = est.usuario(), sc = u.propriedades.find(p => p.uf === 'SC'), cnpj = u.entidades.find(e => e.tipo === 'PJ');
  est.usarPropriedadeId(sc.id);
  est.E.modoCaixa = 'real';
  const html = V.caixa();
  assert.match(html, /Faturado por/);
  const marcado = html.match(/name="fat" value="([^"]+)" checked/)[1];
  assert.equal(marcado.split('|')[1], u.entidades.find(e => e.padrao).id);
  const total = sum(est.propAtual().dados.vendas, v => v.kg);
  est.definirEntidade(cnpj.id);
  assert.ok(sum(est.propAtual().dados.vendas, v => v.kg) < total);
  assert.equal(est.usuario().entidadeSel, cnpj.id);
  assert.equal(est.SES.L.meta.entidade, cnpj.id, 'a escolha fica guardada no cache do usuário');
  /* com o CNPJ escolhido no topo, ele vem marcado em "Faturado por" */
  assert.equal(V.caixa().match(/name="fat" value="([^"]+)" checked/)[1].split('|')[1], cnpj.id);
  est.definirEntidade(null);
  assert.equal(sum(est.propAtual().dados.vendas, v => v.kg), total);
});

test('telas: cadastros mostram propriedades, inscrições, vínculos e o aviso de soma acima de 100%', () => {
  const html = V.cadastros();
  assert.match(html, /CPFs e CNPJs/);
  assert.match(html, /529\.982\.247-25/);
  assert.match(html, /11\.222\.333\/0001-81/);
  assert.match(html, /IE 254123987/);
  assert.ok(!/passa de 100%/.test(html));
  const f = est.usuario().fazendas.find(x => x.uf === 'SC');
  gravarLote(est.SES.L, [['vinculos', { id: f.vinculos[1].id, percentual: 50 }]]);
  est.recarregar();
  assert.match(V.cadastros(), /passa de 100% \(120,00%\)/);
});
