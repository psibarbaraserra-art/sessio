-- Sessio · estrutura do banco
-- Projeto NOVO no Supabase, separado do Psique Rastreios.
-- Cole tudo em: SQL Editor → New query → Run. Pode rodar de novo sem perder dados.

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. Assinaturas (alimentada pela Kiwify) e registro dos avisos
-- =====================================================================
create table if not exists public.assinaturas (
  email          text primary key,
  status         text not null default 'ativa',   -- ativa | atrasada | cancelada | reembolsada
  expira_em      timestamptz,                      -- vazio = sem data de término (cortesia)
  origem         text not null default 'kiwify',   -- kiwify | cortesia
  pedido         text,
  atualizado_em  timestamptz not null default now()
);
alter table public.assinaturas enable row level security;

create table if not exists public.eventos_kiwify (
  id          bigserial primary key,
  recebido_em timestamptz not null default now(),
  tipo        text,
  email       text,
  payload     jsonb
);
alter table public.eventos_kiwify enable row level security;
-- sem políticas: só a função do webhook (service_role) lê e grava aqui

-- =====================================================================
-- 2. Perfil da(o) profissional e preferências da agenda
-- =====================================================================
create table if not exists public.perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text,
  crp             text,
  whatsapp        text,
  fuso            text not null default 'America/Manaus',
  valor_padrao    numeric(10,2) not null default 0 check (valor_padrao >= 0),
  duracao_padrao  int not null default 50 check (duracao_padrao between 5 and 600),
  lembrete_auto   boolean not null default true,
  lembrete_horas  int not null default 24 check (lembrete_horas between 1 and 168),
  bloqueado       boolean not null default false,   -- só a administração altera
  atualizado_em   timestamptz not null default now()
);
alter table public.perfis enable row level security;

-- Cadastro liberado = existe e não está bloqueado
create or replace function public.liberado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and not p.bloqueado)
$$;
revoke all on function public.liberado() from public, anon;
grant execute on function public.liberado() to authenticated;

-- Assinatura em dia (ativa ou atrasada dentro da tolerância). Sem ela, a profissional
-- continua vendo e exportando os próprios dados (LGPD), mas não cria nem altera nada.
create or replace function public.assinante() returns boolean
language sql stable security definer set search_path = public as $$
  select public.liberado() and exists (
    select 1 from public.assinaturas a
    where lower(a.email) = lower(auth.jwt() ->> 'email')
      and a.status in ('ativa','atrasada')
      and (a.expira_em is null or a.expira_em > now()))
$$;
revoke all on function public.assinante() from public, anon;
grant execute on function public.assinante() to authenticated;

-- =====================================================================
-- 3. Pacientes
-- =====================================================================
create table if not exists public.pacientes (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome             text not null check (length(trim(nome)) between 1 and 160),
  telefone         text,
  email            text,
  valor_sessao     numeric(10,2) check (valor_sessao >= 0),   -- vazio = usa o valor padrão do perfil
  lembretes        boolean not null default true,              -- aceita receber lembretes por e-mail
  observacao       text check (length(observacao) <= 1000),   -- só informação administrativa
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists pacientes_prof_idx on public.pacientes (profissional_id, nome);
alter table public.pacientes enable row level security;

-- =====================================================================
-- 4. Sessões (agenda + financeiro + confirmação)
-- =====================================================================
create table if not exists public.sessoes (
  id                   uuid primary key default gen_random_uuid(),
  profissional_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paciente_id          uuid not null references public.pacientes(id) on delete cascade,
  inicio               timestamptz not null,
  duracao_min          int not null default 50 check (duracao_min between 5 and 600),
  modalidade           text not null default 'presencial' check (modalidade in ('presencial','online')),
  link                 text check (length(link) <= 500),         -- endereço da chamada, se online
  status               text not null default 'agendada'
                       check (status in ('agendada','realizada','falta','desmarcada','cancelada')),
  valor                numeric(10,2) not null default 0 check (valor >= 0),
  pagamento            text not null default 'pendente' check (pagamento in ('pendente','pago','isento')),
  pago_em              date,
  forma_pagamento      text check (forma_pagamento in ('pix','dinheiro','cartao','transferencia','convenio','outro')),
  serie_id             uuid,                                       -- sessões de uma mesma recorrência
  recorrencia          text check (recorrencia in ('semanal','quinzenal','mensal')),
  encaixe              boolean not null default false,
  confirmacao          text not null default 'pendente' check (confirmacao in ('pendente','confirmada','desmarcada')),
  confirmacao_em       timestamptz,
  lembrete_enviado_em  timestamptz,
  token                uuid not null unique default gen_random_uuid(),  -- link do paciente
  observacao           text check (length(observacao) <= 500),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists sessoes_prof_inicio_idx on public.sessoes (profissional_id, inicio);
create index if not exists sessoes_paciente_idx on public.sessoes (paciente_id, inicio);
create index if not exists sessoes_serie_idx on public.sessoes (serie_id) where serie_id is not null;
alter table public.sessoes enable row level security;

-- =====================================================================
-- 5. Bloqueios de horário (folgas, férias, supervisão…)
-- =====================================================================
create table if not exists public.bloqueios (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  motivo           text check (length(motivo) <= 120),
  criado_em        timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists bloqueios_prof_idx on public.bloqueios (profissional_id, inicio);
alter table public.bloqueios enable row level security;

-- =====================================================================
-- 6. Regras de acesso (RLS): cada profissional vê e altera só o que é seu
-- =====================================================================
drop policy if exists "ver a propria assinatura" on public.assinaturas;
create policy "ver a propria assinatura" on public.assinaturas for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') and public.liberado());

drop policy if exists "ler o proprio perfil" on public.perfis;
drop policy if exists "criar o proprio perfil" on public.perfis;
drop policy if exists "editar o proprio perfil" on public.perfis;
create policy "ler o proprio perfil"    on public.perfis for select to authenticated using (id = auth.uid());
create policy "criar o proprio perfil"  on public.perfis for insert to authenticated with check (id = auth.uid());
create policy "editar o proprio perfil" on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Pacientes, sessões e bloqueios: ler = dono e cadastro liberado; gravar = também com assinatura em dia
do $$
declare t text;
begin
  foreach t in array array['pacientes','sessoes','bloqueios'] loop
    execute format('drop policy if exists "ler %1$s" on public.%1$I', t);
    execute format('drop policy if exists "criar %1$s" on public.%1$I', t);
    execute format('drop policy if exists "editar %1$s" on public.%1$I', t);
    execute format('drop policy if exists "apagar %1$s" on public.%1$I', t);
    execute format('create policy "ler %1$s" on public.%1$I for select to authenticated
                    using (profissional_id = auth.uid() and public.liberado())', t);
    execute format('create policy "apagar %1$s" on public.%1$I for delete to authenticated
                    using (profissional_id = auth.uid() and public.assinante())', t);
    if t = 'sessoes' then
      -- a sessão só pode apontar para um paciente da própria profissional
      execute format('create policy "criar %1$s" on public.%1$I for insert to authenticated
                      with check (profissional_id = auth.uid() and public.assinante()
                        and exists (select 1 from public.pacientes p where p.id = paciente_id and p.profissional_id = auth.uid()))', t);
      execute format('create policy "editar %1$s" on public.%1$I for update to authenticated
                      using (profissional_id = auth.uid() and public.assinante())
                      with check (profissional_id = auth.uid() and public.assinante()
                        and exists (select 1 from public.pacientes p where p.id = paciente_id and p.profissional_id = auth.uid()))', t);
    else
      execute format('create policy "criar %1$s" on public.%1$I for insert to authenticated
                      with check (profissional_id = auth.uid() and public.assinante())', t);
      execute format('create policy "editar %1$s" on public.%1$I for update to authenticated
                      using (profissional_id = auth.uid() and public.assinante())
                      with check (profissional_id = auth.uid() and public.assinante())', t);
    end if;
  end loop;
end $$;

-- Permissões (as regras acima continuam valendo)
grant select on public.assinaturas to authenticated;
revoke insert, update on public.perfis from authenticated;
grant select on public.perfis to authenticated;
grant insert (id, nome, crp, whatsapp, fuso, valor_padrao, duracao_padrao, lembrete_auto, lembrete_horas, atualizado_em)
  on public.perfis to authenticated;
grant update (nome, crp, whatsapp, fuso, valor_padrao, duracao_padrao, lembrete_auto, lembrete_horas, atualizado_em)
  on public.perfis to authenticated;
grant select, insert, update, delete on public.pacientes, public.bloqueios to authenticated;
-- profissional_id nunca muda depois de criado
revoke update on public.pacientes from authenticated;
grant update (nome, telefone, email, valor_sessao, lembretes, observacao, ativo, atualizado_em) on public.pacientes to authenticated;
grant select, insert, delete on public.sessoes to authenticated;
-- o token do paciente não pode ser trocado pelo app (o lembrete pode ser zerado ao remarcar)
grant update (paciente_id, inicio, duracao_min, modalidade, link, status, valor, pagamento, pago_em,
              forma_pagamento, serie_id, recorrencia, encaixe, confirmacao, confirmacao_em, lembrete_enviado_em,
              observacao, atualizado_em)
  on public.sessoes to authenticated;

grant select, insert, update on public.assinaturas to service_role;
grant select, insert on public.eventos_kiwify to service_role;
grant usage, select on sequence public.eventos_kiwify_id_seq to service_role;
grant select on public.perfis, public.pacientes to service_role;
grant select, update on public.sessoes to service_role;

-- =====================================================================
-- 7. Página do paciente (confirmar ou desmarcar), sem login
--    Funciona só com o token da sessão, que é aleatório e impossível de adivinhar.
--    Mostra o mínimo: primeiro nome, data, profissional.
-- =====================================================================
create or replace function public.sessao_publica(p_token uuid)
returns table (paciente text, profissional text, crp text, whatsapp text, inicio timestamptz,
               duracao_min int, modalidade text, link text, status text, confirmacao text, fuso text)
language sql stable security definer set search_path = public as $$
  select split_part(trim(pa.nome), ' ', 1), pe.nome, pe.crp, pe.whatsapp, s.inicio, s.duracao_min,
         s.modalidade, case when s.modalidade = 'online' then s.link end, s.status, s.confirmacao, pe.fuso
  from public.sessoes s
  join public.pacientes pa on pa.id = s.paciente_id
  join public.perfis pe on pe.id = s.profissional_id
  where s.token = p_token
    and not pe.bloqueado
    and s.inicio > now() - interval '1 day'
$$;

create or replace function public.responder_sessao(p_token uuid, p_resposta text)
returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_resposta not in ('confirmada','desmarcada') then raise exception 'resposta inválida'; end if;
  update public.sessoes
     set confirmacao = p_resposta, confirmacao_em = now(), atualizado_em = now()
   where token = p_token and status = 'agendada' and inicio > now();
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'indisponivel' end;
end $$;

revoke all on function public.sessao_publica(uuid) from public;
revoke all on function public.responder_sessao(uuid, text) from public;
grant execute on function public.sessao_publica(uuid) to anon, authenticated;
grant execute on function public.responder_sessao(uuid, text) to anon, authenticated;

-- =====================================================================
-- 8. Lembretes por e-mail: sessões que já devem receber o aviso
--    (usada pela função "lembretes", com a chave de serviço)
-- =====================================================================
create or replace function public.lembretes_pendentes()
returns table (sessao_id uuid, token uuid, inicio timestamptz, duracao_min int, modalidade text, link text,
               paciente text, paciente_email text, profissional text, crp text, whatsapp text, fuso text)
language sql stable security definer set search_path = public as $$
  select s.id, s.token, s.inicio, s.duracao_min, s.modalidade, s.link,
         split_part(trim(pa.nome), ' ', 1), pa.email, pe.nome, pe.crp, pe.whatsapp, pe.fuso
  from public.sessoes s
  join public.pacientes pa on pa.id = s.paciente_id
  join public.perfis pe on pe.id = s.profissional_id
  where s.status = 'agendada'
    and s.confirmacao = 'pendente'
    and s.lembrete_enviado_em is null
    and pe.lembrete_auto and not pe.bloqueado
    and pa.lembretes and pa.ativo
    and coalesce(pa.email, '') like '%@%'
    and s.inicio > now()
    and s.inicio <= now() + make_interval(hours => pe.lembrete_horas)
    and exists (select 1 from auth.users u join public.assinaturas a on lower(a.email) = lower(u.email)
                where u.id = s.profissional_id and a.status in ('ativa','atrasada')
                  and (a.expira_em is null or a.expira_em > now()))
  limit 200
$$;
revoke all on function public.lembretes_pendentes() from public, anon, authenticated;
grant execute on function public.lembretes_pendentes() to service_role;
