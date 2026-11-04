-- Caderno da Resina: cadastro administrativo-financeiro global, separado das fazendas
--
-- Dois cadastros, de certa forma desvinculados:
--   Operacional   fazendas (o imóvel: área, NIRF/CIB, CAR), talhões, ramais, estrias, coletas e perdas.
--   Financeiro    global: CPFs e CNPJs (entidades_fiscais), as Inscrições Estaduais de cada um,
--                 contas bancárias (com saldo inicial), contas a pagar e a receber.
-- Lançamentos e compromissos têm o CPF/CNPJ e a fazenda OPCIONAL (vazia = despesa ou receita geral).
-- A venda sai de uma fazenda (obrigatória) e é emitida por um CPF/CNPJ e uma das inscrições dele.
-- O regime Funrural/folha passa a ser do CPF/CNPJ (quem emite a nota). A IE deixa de ser da fazenda.
-- Em lancamentos, `data` é a data do pagamento (regime de caixa); data_competencia é opcional.
--
-- Retrocompatível e idempotente: pode rodar mais de uma vez. O app antigo continua gravando;
-- os gatilhos preenchem CPF/CNPJ, competência e categoria do IR.

-- ---------- tabelas novas ----------
create table if not exists public.entidades_fiscais (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tipo text not null default 'PF' check (tipo in ('PF','PJ')),
  nome text not null,
  apelido text not null default '',
  cor text not null default '#2f6b4f' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  documento text not null default '' check (documento ~ '^([0-9]{11}|[0-9]{14})?$'),
  regime text not null default 'PF_ATIVIDADE_RURAL' check (regime in ('PF_ATIVIDADE_RURAL','SIMPLES','PRESUMIDO','REAL')),
  previdencia text not null default 'funrural' check (previdencia in ('funrural','folha')),
  padrao boolean not null default false,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- documento vazio é aceito (a preencher); preenchido, CPF é de PF e CNPJ é de PJ
  check (documento = '' or (tipo = 'PF') = (length(documento) = 11))
);
create unique index if not exists entidades_documento_unico on public.entidades_fiscais (user_id, documento)
  where deleted_at is null and documento <> '';

-- Inscrições Estaduais de cada CPF/CNPJ. Como antes, a IE é única entre todas as contas.
create table if not exists public.inscricoes_estaduais (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entidade_id uuid not null references public.entidades_fiscais,
  ie text not null check (ie ~ '^[0-9]{8,14}$'),
  uf char(2) not null,
  municipio text not null default '',
  descricao text not null default '',
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists inscricoes_ie_unica on public.inscricoes_estaduais (ie) where deleted_at is null;

-- contas bancárias: cada uma de um CPF/CNPJ, com o saldo do dia em que o produtor começou a usar o app
create table if not exists public.contas_bancarias (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entidade_id uuid not null references public.entidades_fiscais,
  banco text not null default '',
  agencia text not null default '',
  conta text not null default '',
  apelido text not null default '',
  saldo_inicial numeric(14,2) not null default 0,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- perdas de resina da fazenda (kg). Árvores perdidas continuam na recontagem do ramal (contagens.motivo).
create table if not exists public.perdas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  talhao_id uuid references public.talhoes,
  data date not null,
  kg numeric(12,2) not null check (kg > 0),
  motivo text not null default '',
  obs text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- rateio de um lançamento entre fazendas (modelo pronto; uso nos relatórios).
-- lancamento_id aponta para lancamentos ou compromissos (coluna tabela), por isso sem chave estrangeira.
create table if not exists public.rateios (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tabela text not null default 'lancamentos' check (tabela in ('lancamentos','compromissos')),
  lancamento_id uuid not null,
  fazenda_id uuid not null references public.fazendas,
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists rateios_lancamento on public.rateios (lancamento_id);

-- ---------- colunas novas e afrouxadas nas tabelas existentes ----------
alter table public.fazendas
  add column if not exists area_ha numeric(12,2) check (area_ha is null or area_ha >= 0),
  add column if not exists nirf_cib text not null default '',
  add column if not exists car text not null default '';
-- a IE agora é do CPF/CNPJ; a coluna da fazenda fica só para o app antigo
alter table public.fazendas alter column ie drop not null;

do $$
declare t text;
begin
  foreach t in array array['lancamentos','compromissos'] loop
    execute format('alter table public.%I alter column fazenda_id drop not null', t);   -- fazenda opcional
    execute format($f$
      alter table public.%1$I
        add column if not exists entidade_id uuid references public.entidades_fiscais,
        add column if not exists data_competencia date,
        add column if not exists tipo_documento text check (tipo_documento in ('NF','NFP','FATURA','RECIBO','CONTRATO','FOLHA','OUTROS')),
        add column if not exists numero_documento text not null default '',
        add column if not exists contraparte_documento text not null default '' check (contraparte_documento ~ '^([0-9]{11}|[0-9]{14})?$'),
        add column if not exists contraparte_nome text not null default '',
        add column if not exists categoria_irpf text check (categoria_irpf in ('RECEITA_RURAL','CUSTEIO','INVESTIMENTO','NAO_DEDUTIVEL')),
        add column if not exists conta_bancaria_id uuid references public.contas_bancarias,
        add column if not exists anexo_url text
    $f$, t);
  end loop;
end $$;

alter table public.vendas
  add column if not exists entidade_id uuid references public.entidades_fiscais,
  add column if not exists inscricao_id uuid references public.inscricoes_estaduais,
  add column if not exists tipo_documento text check (tipo_documento in ('NF','NFP','FATURA','RECIBO','CONTRATO','FOLHA','OUTROS')),
  add column if not exists numero_documento text not null default '';
alter table public.recebimentos add column if not exists conta_bancaria_id uuid references public.contas_bancarias;
-- compradores passam a ser globais (a fazenda fica só no cadastro antigo)
alter table public.compradores alter column fazenda_id drop not null;

-- ---------- sincronização e RLS nas tabelas novas (mesmo padrão das outras) ----------
do $$
declare t text;
begin
  foreach t in array array['entidades_fiscais','inscricoes_estaduais','contas_bancarias','perdas','rateios'] loop
    execute format('create or replace trigger tocar before insert or update on public.%I for each row execute function public.tocar_updated_at()', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at, id)', t || '_sinc_id', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists criar on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy alterar on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- gatilhos e funções ----------
-- um só CPF/CNPJ padrão por produtor: marcar um desmarca os outros
create or replace function public.padrao_unico() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.padrao and new.deleted_at is null then
    update public.entidades_fiscais set padrao = false where user_id = new.user_id and id <> new.id and padrao;
  end if;
  return null;
end $$;
create or replace trigger padrao_unico after insert or update of padrao, deleted_at on public.entidades_fiscais
  for each row execute function public.padrao_unico();

create or replace function public.entidade_padrao(p_user uuid) returns uuid
language sql stable set search_path = '' as $$
  select id from public.entidades_fiscais where user_id = p_user and padrao and deleted_at is null limit 1;
$$;

-- o app antigo grava sem os campos novos: CPF/CNPJ padrão, competência = pagamento, categoria do IR pelo tipo
create or replace function public.preencher_lancamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.entidade_id is null then new.entidade_id := public.entidade_padrao(new.user_id); end if;
  if tg_table_name in ('lancamentos','compromissos') then
    new.data_competencia := coalesce(new.data_competencia, new.data);
    new.categoria_irpf := coalesce(new.categoria_irpf, case when new.tipo = 'r' then 'RECEITA_RURAL' else 'CUSTEIO' end);
  end if;
  return new;
end $$;
create or replace trigger preencher before insert or update on public.lancamentos for each row execute function public.preencher_lancamento();
create or replace trigger preencher before insert or update on public.compromissos for each row execute function public.preencher_lancamento();
create or replace trigger preencher before insert or update on public.vendas for each row execute function public.preencher_lancamento();

-- cadastro novo: perfil e CPF padrão (com o nome do cadastro e o documento a preencher)
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nome text := coalesce(new.raw_user_meta_data->>'nome', '');
begin
  insert into public.perfis (id, nome, modulos)
  values (new.id, nome,
          coalesce(new.raw_user_meta_data->'modulos', '{"caixa":true,"floresta":true,"producao":true,"vendas":true,"nfe":true,"resultado":true}'::jsonb));
  insert into public.entidades_fiscais (id, user_id, tipo, nome, padrao)
  values (gen_random_uuid(), new.id, 'PF', coalesce(nullif(nome, ''), 'Meu CPF'), true);
  return new;
end $$;
revoke execute on function public.criar_perfil() from public, anon, authenticated;

-- a IE é única entre todas as contas: responde se OUTRA conta já usa a IE (nas inscrições ou nas fazendas antigas).
-- Repetição na própria conta o app confere; a IE da fazenda antiga foi copiada para uma inscrição do mesmo produtor,
-- e o app antigo, que pergunta ao salvar a fazenda, não pode ver a própria IE como ocupada.
create or replace function public.ie_disponivel(p_ie text, p_ignorar uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.inscricoes_estaduais
    where ie = p_ie and deleted_at is null and user_id <> auth.uid()
  ) and not exists (
    select 1 from public.fazendas
    where ie = p_ie and deleted_at is null and user_id <> auth.uid() and (p_ignorar is null or id <> p_ignorar)
  );
$$;
revoke all on function public.ie_disponivel(text, uuid) from public, anon;
grant execute on function public.ie_disponivel(text, uuid) to authenticated;

-- ---------- dados que já existem ----------
-- 1. CPF padrão para quem ainda não tem nenhum. O documento vem da fazenda quando todas usam o mesmo CPF;
--    o regime Funrural/folha é o mais usado nas fazendas dele.
insert into public.entidades_fiscais (id, user_id, tipo, nome, documento, previdencia, padrao)
select gen_random_uuid(), p.id, 'PF', coalesce(nullif(p.nome, ''), 'Meu CPF'), coalesce(d.doc, ''), coalesce(r.regime, 'funrural'), true
from public.perfis p
left join lateral (
  select case when count(distinct f.doc) = 1 then min(f.doc) end as doc
  from public.fazendas f where f.user_id = p.id and f.deleted_at is null and f.doc ~ '^[0-9]{11}$'
) d on true
left join lateral (
  select f.regime from public.fazendas f where f.user_id = p.id and f.deleted_at is null
  group by f.regime order by count(*) desc limit 1
) r on true
where not exists (select 1 from public.entidades_fiscais e where e.user_id = p.id);

-- 2. a IE de cada fazenda vira uma inscrição do CPF padrão
insert into public.inscricoes_estaduais (id, user_id, entidade_id, ie, uf, municipio, descricao)
select gen_random_uuid(), f.user_id, e.id, f.ie, f.uf, f.municipio, f.nome
from public.fazendas f
join public.entidades_fiscais e on e.user_id = f.user_id and e.padrao and e.deleted_at is null
where f.deleted_at is null and f.ie ~ '^[0-9]{8,14}$'
  and not exists (select 1 from public.inscricoes_estaduais i where i.ie = f.ie and i.deleted_at is null);

-- 3. uma "Conta principal" do CPF padrão, com a soma dos saldos iniciais das fazendas
insert into public.contas_bancarias (id, user_id, entidade_id, apelido, saldo_inicial)
select gen_random_uuid(), e.user_id, e.id, 'Conta principal',
       coalesce((select sum(f.saldo_inicial) from public.fazendas f where f.user_id = e.user_id and f.deleted_at is null), 0)
from public.entidades_fiscais e
where e.padrao and e.deleted_at is null
  and not exists (select 1 from public.contas_bancarias c where c.user_id = e.user_id);

-- 4. lançamentos, compromissos, vendas e recebimentos: CPF/CNPJ, conta, inscrição, competência e categoria do IR
--    (só as linhas ativas, para não reenviar apagadas aos aparelhos)
create or replace function public.conta_principal(p_user uuid) returns uuid
language sql stable set search_path = '' as $$
  select c.id from public.contas_bancarias c
  join public.entidades_fiscais e on e.id = c.entidade_id and e.padrao
  where c.user_id = p_user and c.deleted_at is null order by c.apelido = 'Conta principal' desc limit 1;
$$;
update public.lancamentos set entidade_id = coalesce(entidade_id, public.entidade_padrao(user_id)),
       conta_bancaria_id = coalesce(conta_bancaria_id, public.conta_principal(user_id))
 where deleted_at is null and (entidade_id is null or conta_bancaria_id is null or data_competencia is null or categoria_irpf is null);
update public.compromissos set entidade_id = coalesce(entidade_id, public.entidade_padrao(user_id))
 where deleted_at is null and (entidade_id is null or data_competencia is null or categoria_irpf is null);
update public.vendas v set entidade_id = coalesce(v.entidade_id, public.entidade_padrao(v.user_id)),
       inscricao_id = coalesce(v.inscricao_id, (select i.id from public.inscricoes_estaduais i join public.fazendas f on f.ie = i.ie
                                                 where f.id = v.fazenda_id and i.user_id = v.user_id and i.deleted_at is null limit 1))
 where v.deleted_at is null and (v.entidade_id is null or v.inscricao_id is null);
update public.recebimentos set conta_bancaria_id = public.conta_principal(user_id)
 where deleted_at is null and conta_bancaria_id is null;
