-- Define um administrador. Rode no SQL Editor do Supabase trocando o e-mail.
-- Para tirar: delete from public.admins where user_id = (select id from auth.users where email = '...');
insert into public.admins (user_id, adicionado_por)
select id, 'admin-inicial.sql' from auth.users where email = 'yghorp@gmail.com'
on conflict (user_id) do nothing;

select u.email, a.criado_em from public.admins a join auth.users u on u.id = a.user_id;
