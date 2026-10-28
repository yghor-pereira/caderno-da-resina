/* ---------- métricas de uso (telemetria) ----------
   Registra QUE o produtor usou uma tela ou função, nunca o conteúdo (valores, descrições, nomes).
   Tudo vai para uma fila própria no aparelho (separada do cache de dados) e segue em lote para o
   servidor junto com a sincronização; funciona sem sinal. Qualquer falha aqui é engolida:
   métrica nunca pode atrapalhar o app. Catálogo e como adicionar eventos: docs/metricas.md */
import { uid } from './util.js';

const PREFIXO = 'caderno-resina-metricas:';
const MAX_FILA = 1000, LOTE = 300;
const ATIVO_MS = 2*60e3;          // sem toque ou tecla por 2 min, o tempo de uso para de contar
const NOVA_SESSAO_MS = 30*60e3;   // parado por 30 min, a próxima atividade abre outra sessão
const TIQUE_MAX_MS = 60e3;        // um intervalo entre sinais nunca conta mais que isso

/* catálogo completo: o painel cruza com ele para mostrar também o que teve zero uso */
const CATALOGO = {
  eventos: ['app_open', 'login', 'logout', 'page_view', 'record_created', 'record_updated', 'record_deleted', 'feature_used', 'export'],
  telas: ['fazendas', 'geral', 'conta', 'inicio', 'caixa:real', 'caixa:comp', 'floresta:ramais', 'floresta:apontar', 'floresta:estrias', 'producao', 'vendas', 'resultado'],
  tabelas: ['perfis', 'fazendas', 'talhoes', 'ramais', 'contagens', 'estrias', 'coletas', 'vendas', 'recebimentos', 'lancamentos', 'compromissos', 'compradores'],
  funcoes: ['dados_exemplo', 'regerar_exemplo', 'limpar_fazenda', 'compromisso_pago', 'regime_alterado', 'intervalo_alterado',
    'funcao_ligada', 'funcao_desligada', 'safra_trocada', 'nfe_emitida', 'cnpj_consultado', 'sincronizar_manual']
};

let M = null;          // {userId, arm, fila, sessoes, atual, tela, ultimaAtividade, ultimoTique}
let enviando = false;
const iso = t => new Date(t).toISOString();

/* "Android · Chrome · app": só o necessário para saber em que tipo de aparelho o app é usado */
function dispositivo(ua = globalThis.navigator?.userAgent || '', instalado = false){
  const so = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'outro';
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'outro';
  return `${so} · ${nav} · ${instalado ? 'app' : 'navegador'}`;
}
const instalado = () => { try { return globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true; } catch(e) { return false; } };

/* só valores curtos e sem espaço (nomes de tela, tabela, função), verdadeiro/falso e inteiros:
   texto livre e valores em reais não passam */
function limpar(props){
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    if (typeof v === 'boolean' || (Number.isInteger(v) && Math.abs(v) < 1e6)) out[k] = v;
    else if (typeof v === 'string' && /^[a-z0-9_:-]{1,40}$/i.test(v)) out[k] = v;
  }
  return out;
}

function guardar(){
  try { M.arm.setItem(PREFIXO+M.userId, JSON.stringify({fila:M.fila, sessoes:M.sessoes})); } catch(e) {}
}
function novaSessao(t){
  const s = {id:uid(), inicio:iso(t), ultimo_sinal:iso(t), segundos_ativos:0, dispositivo:dispositivo(undefined, instalado()), sujo:true};
  M.sessoes[s.id] = s; M.atual = s.id; M.ultimaAtividade = t; M.ultimoTique = t;
}
/* abre as métricas do usuário logado e começa uma sessão de uso */
function abrirMetricas(userId, {arm = globalThis.localStorage, agora = Date.now()} = {}){
  try {
    let d = null;
    try { d = JSON.parse(arm.getItem(PREFIXO+userId)); } catch(e) {}
    M = {userId, arm, fila:d?.fila || [], sessoes:d?.sessoes || {}, atual:null, tela:null};
    novaSessao(agora); guardar();
  } catch(e) { M = null; }
}
function fecharMetricas(){ if (M) guardar(); M = null; }
function apagarMetricas(userId, arm = globalThis.localStorage){ try { arm.removeItem(PREFIXO+userId); } catch(e) {} }

/* toque, tecla ou rolagem: mantém o tempo contando (ou abre sessão nova depois de muito parado) */
function atividade(agora = Date.now()){
  if (!M) return;
  if (agora - M.ultimaAtividade > NOVA_SESSAO_MS) novaSessao(agora);
  else M.ultimaAtividade = agora;
}
/* chamado a cada 15 s e quando a aba some ou volta: soma o intervalo se a aba está visível e houve uso recente */
function tique(visivel, agora = Date.now()){
  try {
    if (!M) return;
    const s = M.sessoes[M.atual], passou = Math.min(agora - M.ultimoTique, TIQUE_MAX_MS);
    if (visivel && agora - M.ultimaAtividade <= ATIVO_MS && passou > 0) {
      s.segundos_ativos += Math.round(passou/1000); s.ultimo_sinal = iso(agora); s.sujo = true; guardar();
    }
    M.ultimoTique = agora;
  } catch(e) {}
}

/* registra um evento do catálogo; props.tela vira a coluna tela (page_view muda a tela atual) */
function track(evento, props = {}, agora = Date.now()){
  try {
    if (!M) return;
    atividade(agora);
    const {tela, ...resto} = props;
    if (evento === 'page_view' && tela) M.tela = tela;
    M.fila.push({id:uid(), evento, tela:tela || M.tela, props:limpar(resto), criado_em:iso(agora), sessao_id:M.atual});
    if (M.fila.length > MAX_FILA) M.fila.splice(0, M.fila.length - MAX_FILA);
    guardar();
  } catch(e) {}
}

/* envia um lote; devolve true se o servidor recebeu (ou não havia nada). Nunca lança erro. */
async function enviarMetricas(cliente){
  const m = M;
  if (!m || enviando) return false;
  const eventos = m.fila.slice(0, LOTE);
  const sessoes = Object.values(m.sessoes).filter(s=>s.sujo).map(({sujo, ...s})=>s);
  if (!eventos.length && !sessoes.length) return true;
  enviando = true;
  try {
    let erro;
    try { erro = (await cliente.rpc('registrar_uso', {p_eventos:eventos, p_sessoes:sessoes})).error; }
    catch(e) { return false; }
    /* lote com dado inválido não pode travar a fila para sempre: descarta; rede ou sessão: tenta depois */
    if (erro && !/^(22|23)/.test(erro.code || '')) return false;
    const enviados = new Set(eventos.map(e=>e.id));
    m.fila = m.fila.filter(e=>!enviados.has(e.id));
    for (const s of sessoes) {
      const atual = m.sessoes[s.id];
      if (atual && atual.segundos_ativos === s.segundos_ativos && atual.ultimo_sinal === s.ultimo_sinal) atual.sujo = false;   // mudou durante o envio: vai de novo
      if (atual && !atual.sujo && s.id !== m.atual) delete m.sessoes[s.id];
    }
    try { m.arm.setItem(PREFIXO+m.userId, JSON.stringify({fila:m.fila, sessoes:m.sessoes})); } catch(e) {}
    return !erro;
  } finally { enviando = false; }
}
const estadoMetricas = () => M;

export { CATALOGO, dispositivo, limpar, abrirMetricas, fecharMetricas, apagarMetricas, atividade, tique, track, enviarMetricas, estadoMetricas };
