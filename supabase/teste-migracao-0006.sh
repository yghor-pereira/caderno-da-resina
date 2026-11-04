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
  (select count(*) from public.inscricoes_estaduais) as ins,
  (select count(*) from public.contas_bancarias) as contas;
SQL
cat "$M"
cat <<'SQL'
do $$
declare
  falhas text[] := '{}';
  a record; d record;
  n int; u uuid; e1 uuid; e2 uuid; fz uuid; lid uuid;
  ok boolean;
begin
  select * into a from antes;
  select * into d from depois1;
  -- idempotência: a segunda execução não cria nada
  if (select count(*) from public.entidades_fiscais) <> d.ent then falhas := falhas || 'segunda execução criou CPFs/CNPJs'; end if;
  if (select count(*) from public.inscricoes_estaduais) <> d.ins then falhas := falhas || 'segunda execução criou inscrições'; end if;
  if (select count(*) from public.contas_bancarias) <> d.contas then falhas := falhas || 'segunda execução criou contas'; end if;
  -- dados antigos continuam lá
  if (select count(*) from public.lancamentos where deleted_at is null) <> a.lanc
     or (select coalesce(sum(valor),0) from public.lancamentos where deleted_at is null) <> a.soma_lanc then falhas := falhas || 'lançamentos mudaram'; end if;
  if (select count(*) from public.vendas where deleted_at is null) <> a.vendas then falhas := falhas || 'vendas mudaram'; end if;
  if (select count(*) from public.fazendas where deleted_at is null) <> a.fazendas then falhas := falhas || 'fazendas mudaram'; end if;
  -- todo mundo tem o que precisa
  select count(*) into n from public.perfis p where (select count(*) from public.entidades_fiscais e where e.user_id = p.id and e.padrao and e.deleted_at is null) <> 1;
  if n > 0 then falhas := falhas || (n || ' perfis sem exatamente um CPF/CNPJ padrão'); end if;
  select count(*) into n from public.perfis p where not exists (select 1 from public.contas_bancarias c where c.user_id = p.id);
  if n > 0 then falhas := falhas || (n || ' perfis sem conta bancária'); end if;
  select count(*) into n from public.fazendas f where deleted_at is null and ie is not null
    and not exists (select 1 from public.inscricoes_estaduais i where i.ie = f.ie and i.deleted_at is null);
  if n > 0 then falhas := falhas || (n || ' IEs de fazendas sem inscrição'); end if;
  -- saldo: a soma dos saldos iniciais das fazendas foi para as contas
  if (select coalesce(sum(saldo_inicial),0) from public.fazendas where deleted_at is null) <> (select coalesce(sum(saldo_inicial),0) from public.contas_bancarias)
    then falhas := falhas || 'saldo inicial das contas não bate com o das fazendas'; end if;
  select count(*) into n from public.lancamentos where deleted_at is null
    and (entidade_id is null or conta_bancaria_id is null or data_competencia is null or categoria_irpf is null);
  if n > 0 then falhas := falhas || (n || ' lançamentos incompletos'); end if;
  select count(*) into n from public.compromissos where deleted_at is null and entidade_id is null;
  if n > 0 then falhas := falhas || (n || ' compromissos sem CPF/CNPJ'); end if;
  select count(*) into n from public.vendas where deleted_at is null and (entidade_id is null or inscricao_id is null);
  if n > 0 then falhas := falhas || (n || ' vendas sem CPF/CNPJ ou inscrição'); end if;
  select count(*) into n from public.recebimentos where deleted_at is null and conta_bancaria_id is null;
  if n > 0 then falhas := falhas || (n || ' recebimentos sem conta'); end if;

  -- como usuário logado (RLS valendo)
  select id into u from public.perfis order by id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- app antigo: fazenda com IE e lançamento sem CPF/CNPJ
  fz := gen_random_uuid();
  insert into public.fazendas (id, nome, ie, uf) values (fz, 'Teste antigo', '99' || floor(random()*1e10)::bigint, 'PR');
  lid := gen_random_uuid();
  insert into public.lancamentos (id, fazenda_id, data, tipo, cat, valor) values (lid, fz, '2026-12-20', 'd', 'Outros', 10);
  select entidade_id is not null and data_competencia = '2026-12-20' and categoria_irpf = 'CUSTEIO' into ok from public.lancamentos where id = lid;
  if not ok then falhas := falhas || 'lançamento do app antigo não foi completado'; end if;
  -- app novo: fazenda sem IE e lançamento sem fazenda (despesa geral)
  insert into public.fazendas (id, nome, uf) values (gen_random_uuid(), 'Fazenda sem IE', 'PR');
  insert into public.lancamentos (id, data, tipo, cat, valor) values (gen_random_uuid(), '2026-11-01', 'd', 'Outros', 5);
  -- o app antigo salvando a própria fazenda não vê a IE dela como ocupada
  select ie into a from public.fazendas where user_id = u and deleted_at is null and ie is not null and id <> fz limit 1;
  if a.ie is not null and not public.ie_disponivel(a.ie, null) then falhas := falhas || 'ie_disponivel recusou a IE do próprio produtor'; end if;
  -- um só CPF/CNPJ padrão: marcar outro desmarca o primeiro
  select id into e1 from public.entidades_fiscais where user_id = u and padrao;
  e2 := gen_random_uuid();
  insert into public.entidades_fiscais (id, tipo, nome, documento, padrao) values (e2, 'PJ', 'CNPJ teste', '11222333000181', true);
  if (select padrao from public.entidades_fiscais where id = e1) then falhas := falhas || 'dois CPFs/CNPJs padrão'; end if;
  insert into public.inscricoes_estaduais (id, entidade_id, ie, uf) values (gen_random_uuid(), e2, '88' || floor(random()*1e10)::bigint, 'SC');
  insert into public.contas_bancarias (id, entidade_id, banco, saldo_inicial) values (gen_random_uuid(), e2, 'Teste', 100);
  -- documento precisa bater com o tipo
  begin
    insert into public.entidades_fiscais (id, tipo, nome, documento) values (gen_random_uuid(), 'PF', 'errado', '11222333000181');
    falhas := falhas || 'aceitou CNPJ numa PF';
  exception when check_violation then null;
  end;
  -- RLS: nada de outra conta aparece
  select count(*) into n from public.entidades_fiscais where user_id <> u;
  if n > 0 then falhas := falhas || 'RLS deixou ver CPFs/CNPJs de outra conta'; end if;
  select count(*) into n from public.inscricoes_estaduais where user_id <> u;
  if n > 0 then falhas := falhas || 'RLS deixou ver inscrições de outra conta'; end if;
  select count(*) into n from public.contas_bancarias where user_id <> u;
  if n > 0 then falhas := falhas || 'RLS deixou ver contas de outra conta'; end if;
  reset role;

  raise exception 'RELATORIO % %', case when cardinality(falhas) = 0 then 'ok' else 'FALHA' end,
    coalesce(array_to_string(falhas, ' | '), '');
end $$;
SQL
} > "$OUT"
./gerenciar.sh sql "$OUT"
