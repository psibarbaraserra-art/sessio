-- Sessio · correção (20/11/2026): permite que o app crie e atualize o perfil da profissional.
-- Sem isso, o perfil não era salvo e todas as ações davam "Sem permissão".
-- Cole no Supabase em: SQL Editor → New query → Run. Pode rodar mais de uma vez.
-- (Já está incluída no 01-estrutura.sql para projetos novos.)
grant update (id) on public.perfis to authenticated;
