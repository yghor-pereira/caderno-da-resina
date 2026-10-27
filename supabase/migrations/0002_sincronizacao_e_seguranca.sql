-- Caderno da Resina: ajustes da validação técnica (testes de 27/10)

-- search_path vazio (alerta "function_search_path_mutable" do Supabase): a função não usa
-- nenhuma tabela e clock_timestamp() vem de pg_catalog, que sempre é visível.
-- updated_at com a hora do relógio no momento da gravação (clock_timestamp), e não a do início
-- da transação (now()). Com now(), uma transação longa grava uma hora já ultrapassada pelo
-- cursor dos aparelhos. O app pagina por (updated_at, id), então linhas com o mesmo instante
-- (um upsert em lote) não se perdem entre páginas.
create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- índices na ordem da busca (updated_at, id); os de (user_id, updated_at) da 0001 deixam de ser usados
do $$
declare t text;
begin
  foreach t in array array['fazendas','talhoes','ramais','contagens','estrias','coletas','vendas','recebimentos','lancamentos','compromissos','compradores'] loop
    execute format('create index if not exists %I on public.%I (user_id, updated_at, id)', t || '_sinc_id', t);
    execute format('drop index if exists public.%I', t || '_sinc');
  end loop;
end $$;

-- criar_perfil() só roda pelo gatilho de auth.users; ninguém precisa chamá-la pela API
-- (alerta "security definer function executable"). O gatilho continua funcionando.
revoke execute on function public.criar_perfil() from public, anon, authenticated;

-- ie_disponivel continua executável por authenticated de propósito: a RLS esconde as fazendas
-- das outras contas e o app pergunta por aqui se a IE já está em uso (responde só sim ou não).
