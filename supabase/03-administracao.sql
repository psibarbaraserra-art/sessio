-- Sessio · consultas da administração (rode uma de cada vez no SQL Editor)

-- Profissionais cadastrados, do mais recente para o mais antigo.
-- Confira o nome e o CRP em https://cadastro.cfp.org.br
select u.email, p.nome, p.crp, p.bloqueado, a.status as assinatura, a.expira_em, u.created_at as cadastrado_em
from auth.users u
left join public.perfis p on p.id = u.id
left join public.assinaturas a on lower(a.email) = lower(u.email)
order by u.created_at desc;

-- Acesso cortesia (troque o e-mail):
-- insert into public.assinaturas (email, status, origem) values ('email@exemplo.com', 'ativa', 'cortesia')
--   on conflict (email) do update set status = 'ativa', origem = 'cortesia', expira_em = null;

-- BLOQUEAR um cadastro (troque o e-mail):
-- update public.perfis set bloqueado = true where id = (select id from auth.users where email = 'email@exemplo.com');

-- DESBLOQUEAR:
-- update public.perfis set bloqueado = false where id = (select id from auth.users where email = 'email@exemplo.com');

-- Volume de uso (sem ver dados de pacientes): quantos pacientes e sessões cada conta tem
select u.email, count(distinct pa.id) as pacientes, count(s.id) as sessoes
from auth.users u
left join public.pacientes pa on pa.profissional_id = u.id
left join public.sessoes s on s.profissional_id = u.id
group by u.email order by sessoes desc;
