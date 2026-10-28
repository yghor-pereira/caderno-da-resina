// Ações administrativas que precisam da chave de serviço (ela só existe aqui, no servidor).
// Quem chama manda o próprio token; a função confere em public.admins que é admin
// e grava cada ação em public.auditoria.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { validar, cabecalhos } from './regras.js';

const URL = Deno.env.get('SUPABASE_URL')!;
const servico = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BLOQUEIO = '876000h';   // 100 anos: o Supabase não tem bloqueio sem prazo

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('origin') || '');
  const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

  // quem está chamando: o token precisa ser de um usuário logado e cadastrado em admins
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: quem } = await servico.auth.getUser(token);
  if (!quem?.user) return resposta(401, { erro: 'Entre de novo.' });
  const { data: adm } = await servico.from('admins').select('user_id').eq('user_id', quem.user.id).maybeSingle();
  if (!adm) return resposta(403, { erro: 'Acesso restrito a administradores.' });

  let pedido;
  try { pedido = await req.json(); } catch { return resposta(400, { erro: 'Pedido inválido.' }); }
  const erro = validar(pedido, quem.user.id);
  if (erro) return resposta(400, { erro });
  const { acao, alvo } = pedido, motivo = String(pedido.motivo).trim();

  const { data: alvoU, error: eAlvo } = await servico.auth.admin.getUserById(alvo);
  if (eAlvo || !alvoU?.user) return resposta(404, { erro: 'Usuário não encontrado.' });

  const detalhes: Record<string, unknown> = { email: alvoU.user.email };
  if (acao === 'bloquear') {
    const { error } = await servico.auth.admin.updateUserById(alvo, { ban_duration: BLOQUEIO });
    if (error) return resposta(500, { erro: 'Não foi possível bloquear: ' + error.message });
    await servico.from('perfis').update({ bloqueado: true, motivo_bloqueio: motivo }).eq('id', alvo);
    const { data: n } = await servico.rpc('encerrar_sessoes', { p_user: alvo });
    detalhes.sessoes_encerradas = n ?? 0;
  } else {
    const { error } = await servico.auth.admin.updateUserById(alvo, { ban_duration: 'none' });
    if (error) return resposta(500, { erro: 'Não foi possível desbloquear: ' + error.message });
    await servico.from('perfis').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', alvo);
  }
  await servico.from('auditoria').insert({ admin_id: quem.user.id, acao, alvo_id: alvo, motivo, detalhes });
  return resposta(200, { ok: true, ...detalhes });
});
