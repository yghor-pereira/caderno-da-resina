-- Caderno da Resina: métricas de uso (telemetria)
-- Registra QUE o produtor usou uma função, nunca o conteúdo (valores, descrições, nomes).
-- Ninguém lê ou grava estas tabelas pela API: o app envia em lote por registrar_uso(), que
-- grava sempre em nome de quem está logado; o painel de admin lê só agregados (etapa 4).
-- Catálogo de eventos: docs/metricas.md

create table public.sessoes (
  id uuid primary key,                       -- gerado no aparelho (reenvio não duplica)
  user_id uuid not null references auth.users on delete cascade,
  inicio timestamptz not null,
  ultimo_sinal timestamptz not null,
  segundos_ativos integer not null default 0 check (segundos_ativos >= 0),
  dispositivo text not null default '',
  is_demo boolean not null default false,    -- vem do perfil, não do aparelho
  recebido_em timestamptz not null default now()
);
create index sessoes_inicio on public.sessoes (inicio);
create index sessoes_usuario on public.sessoes (user_id, inicio);

create table public.eventos (
  id uuid primary key,                       -- gerado no aparelho (reenvio não duplica)
  user_id uuid not null references auth.users on delete cascade,
  sessao_id uuid,
  evento text not null,
  tela text,
  props jsonb not null default '{}',
  criado_em timestamptz not null,            -- hora do aparelho (o uso pode ter sido sem sinal)
  is_demo boolean not null default false,
  recebido_em timestamptz not null default now()
);
create index eventos_criado on public.eventos (criado_em);
create index eventos_usuario on public.eventos (user_id, criado_em);
create index eventos_evento on public.eventos (evento, criado_em);

alter table public.sessoes enable row level security;
alter table public.eventos enable row level security;
revoke all on public.sessoes, public.eventos from anon, authenticated;

-- recebe um lote do aparelho. Descarta o que não segue o formato em vez de recusar o lote,
-- limita horas futuras ao agora e o tempo ativo à duração da sessão (+60 s de folga).
create or replace function public.registrar_uso(p_eventos jsonb default '[]', p_sessoes jsonb default '[]')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  demo boolean;
  n integer;
begin
  if eu is null then raise exception 'é preciso entrar' using errcode = '28000'; end if;
  if jsonb_typeof(p_eventos) <> 'array' or jsonb_typeof(p_sessoes) <> 'array'
     or jsonb_array_length(p_eventos) > 500 or jsonb_array_length(p_sessoes) > 50 then
    raise exception 'lote inválido' using errcode = '22023';
  end if;
  select coalesce(is_demo, false) into demo from public.perfis where id = eu;

  insert into public.sessoes as s (id, user_id, inicio, ultimo_sinal, segundos_ativos, dispositivo, is_demo)
  select x.id, eu, x.inicio, least(x.ultimo_sinal, now()),
         least(greatest(x.segundos_ativos, 0), extract(epoch from least(x.ultimo_sinal, now()) - x.inicio)::integer + 60),
         left(coalesce(x.dispositivo, ''), 60), coalesce(demo, false)
  from jsonb_to_recordset(p_sessoes) as x(id uuid, inicio timestamptz, ultimo_sinal timestamptz, segundos_ativos integer, dispositivo text)
  where x.id is not null and x.inicio > now() - interval '60 days' and x.inicio <= now() and x.ultimo_sinal >= x.inicio
  on conflict (id) do update
    set ultimo_sinal = greatest(s.ultimo_sinal, excluded.ultimo_sinal),
        segundos_ativos = greatest(s.segundos_ativos, excluded.segundos_ativos),
        recebido_em = now()
    where s.user_id = eu;

  insert into public.eventos (id, user_id, sessao_id, evento, tela, props, criado_em, is_demo)
  select x.id, eu, x.sessao_id, x.evento, x.tela, coalesce(x.props, '{}'), least(x.criado_em, now()), coalesce(demo, false)
  from jsonb_to_recordset(p_eventos) as x(id uuid, sessao_id uuid, evento text, tela text, props jsonb, criado_em timestamptz)
  where x.id is not null and x.evento ~ '^[a-z_]{1,40}$' and coalesce(length(x.tela), 0) <= 40
    and jsonb_typeof(coalesce(x.props, '{}')) = 'object' and pg_column_size(coalesce(x.props, '{}')) <= 1000
    and x.criado_em > now() - interval '60 days'
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.registrar_uso(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_uso(jsonb, jsonb) to authenticated;
