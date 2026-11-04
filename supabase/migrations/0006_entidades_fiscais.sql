-- Caderno da Resina: propriedades, CPFs/CNPJs (entidades fiscais) e vínculos com as inscrições
--
-- Modelo:
--   propriedades        o imóvel rural (NIRF/CIB, CAR, área). Junta uma ou mais fazendas.
--   fazendas            continua sendo a Inscrição Estadual, com talhões e ramais; ganha propriedade_id.
--   entidades_fiscais   quem fatura: CPF (PF) ou CNPJ (PJ). Uma é a padrão do produtor.
--   vinculos            CPF/CNPJ × inscrição (N:N): percentual, condição, vigência e a padrão da inscrição.
--   contas_bancarias    contas de cada CPF/CNPJ.
--   rateios             divisão de um lançamento entre inscrições e CPFs/CNPJs (modelo pronto; uso na fase 2).
-- Lançamentos, compromissos e vendas ganham entidade_id (quem faturou) e os campos do livro caixa.
-- Em lancamentos, `data` é a data do pagamento (regime de caixa); data_competencia é opcional.
--
-- Retrocompatível e idempotente: pode rodar mais de uma vez. Aparelhos com a versão antiga do app
-- continuam gravando sem os campos novos; os gatilhos preenchem a entidade e a propriedade.

-- ---------- tabelas novas ----------
create table if not exists public.propriedades (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  municipio text not null default '',
  uf char(2) not null,
  area_ha numeric(12,2) check (area_ha is null or area_ha >= 0),
  nirf_cib text not null default '',
  car text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.entidades_fiscais (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tipo text not null default 'PF' check (tipo in ('PF','PJ')),
  nome text not null,
  apelido text not null default '',
  cor text not null default '#2f6b4f' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  documento text not null default '' check (documento ~ '^([0-9]{11}|[0-9]{14})?$'),
  regime text not null default 'PF_ATIVIDADE_RURAL' check (regime in ('PF_ATIVIDADE_RURAL','SIMPLES','PRESUMIDO','REAL')),
  padrao boolean not null default false,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- documento vazio é aceito (a preencher); preenchido, CPF é de PF e CNPJ é de PJ
  check (documento = '' or (tipo = 'PF') = (length(documento) = 11))
);
create unique index if not exists entidades_documento_unico on public.entidades_fiscais (user_id, documento)
  where deleted_at is null and documento <> '';

create table if not exists public.contas_bancarias (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entidade_id uuid not null references public.entidades_fiscais,
  banco text not null default '',
  agencia text not null default '',
  conta text not null default '',
  apelido text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.vinculos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fazenda_id uuid not null references public.fazendas,
  entidade_id uuid not null references public.entidades_fiscais,
  percentual numeric(5,2) not null default 100 check (percentual between 0 and 100),
  condicao text not null default 'PROPRIETARIO' check (condicao in ('PROPRIETARIO','ARRENDATARIO','PARCEIRO','COMODATARIO','CONDOMINIO')),
  padrao boolean not null default false,
  vigencia_inicio date,
  vigencia_fim date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create unique index if not exists vinculos_unico on public.vinculos (fazenda_id, entidade_id) where deleted_at is null;

-- lancamento_id aponta para lancamentos ou compromissos (coluna tabela), por isso sem chave estrangeira
create table if not exists public.rateios (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tabela text not null default 'lancamentos' check (tabela in ('lancamentos','compromissos')),
  lancamento_id uuid not null,
  fazenda_id uuid not null references public.fazendas,
  entidade_id uuid not null references public.entidades_fiscais,
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists rateios_lancamento on public.rateios (lancamento_id);

-- ---------- colunas novas nas tabelas existentes ----------
alter table public.fazendas add column if not exists propriedade_id uuid references public.propriedades;

do $$
declare t text;
begin
  foreach t in array array['lancamentos','compromissos'] loop
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
  add column if not exists tipo_documento text check (tipo_documento in ('NF','NFP','FATURA','RECIBO','CONTRATO','FOLHA','OUTROS')),
  add column if not exists numero_documento text not null default '';
alter table public.recebimentos add column if not exists conta_bancaria_id uuid references public.contas_bancarias;

-- ---------- sincronização e RLS nas tabelas novas (mesmo padrão das outras) ----------
do $$
declare t text;
begin
  foreach t in array array['propriedades','entidades_fiscais','contas_bancarias','vinculos','rateios'] loop
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

-- ---------- gatilhos ----------
-- uma só entidade padrão por produtor e um só vínculo padrão por inscrição: marcar uma desmarca as outras
create or replace function public.padrao_unico() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.padrao and new.deleted_at is null then
    if tg_table_name = 'entidades_fiscais' then
      update public.entidades_fiscais set padrao = false
       where user_id = new.user_id and id <> new.id and padrao;
    else
      update public.vinculos set padrao = false
       where fazenda_id = new.fazenda_id and id <> new.id and padrao;
    end if;
  end if;
  return null;
end $$;
create or replace trigger padrao_unico after insert or update of padrao, deleted_at on public.entidades_fiscais
  for each row execute function public.padrao_unico();
create or replace trigger padrao_unico after insert or update of padrao, deleted_at on public.vinculos
  for each row execute function public.padrao_unico();

-- entidade de quem faturou: a padrão da inscrição, senão a padrão do produtor
create or replace function public.entidade_padrao(p_user uuid, p_fazenda uuid) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select v.entidade_id from public.vinculos v
      where v.fazenda_id = p_fazenda and v.padrao and v.deleted_at is null limit 1),
    (select e.id from public.entidades_fiscais e
      where e.user_id = p_user and e.padrao and e.deleted_at is null limit 1));
$$;

-- aparelhos com a versão antiga gravam sem os campos novos
create or replace function public.preencher_lancamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.entidade_id is null then new.entidade_id := public.entidade_padrao(new.user_id, new.fazenda_id); end if;
  if tg_table_name in ('lancamentos','compromissos') then
    new.data_competencia := coalesce(new.data_competencia, new.data);
    new.categoria_irpf := coalesce(new.categoria_irpf, case when new.tipo = 'r' then 'RECEITA_RURAL' else 'CUSTEIO' end);
  end if;
  return new;
end $$;
create or replace trigger preencher before insert or update on public.lancamentos for each row execute function public.preencher_lancamento();
create or replace trigger preencher before insert or update on public.compromissos for each row execute function public.preencher_lancamento();
create or replace trigger preencher before insert or update on public.vendas for each row execute function public.preencher_lancamento();

-- fazenda nova vinda de um aparelho antigo: ganha uma propriedade com o mesmo nome.
-- O upsert de uma fazenda que já existe também passa por aqui (tentativa de insert): nesse caso não cria nada.
create or replace function public.fazenda_com_propriedade() returns trigger
language plpgsql set search_path = '' as $$
declare pid uuid;
begin
  if new.propriedade_id is null and not exists (select 1 from public.fazendas where id = new.id) then
    pid := gen_random_uuid();
    insert into public.propriedades (id, user_id, nome, municipio, uf) values (pid, new.user_id, new.nome, new.municipio, new.uf);
    new.propriedade_id := pid;
  end if;
  return new;
end $$;
create or replace trigger com_propriedade before insert on public.fazendas for each row execute function public.fazenda_com_propriedade();

-- cadastro novo: perfil e entidade padrão (PF, com o nome e o documento a preencher)
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

-- ---------- dados que já existem ----------
-- 1. entidade padrão para quem ainda não tem nenhuma. O CPF vem da fazenda quando todas usam o mesmo.
insert into public.entidades_fiscais (id, user_id, tipo, nome, documento, padrao)
select gen_random_uuid(), p.id, 'PF', coalesce(nullif(p.nome, ''), 'Meu CPF'), coalesce(d.doc, ''), true
from public.perfis p
left join lateral (
  select case when count(distinct f.doc) = 1 then min(f.doc) end as doc
  from public.fazendas f where f.user_id = p.id and f.deleted_at is null and f.doc ~ '^[0-9]{11}$'
) d on true
where not exists (select 1 from public.entidades_fiscais e where e.user_id = p.id);

-- 2. uma propriedade para cada fazenda que ainda não tem (mesmo nome, município e UF)
do $$
declare f record; pid uuid;
begin
  for f in select * from public.fazendas where propriedade_id is null and deleted_at is null loop
    pid := gen_random_uuid();
    insert into public.propriedades (id, user_id, nome, municipio, uf) values (pid, f.user_id, f.nome, f.municipio, f.uf);
    update public.fazendas set propriedade_id = pid where id = f.id;
  end loop;
end $$;

-- 3. cada inscrição sem vínculo fica com a entidade padrão do produtor: 100%, proprietário, padrão
insert into public.vinculos (id, user_id, fazenda_id, entidade_id, percentual, condicao, padrao)
select gen_random_uuid(), f.user_id, f.id, e.id, 100, 'PROPRIETARIO', true
from public.fazendas f
join public.entidades_fiscais e on e.user_id = f.user_id and e.padrao and e.deleted_at is null
where f.deleted_at is null
  and not exists (select 1 from public.vinculos v where v.fazenda_id = f.id and v.deleted_at is null);

-- 4. lançamentos, compromissos e vendas: quem faturou, competência e categoria do IR
--    (o gatilho preencher_lancamento completa o que faltar; só as linhas ativas, para não reenviar apagadas)
update public.lancamentos set entidade_id = coalesce(entidade_id, public.entidade_padrao(user_id, fazenda_id))
 where deleted_at is null and (entidade_id is null or data_competencia is null or categoria_irpf is null);
update public.compromissos set entidade_id = coalesce(entidade_id, public.entidade_padrao(user_id, fazenda_id))
 where deleted_at is null and (entidade_id is null or data_competencia is null or categoria_irpf is null);
update public.vendas set entidade_id = public.entidade_padrao(user_id, fazenda_id)
 where deleted_at is null and entidade_id is null;
