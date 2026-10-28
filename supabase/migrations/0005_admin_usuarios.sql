-- Caderno da Resina: gestão de usuários na área administrativa
-- Leituras do admin por funções security definer que recusam quem não está em admins.
-- Ações que mudam a conta (bloquear, senha temporária) seguem na Edge Function admin-acoes.

-- o gatilho de 0003 decidia pelo papel do token (auth.role()); dentro de uma função security definer
-- o token continua "authenticated" e a função senha_trocada() seria barrada. Decide pelo papel
-- que executa o comando: o app (authenticated) não muda as colunas; funções do servidor e a chave de serviço mudam.
create or replace function public.proteger_perfil() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo := false; new.bloqueado := false; new.motivo_bloqueio := null; new.trocar_senha := false;
    else
      new.is_demo := old.is_demo; new.bloqueado := old.bloqueado;
      new.motivo_bloqueio := old.motivo_bloqueio; new.trocar_senha := old.trocar_senha;
    end if;
  end if;
  return new;
end $$;

-- depois de trocar a senha temporária, o próprio usuário desliga a troca obrigatória
create or replace function public.senha_trocada() returns void
language sql security definer set search_path = '' as $$
  update public.perfis set trocar_senha = false where id = auth.uid() and trocar_senha;
$$;
revoke all on function public.senha_trocada() from public, anon;
grant execute on function public.senha_trocada() to authenticated;

-- lista de usuários (ou um só, com p_id): cadastro, acesso, sessões e tempo de uso
create or replace function public.admin_usuarios(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Acesso restrito a administradores.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.criado_em desc) from (
      select u.id, coalesce(p.nome, '') as nome, u.email, u.created_at as criado_em, u.last_sign_in_at as ultimo_login,
             s.ultimo_acesso, coalesce(s.n, 0) as sessoes, coalesce(s.seg, 0) as segundos,
             coalesce(p.bloqueado, false) as bloqueado, p.motivo_bloqueio, coalesce(p.is_demo, false) as is_demo,
             coalesce(p.trocar_senha, false) as trocar_senha,
             exists (select 1 from public.admins a where a.user_id = u.id) as admin,
             (select count(*) from public.fazendas f where f.user_id = u.id and f.deleted_at is null) as fazendas
      from auth.users u
      left join public.perfis p on p.id = u.id
      left join lateral (select max(ultimo_sinal) as ultimo_acesso, count(*) as n, sum(segundos_ativos) as seg
                         from public.sessoes where user_id = u.id) s on true
      where p_id is null or u.id = p_id
    ) x), '[]'::jsonb);
end $$;

-- detalhe de um usuário: acessos, funções mais usadas, quantidade de registros (sem valores) e auditoria.
-- Abrir o detalhe também fica na auditoria (ver_detalhe), porque mostra dados de uso de uma pessoa.
create or replace function public.admin_usuario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text; n bigint; dados jsonb := '{}';
begin
  if not public.eh_admin() then raise exception 'Acesso restrito a administradores.' using errcode = '42501'; end if;
  foreach t in array array['fazendas','talhoes','ramais','estrias','coletas','vendas','recebimentos','lancamentos','compromissos'] loop
    execute format('select count(*) from public.%I where user_id = $1 and deleted_at is null', t) into n using p_id;
    dados := dados || jsonb_build_object(t, n);
  end loop;
  dados := dados || jsonb_build_object('fazendas_exemplo',
    (select count(*) from public.fazendas where user_id = p_id and deleted_at is null and demo));
  insert into public.auditoria (admin_id, acao, alvo_id) values (auth.uid(), 'ver_detalhe', p_id);
  return jsonb_build_object(
    'usuario', public.admin_usuarios(p_id)->0,
    'dados', dados,
    'acessos', coalesce((select jsonb_agg(to_jsonb(a) order by a.inicio desc) from (
        select inicio, ultimo_sinal, segundos_ativos, dispositivo from public.sessoes
        where user_id = p_id order by inicio desc limit 50) a), '[]'::jsonb),
    'funcoes', coalesce((select jsonb_agg(to_jsonb(f) order by f.n desc) from (
        select evento, case when evento = 'page_view' then coalesce(tela, '') || coalesce(':' || (props->>'modo'), '')
                            else coalesce(props->>'funcao', props->>'tabela', '') end as item,
               count(*) as n
        from public.eventos
        where user_id = p_id and criado_em > now() - interval '90 days' and evento not in ('app_open', 'login', 'logout')
        group by 1, 2 order by 3 desc limit 15) f), '[]'::jsonb),
    'auditoria', coalesce((select jsonb_agg(to_jsonb(a) order by a.criado_em desc) from (
        select a.criado_em, a.acao, a.motivo, ua.email as admin
        from public.auditoria a left join auth.users ua on ua.id = a.admin_id
        where a.alvo_id = p_id and a.acao <> 'ver_detalhe' order by a.criado_em desc limit 50) a), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_usuarios(uuid), public.admin_usuario(uuid) from public, anon;
grant execute on function public.admin_usuarios(uuid), public.admin_usuario(uuid) to authenticated;
