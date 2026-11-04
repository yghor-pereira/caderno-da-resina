#!/bin/sh
# Testa a migração 0006 no banco de verdade sem mudar nada: roda a migração DUAS vezes dentro de uma
# transação, confere o resultado e termina com um erro proposital (RELATORIO …) que desfaz tudo.
#   supabase/teste-migracao-0006.sh
# Saída esperada: uma mensagem de erro começando com "RELATORIO ok" (ou "RELATORIO FALHA" e a lista).
set -e
cd "$(dirname "$0")"
M=migrations/0006_entidades_fiscais.sql
OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
{
echo 'begin;'
cat <<'SQL'
create temp table antes as select
  (select count(*) from public.lancamentos where deleted_at is null) as lanc,
  (select coalesce(sum(valor),0) from public.lancamentos where deleted_at is null) as soma_lanc,
  (select count(*) from public.vendas where deleted_at is null) as vendas,
  (select count(*) from public.fazendas where deleted_at is null) as fazendas;
SQL
cat "$M"
cat <<'SQL'
create temp table depois1 as select
  (select count(*) from public.entidades_fiscais) as ent,
  (select count(*) from public.propriedades) as prop,
  (select count(*) from public.vinculos) as vinc;
SQL
cat "$M"
cat <<'SQL'
do $$
declare
  falhas text[] := '{}';
  a record; d record;
  n int; u uuid; e1 uuid; e2 uuid; fz uuid; lid uuid; pid uuid;
  ok boolean;
begin
  select * into a from antes;
  select * into d from depois1;
  -- idempotência: a segunda execução não cria nada
  if (select count(*) from public.entidades_fiscais) <> d.ent then falhas := falhas || 'segunda execução criou entidades'; end if;
  if (select count(*) from public.propriedades) <> d.prop then falhas := falhas || 'segunda execução criou propriedades'; end if;
  if (select count(*) from public.vinculos) <> d.vinc then falhas := falhas || 'segunda execução criou vínculos'; end if;
  -- dados antigos continuam lá
  if (select count(*) from public.lancamentos where deleted_at is null) <> a.lanc
     or (select coalesce(sum(valor),0) from public.lancamentos where deleted_at is null) <> a.soma_lanc then falhas := falhas || 'lançamentos mudaram'; end if;
  if (select count(*) from public.vendas where deleted_at is null) <> a.vendas then falhas := falhas || 'vendas mudaram'; end if;
  -- todo mundo tem o que precisa
  select count(*) into n from public.perfis p where (select count(*) from public.entidades_fiscais e where e.user_id = p.id and e.padrao and e.deleted_at is null) <> 1;
  if n > 0 then falhas := falhas || (n || ' perfis sem exatamente uma entidade padrão'); end if;
  select count(*) into n from public.fazendas where deleted_at is null and propriedade_id is null;
  if n > 0 then falhas := falhas || (n || ' fazendas sem propriedade'); end if;
  select count(*) into n from public.fazendas f where deleted_at is null
    and (select count(*) from public.vinculos v where v.fazenda_id = f.id and v.padrao and v.deleted_at is null) <> 1;
  if n > 0 then falhas := falhas || (n || ' fazendas sem exatamente um vínculo padrão'); end if;
  select count(*) into n from public.lancamentos where deleted_at is null and (entidade_id is null or data_competencia is null or categoria_irpf is null);
  if n > 0 then falhas := falhas || (n || ' lançamentos incompletos'); end if;
  select count(*) into n from public.compromissos where deleted_at is null and entidade_id is null;
  if n > 0 then falhas := falhas || (n || ' compromissos sem entidade'); end if;
  select count(*) into n from public.vendas where deleted_at is null and entidade_id is null;
  if n > 0 then falhas := falhas || (n || ' vendas sem entidade'); end if;

  -- aparelho antigo, como usuário logado (RLS valendo): fazenda sem propriedade e lançamento sem entidade
  select id into u from public.perfis order by id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  fz := gen_random_uuid();
  insert into public.fazendas (id, nome, ie, uf) values (fz, 'Teste antigo', '99' || floor(random()*1e10)::bigint, 'PR');
  select propriedade_id into pid from public.fazendas where id = fz;
  if pid is null then falhas := falhas || 'fazenda de aparelho antigo ficou sem propriedade'; end if;
  -- upsert da mesma fazenda sem propriedade_id (como o app antigo reenvia) não cria propriedade solta
  select count(*) into n from public.propriedades;
  insert into public.fazendas (id, nome, ie, uf) values (fz, 'Teste antigo 2', '1', 'PR')
    on conflict (id) do update set nome = excluded.nome;
  if (select count(*) from public.propriedades) <> n then falhas := falhas || 'upsert de fazenda existente criou propriedade'; end if;
  if (select propriedade_id from public.fazendas where id = fz) is distinct from pid then falhas := falhas || 'upsert trocou a propriedade'; end if;
  lid := gen_random_uuid();
  insert into public.lancamentos (id, fazenda_id, data, tipo, cat, valor) values (lid, fz, '2026-12-20', 'd', 'Outros', 10);
  select entidade_id is not null and data_competencia = '2026-12-20' and categoria_irpf = 'CUSTEIO' into ok from public.lancamentos where id = lid;
  if not ok then falhas := falhas || 'lançamento de aparelho antigo não foi completado'; end if;
  -- uma só entidade padrão: marcar outra desmarca a primeira
  select id into e1 from public.entidades_fiscais where user_id = u and padrao;
  e2 := gen_random_uuid();
  insert into public.entidades_fiscais (id, tipo, nome, documento, padrao) values (e2, 'PJ', 'CNPJ teste', '11222333000181', true);
  if (select padrao from public.entidades_fiscais where id = e1) then falhas := falhas || 'duas entidades padrão'; end if;
  -- documento precisa bater com o tipo
  begin
    insert into public.entidades_fiscais (id, tipo, nome, documento) values (gen_random_uuid(), 'PF', 'errado', '11222333000181');
    falhas := falhas || 'aceitou CNPJ numa PF';
  exception when check_violation then null;
  end;
  -- RLS: entidade de outro usuário não aparece
  select count(*) into n from public.entidades_fiscais where user_id <> u;
  if n > 0 then falhas := falhas || 'RLS deixou ver entidades de outra conta'; end if;
  reset role;

  raise exception 'RELATORIO % %', case when cardinality(falhas) = 0 then 'ok' else 'FALHA' end,
    coalesce(array_to_string(falhas, ' | '), '');
end $$;
SQL
} > "$OUT"
./gerenciar.sh sql "$OUT"
