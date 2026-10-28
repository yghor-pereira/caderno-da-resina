/* ---------- área administrativa (admin.html) ----------
   Página separada do app: o código de admin não é carregado para os produtores.
   Esconder o link é só aparência; toda leitura e ação passa por funções do servidor que conferem
   se quem chama está em public.admins (admin_usuarios, admin_usuario, Edge Function admin-acoes). */
import { esc, num } from './util.js';
import { conectar, sessao } from './nuvem.js';
import { FILTROS_PADRAO, ultimoAcesso, filtrar, ordenar, duracao, dataHora, data, quando, rotulo, resumoUso, NOMES_ACAO } from './admin-lista.js';

const raiz = document.getElementById('adm');
const A = {eu:null, lista:[], f:{...FILTROS_PADRAO}, det:null, acao:null, senha:null, erro:'', ocupado:false};
let cliente = null;

function aviso(html){ raiz.innerHTML = `<section class="card sec">${html}</section>`; }

async function iniciar(){
  const s = await sessao();
  if (s.estado === 'offline') return aviso('<p class="note">Sem internet. A área administrativa precisa de conexão.</p>');
  if (s.estado !== 'ok') return aviso('<p class="note">Entre no app com a sua conta de administrador e volte aqui.</p><a class="btn" href="./">Abrir o Caderno</a>');
  A.eu = s.session.user.id;
  cliente = await conectar();
  await carregarLista();
}
async function carregarLista(){
  const { data: lista, error } = await cliente.rpc('admin_usuarios');
  if (error) return aviso(error.code === '42501' ? '<p class="note">Acesso restrito a administradores.</p><a class="btn" href="./">Voltar ao app</a>'
    : `<p class="err">Não foi possível carregar os usuários (${esc(error.message)}).</p>`);
  A.lista = lista || [];
  render();
}
async function abrir(id){
  A.ocupado = true; render();
  const { data: det, error } = await cliente.rpc('admin_usuario', {p_id:id});
  A.ocupado = false;
  if (error) { A.erro = 'Não foi possível abrir o usuário: ' + error.message; return render(); }
  A.det = det; A.acao = null; A.senha = null; A.erro = '';
  render(); window.scrollTo(0, 0);
}

/* ---------- telas ---------- */
const sel = (id, rotuloTxt, opcoes, valor) => `<label>${rotuloTxt}<select data-f="${id}">${opcoes.map(([v, t]) => `<option value="${v}" ${v === valor ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const pills = u => [u.bloqueado ? '<span class="pill late">bloqueado</span>' : '', u.admin ? '<span class="pill nf">admin</span>' : '',
  u.is_demo ? '<span class="pill sem">exemplo</span>' : '', u.trocar_senha ? '<span class="pill pend">troca de senha</span>' : ''].join('');

function vLista(){
  const f = A.f, lista = ordenar(filtrar(A.lista, f), f.ordem);
  return `
  <section class="sec">
    <div class="sec-h"><h2>Usuários</h2><span class="note">${lista.length} de ${A.lista.filter(u => f.demo || !u.is_demo).length}</span></div>
    <form id="fFiltro" class="card" onsubmit="return false">
      <label class="full">Buscar por nome ou e-mail<input id="busca" type="search" value="${esc(f.busca)}" autocomplete="off"></label>
      ${sel('status', 'Situação', [['todos', 'Todos'], ['ativos', 'Ativos'], ['bloqueados', 'Bloqueados']], f.status)}
      ${sel('ordem', 'Ordenar por', [['acesso', 'Último acesso'], ['cadastro', 'Cadastro mais recente'], ['nome', 'Nome'], ['tempo', 'Tempo de uso'], ['sessoes', 'Sessões']], f.ordem)}
      ${sel('cadastro', 'Cadastro', [['todos', 'Qualquer data'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']], f.cadastro)}
      ${sel('acesso', 'Último acesso', [['todos', 'Qualquer'], ['7', 'Nos últimos 7 dias'], ['30', 'Nos últimos 30 dias'], ['inativos', 'Inativo há mais de 30 dias'], ['nunca', 'Nunca usou']], f.acesso)}
      <label class="ram full"><input type="checkbox" data-f="demo" ${f.demo ? 'checked' : ''}><span><b>Mostrar a conta de exemplo</b><small>Ela fica fora das métricas por padrão.</small></span></label>
    </form>
    ${A.erro ? `<p class="err">${esc(A.erro)}</p>` : ''}
    <div class="card list">${lista.map(u => `
      <button type="button" class="row adm-u" data-u="${u.id}" ${A.ocupado ? 'disabled' : ''}>
        <span class="t">${esc(u.nome || '(sem nome)')}${pills(u)}</span>
        <span class="a">${quando(ultimoAcesso(u))}</span>
        <span class="s">${esc(u.email)} · cadastro ${data(u.criado_em)}</span>
        <span class="s">${resumoUso(u)} · ${num(u.fazendas)} ${u.fazendas === 1 ? 'fazenda' : 'fazendas'}</span>
      </button>`).join('') || '<p class="note">Nenhum usuário com esses filtros.</p>'}</div>
  </section>`;
}

function vAcao(u){
  if (u.id === A.eu) return '<p class="note">Esta é a sua conta: as ações não se aplicam a ela.</p>';
  if (A.senha) return `<div class="box"><h3>Senha temporária de ${esc(u.nome || u.email)}</h3>
    <p class="adm-senha" id="senhaTemp">${esc(A.senha)}</p>
    <span class="note">Passe esta senha ao produtor agora. Ela não fica guardada e não aparece de novo. No próximo acesso ele cria uma senha nova.</span>
    <div class="hbtn"><button type="button" class="btn sm" data-copiar="1">Copiar</button><button type="button" class="btn sm ghost" data-fechar-senha="1">Pronto</button></div></div>`;
  if (A.acao) {
    const t = {bloquear:'Bloquear a conta', desbloquear:'Desbloquear a conta', senha_temporaria:'Gerar senha temporária'}[A.acao];
    const d = {bloquear:'O produtor sai de todos os aparelhos em até 15 minutos e não consegue entrar até ser desbloqueado. Os dados dele continuam guardados.',
      desbloquear:'O produtor volta a conseguir entrar com a senha dele.',
      senha_temporaria:'A senha atual deixa de valer e o produtor sai dos aparelhos. Você recebe uma senha temporária para passar a ele.'}[A.acao];
    return `<form id="fAcao" class="box">
      <h3 class="full">${t}</h3><span class="note full">${d}</span>
      <label class="full">Motivo (fica registrado)<textarea id="motivo" rows="2" required minlength="3" style="font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg)"></textarea></label>
      <p class="err full" id="aErr" hidden></p>
      <div class="hbtn full"><button class="btn sm" ${A.acao === 'bloquear' ? 'style="background:var(--bad)"' : ''} ${A.ocupado ? 'disabled' : ''}>Confirmar</button><button type="button" class="btn sm ghost" data-acao="">Cancelar</button></div>
    </form>`;
  }
  return `<div class="hbtn">${u.bloqueado ? '<button type="button" class="btn sm" data-acao="desbloquear">Desbloquear</button>'
    : '<button type="button" class="btn sm ghost" style="color:var(--bad);border-color:var(--bad)" data-acao="bloquear">Bloquear</button>'}
    <button type="button" class="btn sm ghost" data-acao="senha_temporaria">Gerar senha temporária</button></div>`;
}

function vDetalhe(){
  const {usuario:u, dados:d, acessos, funcoes, auditoria} = A.det;
  return `
  <button type="button" class="lnk" data-voltar="1" style="align-self:flex-start">← Voltar à lista</button>
  <section class="card sec">
    <div><h2>${esc(u.nome || '(sem nome)')}${pills(u)}</h2><span class="note">${esc(u.email)}</span></div>
    ${u.bloqueado ? `<p class="down" style="margin:0">Bloqueado: ${esc(u.motivo_bloqueio || '')}</p>` : ''}
    <dl class="kv"><dt>Cadastro</dt><dd>${dataHora(u.criado_em)}</dd><dt>Último login</dt><dd>${dataHora(u.ultimo_login)}</dd>
      <dt>Último acesso</dt><dd>${dataHora(u.ultimo_acesso)} (${quando(ultimoAcesso(u))})</dd>
      <dt>Uso</dt><dd>${resumoUso(u)}</dd></dl>
    ${vAcao(u)}
  </section>
  <section class="card sec">
    <h3>Registros cadastrados</h3>
    <dl class="kv">${[['fazendas', 'Fazendas'], ['talhoes', 'Talhões'], ['ramais', 'Ramais'], ['estrias', 'Estrias'], ['coletas', 'Coletas'], ['vendas', 'Vendas'],
      ['recebimentos', 'Recebimentos'], ['lancamentos', 'Lançamentos de caixa'], ['compromissos', 'Compromissos']].map(([k, t]) => `<dt>${t}</dt><dd>${num(d[k])}</dd>`).join('')}</dl>
    ${d.fazendas_exemplo ? `<span class="note">${d.fazendas_exemplo === 1 ? '1 fazenda está' : d.fazendas_exemplo + ' fazendas estão'} com dados de exemplo.</span>` : ''}
    <span class="note">Só quantidades: valores e descrições do produtor não aparecem aqui.</span>
  </section>
  <section class="card sec">
    <h3>Funções mais usadas (90 dias)</h3>
    <div class="list">${funcoes.map(x => `<div class="row"><span class="t" style="font-weight:400">${esc(rotulo(x.evento, x.item))}</span><span class="a">${num(x.n)}</span></div>`).join('') || '<p class="note">Nenhum uso registrado ainda.</p>'}</div>
  </section>
  <section class="card sec">
    <h3>Histórico de acessos</h3>
    <div class="list">${acessos.map(s => `<div class="row"><span class="t" style="font-weight:400">${dataHora(s.inicio)}</span><span class="a">${duracao(s.segundos_ativos)}</span>
      <span class="s">${esc(s.dispositivo)} · aberto por ${duracao((Date.parse(s.ultimo_sinal) - Date.parse(s.inicio)) / 1000)}</span></div>`).join('') || '<p class="note">Nenhum acesso registrado ainda.</p>'}</div>
  </section>
  <section class="card sec">
    <h3>Ações administrativas nesta conta</h3>
    <div class="list">${auditoria.map(a => `<div class="row"><span class="t" style="font-weight:400">${esc(NOMES_ACAO[a.acao] || a.acao)}</span><span class="a" style="font-weight:400">${data(a.criado_em)}</span>
      <span class="s">${esc(a.admin || '')} · ${esc(a.motivo)}</span></div>`).join('') || '<p class="note">Nenhuma.</p>'}</div>
  </section>`;
}

function render(){
  raiz.innerHTML = `<div class="sec" style="gap:14px">${A.det ? vDetalhe() : vLista()}</div>`;
}

/* ---------- ações ---------- */
async function executar(acao, motivo){
  const u = A.det.usuario;
  A.ocupado = true; render();
  const { data: r, error } = await cliente.functions.invoke('admin-acoes', {body:{acao, alvo:u.id, motivo}});
  A.ocupado = false;
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).erro || msg; } catch(e) {}
    render(); const p = document.getElementById('aErr'); if (p) { p.textContent = msg; p.hidden = false; }
    return;
  }
  A.acao = null;
  const senha = r?.senha || null;
  await abrir(u.id);
  A.senha = senha; render();
  const { data: lista } = await cliente.rpc('admin_usuarios');
  if (lista) A.lista = lista;
}

raiz.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.u) abrir(d.u);
  else if (d.voltar) { A.det = null; A.senha = null; A.acao = null; render(); }
  else if (d.acao !== undefined) { A.acao = d.acao || null; render(); document.getElementById('motivo')?.focus(); }
  else if (d.copiar) { try { await navigator.clipboard.writeText(A.senha); b.textContent = 'Copiada'; } catch(err) { b.textContent = 'Selecione e copie'; } }
  else if (d.fecharSenha) { A.senha = null; render(); }
});
raiz.addEventListener('input', e => {
  if (e.target.id !== 'busca') return;
  A.f.busca = e.target.value;
  const pos = e.target.selectionStart; render();
  const el = document.getElementById('busca'); el.focus(); el.setSelectionRange(pos, pos);
});
raiz.addEventListener('change', e => {
  const k = e.target.dataset.f; if (!k) return;
  A.f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  render();
});
raiz.addEventListener('submit', e => {
  if (e.target.id !== 'fAcao') return;
  e.preventDefault();
  executar(A.acao, document.getElementById('motivo').value.trim());
});

iniciar();

export { A, vLista, vDetalhe };   // usados no teste de fumaça
