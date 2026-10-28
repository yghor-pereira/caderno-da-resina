/* Regras das ações administrativas, sem dependências (testadas com node --test). */
export const ACOES = ['bloquear', 'desbloquear', 'senha_temporaria'];
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

/* senha temporária fácil de digitar no celular: 12 letras minúsculas e números, sem os parecidos
   (0/o, 1/l/i), em 3 grupos (ex.: kx7m-p3qa-9tnc). ~59 bits; vale até o produtor trocar no primeiro login. */
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';
export function senhaTemporaria(aleatorio = n => crypto.getRandomValues(new Uint8Array(n))) {
  const out = [];
  while (out.length < 12) for (const b of aleatorio(16)) if (b < 248 && out.length < 12) out.push(LETRAS[b % LETRAS.length]);   // 248 = 8 × 31: sem viés
  return [0, 4, 8].map(i => out.slice(i, i + 4).join('')).join('-');
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
