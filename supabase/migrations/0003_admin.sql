-- Caderno da Resina: papel de administrador, bloqueio de contas e trilha de auditoria
-- O papel de admin fica no banco (tabela admins). Esconder o menu no app é só aparência:
-- toda leitura ou ação de admin passa por função no servidor que confere eh_admin().

-- quem é administrador; ninguém lê ou grava pela API (só o servidor e o SQL Editor)
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  adicionado_por text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- toda ação administrativa: quem fez, o quê, em quem, quando e por quê
create table public.auditoria (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users,
  acao text not null,
  alvo_id uuid,
  motivo text not null default '',
  detalhes jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index auditoria_alvo on public.auditoria (alvo_id, criado_em desc);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;

-- estado da conta no perfil (o app lê junto com o nome); quem altera é só o servidor
alter table public.perfis
  add column is_demo boolean not null default false,
  add column bloqueado boolean not null default false,
  add column motivo_bloqueio text,
  add column trocar_senha boolean not null default false;

-- o produtor grava o próprio perfil (nome, funções); estas colunas ele não muda.
-- Vale também para versões antigas do app, que reenviam a linha inteira do cache.
create or replace function public.proteger_perfil() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo := false; new.bloqueado := false; new.motivo_bloqueio := null; new.trocar_senha := false;
    else
      new.is_demo := old.is_demo; new.bloqueado := old.bloqueado;
      new.motivo_bloqueio := old.motivo_bloqueio; new.trocar_senha := old.trocar_senha;
    end if;
  end if;
  return new;
end $$;
create trigger proteger before insert or update on public.perfis for each row execute function public.proteger_perfil();

-- a conta de exemplo é compartilhada: fica marcada para sair das métricas
update public.perfis set is_demo = true
where id in (select id from auth.users where email = 'produtor@exemplo.com');

-- encerra as sessões de uma conta bloqueada (só a Edge Function admin-acoes chama, com a chave de serviço)
create or replace function public.encerrar_sessoes(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.encerrar_sessoes(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_sessoes(uuid) to service_role;
