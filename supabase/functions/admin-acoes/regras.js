/* Regras das ações administrativas, sem dependências (testadas com node --test). */
export const ACOES = ['bloquear', 'desbloquear'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* devolve a mensagem de erro do pedido, ou null se estiver certo */
export function validar(pedido, chamadorId) {
  const { acao, alvo, motivo } = pedido || {};
  if (!ACOES.includes(acao)) return 'Ação desconhecida.';
  if (!UUID.test(alvo || '')) return 'Usuário inválido.';
  if (alvo === chamadorId) return 'Você não pode fazer isso na sua própria conta.';
  if (String(motivo || '').trim().length < 3) return 'Informe o motivo.';
  return null;
}

/* origens que podem chamar a função pelo navegador */
const ORIGENS = ['https://yghor-pereira.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
export function cabecalhos(origem) {
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}
