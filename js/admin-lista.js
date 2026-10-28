/* ---------- área administrativa: regras da lista de usuários e nomes legíveis ----------
   Sem DOM nem rede (testado com node --test). Quem decide o acesso é o servidor. */
import { plural } from './util.js';

const DIA = 864e5;
/* último sinal de uso; antes das métricas existirem, vale o último login */
const ultimoAcesso = u => u.ultimo_acesso || u.ultimo_login || null;
const diasDesde = (iso, agora = Date.now()) => iso ? Math.floor((agora - Date.parse(iso)) / DIA) : null;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FILTROS_PADRAO = {busca:'', status:'todos', cadastro:'todos', acesso:'todos', demo:false, ordem:'acesso'};

function filtrar(lista, f = FILTROS_PADRAO, agora = Date.now()){
  const q = semAcento(f.busca).trim();
  return lista.filter(u => {
    if (!f.demo && u.is_demo) return false;
    if (q && !semAcento(u.nome).includes(q) && !semAcento(u.email).includes(q)) return false;
    if (f.status === 'ativos' && u.bloqueado) return false;
    if (f.status === 'bloqueados' && !u.bloqueado) return false;
    if (f.cadastro !== 'todos' && diasDesde(u.criado_em, agora) > +f.cadastro) return false;
    const d = diasDesde(ultimoAcesso(u), agora);
    if (f.acesso === 'nunca') return d === null;
    if (f.acesso === 'inativos') return d === null || d > 30;
    if (f.acesso !== 'todos') return d !== null && d <= +f.acesso;
    return true;
  });
}

const ORDENS = {
  acesso: (a, b) => (ultimoAcesso(b) || '').localeCompare(ultimoAcesso(a) || ''),
  cadastro: (a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''),
  nome: (a, b) => semAcento(a.nome || a.email).localeCompare(semAcento(b.nome || b.email)),
  tempo: (a, b) => b.segundos - a.segundos,
  sessoes: (a, b) => b.sessoes - a.sessoes
};
const ordenar = (lista, chave = 'acesso') => [...lista].sort(ORDENS[chave] || ORDENS.acesso);

/* 0 min · 45 min · 2 h 05 min */
function duracao(seg){
  const m = Math.round((seg || 0) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
const data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
function quando(iso, agora = Date.now()){
  const d = diasDesde(iso, agora);
  return d === null ? 'nunca' : d < 1 ? 'hoje' : d === 1 ? 'ontem' : `há ${plural(d, 'dia', 'dias')}`;
}

/* nomes do catálogo de métricas na linguagem do produtor */
const NOMES_TELA = {fazendas:'Escolha de fazenda', geral:'Visão geral', conta:'Conta', senha:'Troca de senha', inicio:'Início',
  'caixa:real':'Caixa · realizado', 'caixa:comp':'Caixa · compromissos', 'floresta:ramais':'Floresta · talhões e ramais',
  'floresta:apontar':'Floresta · apontar', 'floresta:estrias':'Floresta · estrias', producao:'Produção', vendas:'Vendas', resultado:'Resultado'};
const NOMES_TABELA = {perfis:'perfil', fazendas:'fazenda', talhoes:'talhão', ramais:'ramal', contagens:'contagem de árvores', estrias:'estria',
  coletas:'coleta', vendas:'venda', recebimentos:'recebimento', lancamentos:'lançamento de caixa', compromissos:'compromisso', compradores:'comprador'};
const NOMES_FUNCAO = {dados_exemplo:'Começou com dados de exemplo', regerar_exemplo:'Regerou dados de exemplo', limpar_fazenda:'Apagou registros da fazenda',
  compromisso_pago:'Marcou compromisso como pago', regime_alterado:'Trocou o regime (Funrural/folha)', intervalo_alterado:'Mudou o intervalo ideal',
  funcao_ligada:'Ligou uma função', funcao_desligada:'Desligou uma função', safra_trocada:'Trocou a safra nos gráficos',
  nfe_emitida:'Emitiu NF-e', cnpj_consultado:'Consultou CNPJ', sincronizar_manual:'Sincronizou manualmente'};
const VERBO = {record_created:'Criou', record_updated:'Alterou', record_deleted:'Excluiu'};
function rotulo(evento, item){
  if (evento === 'page_view') return 'Abriu ' + (NOMES_TELA[item] || item);
  if (VERBO[evento]) return `${VERBO[evento]} ${NOMES_TABELA[item] || item}`;
  if (evento === 'feature_used') return NOMES_FUNCAO[item] || item;
  return item ? `${evento} · ${item}` : evento;
}
const NOMES_ACAO = {bloquear:'Bloqueou', desbloquear:'Desbloqueou', senha_temporaria:'Gerou senha temporária'};

const resumoUso = u => `${plural(u.sessoes, 'sessão', 'sessões')} · ${duracao(u.segundos)} de uso` + (u.sessoes ? ` · média ${duracao(u.segundos / u.sessoes)}` : '');

export { FILTROS_PADRAO, ultimoAcesso, diasDesde, filtrar, ordenar, duracao, dataHora, data, quando, rotulo, resumoUso,
  NOMES_TELA, NOMES_TABELA, NOMES_FUNCAO, NOMES_ACAO };
