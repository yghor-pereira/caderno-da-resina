-- Caderno da Resina: esquema inicial
-- Cada linha pertence a um usuário (user_id). A RLS garante que cada um só lê e grava o que é seu.
-- Exclusão é lógica (deleted_at), para que a exclusão chegue aos outros aparelhos na sincronização.
-- updated_at é sempre gravado pelo servidor; é por ele que os aparelhos buscam o que mudou.

create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- perfil do usuário: nome e funções habilitadas
create table public.perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null default '',
  modulos jsonb not null default '{"caixa":true,"floresta":true,"producao":true,"vendas":true,"nfe":true,"resultado":true}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.fazendas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  ie text not null,
  doc text not null default '',
  municipio text not null default '',
  uf char(2) not null,
  regime text not null default 'funrural' check (regime in ('funrural','folha')),
  saldo_inicial numeric(14,2) not null default 0,
  intervalo_ideal int not null default 14 check (intervalo_ideal between 7 and 30),
  demo boolean not null default false,
  demo_gerado_em date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index fazendas_ie_unica on public.fazendas (ie) where deleted_at is null;

create table public.talhoes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  nome text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.ramais (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  talhao_id uuid not null references public.talhoes,
  cod text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- histórico da contagem de árvores do ramal; a vigente é a de data mais recente
create table public.contagens (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ramal_id uuid not null references public.ramais,
  data date not null,
  arvores int not null check (arvores >= 0),
  motivo text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.estrias (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  talhao_id uuid not null references public.talhoes,
  data date not null,
  ramais uuid[] not null default '{}',
  qtd int not null,
  resineiro text not null default '',
  dias numeric(6,1) not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- coleta: o kg é rateado entre os ramais coletados pelo nº de árvores (no app)
create table public.coletas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  talhao_id uuid not null references public.talhoes,
  data date not null,
  ramais uuid[] not null default '{}',
  kg numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- fator = preço livre ÷ preço de venda no regime da época (Funrural 0,9837; folha 0,998)
create table public.vendas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  data date not null,
  comprador text not null,
  kg numeric(12,2) not null check (kg > 0),
  preco numeric(12,4) not null check (preco > 0),
  fator numeric(6,4) not null,
  com_nota boolean not null default false,
  nf jsonb,
  venc date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.recebimentos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  venda_id uuid not null references public.vendas,
  data date not null,
  valor numeric(14,2) not null,
  forma text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- caixa realizado
create table public.lancamentos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  data date not null,
  tipo char(1) not null check (tipo in ('d','r')),
  cat text not null,
  descr text not null default '',
  valor numeric(14,2) not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- compromissos futuros (entram no fluxo de caixa previsto)
create table public.compromissos (like public.lancamentos including all);
alter table public.compromissos add foreign key (fazenda_id) references public.fazendas;
alter table public.compromissos add foreign key (user_id) references auth.users on delete cascade;

create table public.compradores (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  nome text not null,
  doc text not null default '',
  dest jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- triggers, índices de sincronização e RLS em todas as tabelas de dados
do $$
declare t text;
begin
  foreach t in array array['fazendas','talhoes','ramais','contagens','estrias','coletas','vendas','recebimentos','lancamentos','compromissos','compradores'] loop
    execute format('create trigger tocar before insert or update on public.%I for each row execute function public.tocar_updated_at()', t);
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_sinc', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ler on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy alterar on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create trigger tocar before insert or update on public.perfis for each row execute function public.tocar_updated_at();
alter table public.perfis enable row level security;
create policy ler on public.perfis for select to authenticated using (id = auth.uid());
create policy criar on public.perfis for insert to authenticated with check (id = auth.uid());
create policy alterar on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.perfis from anon, authenticated;
grant select, insert, update on public.perfis to authenticated;

-- perfil criado junto com o usuário, com o nome e as funções escolhidas no cadastro
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome, modulos)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(new.raw_user_meta_data->'modulos', '{"caixa":true,"floresta":true,"producao":true,"vendas":true,"nfe":true,"resultado":true}'::jsonb));
  return new;
end $$;
create trigger criar_perfil after insert on auth.users for each row execute function public.criar_perfil();

-- a Inscrição Estadual é única entre todas as contas; a RLS esconde fazendas alheias,
-- então o app pergunta por aqui (responde só sim ou não, sem expor dados de ninguém)
create or replace function public.ie_disponivel(p_ie text, p_ignorar uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.fazendas
    where ie = p_ie and deleted_at is null and (p_ignorar is null or id <> p_ignorar)
  );
$$;
revoke all on function public.ie_disponivel(text, uuid) from public, anon;
grant execute on function public.ie_disponivel(text, uuid) to authenticated;
