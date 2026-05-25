-- ════════════════════════════════════════════════════════════════════════
-- GARAGE TRAINING — SCHEMA COMPLETO E ATUALIZADO
-- ════════════════════════════════════════════════════════════════════════
-- Este script é IDEMPOTENTE: pode ser executado várias vezes sem
-- quebrar dados existentes. Cria o que falta, mantém o que existe,
-- substitui as policies pelas seguras.
--
-- ORDEM DE EXECUÇÃO:
--   1. Faça BACKUP do banco antes (Dashboard → Database → Backups)
--   2. Cole este script INTEIRO no SQL Editor do Supabase
--   3. Execute
--   4. Rode os testes ao final pra verificar
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- 1. TABELAS
-- ════════════════════════════════════════════════════════════════════════

-- ─── PROFILES (estende auth.users) ─────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  role text not null check (role in ('professor', 'aluno', 'founder')) default 'aluno',
  faixa text check (faixa in ('white', 'blue', 'purple', 'brown', 'black')),
  grau int default 0 check (grau >= 0 and grau <= 4),
  avatar_url text,
  telefone text,
  data_nascimento date,
  created_at timestamptz default now()
);

-- Garante colunas mesmo se a tabela já existia
alter table profiles add column if not exists grau int default 0;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists telefone text;
alter table profiles add column if not exists data_nascimento date;

-- Ajusta o check do role pra incluir founder (compatibilidade)
do $$
begin
  alter table profiles drop constraint if exists profiles_role_check;
  alter table profiles add constraint profiles_role_check
    check (role in ('professor', 'aluno', 'founder'));
exception when others then null;
end $$;


-- ─── SCHEDULE (grade de aulas) ─────────────────────────────────────────
create table if not exists schedule (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6),
  horario time not null,
  nome text not null,
  tipo text not null check (tipo in ('gi', 'nogi', 'kids')),
  created_at timestamptz default now()
);


-- ─── PRESENCES (presenças marcadas pelo professor) ─────────────────────
create table if not exists presences (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  data date not null,
  presente boolean not null default true,
  created_at timestamptz default now(),
  unique(aluno_id, data)
);


-- ─── CONFIRMACOES (aluno confirma aula que vai) ────────────────────────
create table if not exists confirmacoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  aula_id uuid not null references schedule(id) on delete cascade,
  data date not null,
  criado_em timestamptz default now(),
  unique(aluno_id, aula_id, data)
);


-- ─── VIDEOS (biblioteca técnica) ───────────────────────────────────────
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null check (categoria in ('guard', 'pass', 'sub', 'sweep', 'position')),
  descricao text,
  duracao text,
  src_type text check (src_type in ('youtube', 'file', 'none')) default 'none',
  src_url text,
  tags text[],
  created_at timestamptz default now()
);


-- ─── PAGAMENTOS (mensalidades) ─────────────────────────────────────────
create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  valor numeric(10,2) not null,
  data_vencimento date not null,
  pago boolean default false,
  data_pagamento date,
  forma_pagamento text,
  stripe_session_id text,
  stripe_payment_intent text,
  criado_em timestamptz default now()
);

-- Garante colunas pra Stripe (futuro)
alter table pagamentos add column if not exists stripe_session_id text;
alter table pagamentos add column if not exists stripe_payment_intent text;


-- ─── EVENTOS (calendário público da academia) ──────────────────────────
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  data_evento date not null,
  hora text,
  local text,
  criado_em timestamptz default now()
);


-- ─── MURAL_RECADOS (avisos da academia) ────────────────────────────────
create table if not exists mural_recados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  fixado boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);


-- ─── NOTIFICACOES (in-app por usuário) ─────────────────────────────────
create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  titulo text not null,
  texto text,
  lida boolean default false,
  criado_em timestamptz default now()
);


-- ─── GRADUACOES_HISTORICO (histórico de graduações do aluno) ───────────
create table if not exists graduacoes_historico (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  faixa text not null,
  grau int default 0,
  data date not null,
  nota text,
  aulas_acumuladas int default 0,
  criado_em timestamptz default now()
);


-- ─── GRADUACAO_REGRAS (regras de aulas/meses por faixa) ────────────────
create table if not exists graduacao_regras (
  id uuid primary key default gen_random_uuid(),
  faixa text unique not null,
  aulas_min int default 0,
  meses_min int default 0,
  atualizado_em timestamptz default now()
);


-- ─── TERMO_ACEITES (registro de aceite do termo) ───────────────────────
create table if not exists termo_aceites (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  aceito_em timestamptz default now(),
  ip text,
  user_agent text,
  termo_texto_snapshot text,
  termo_pdf_url_snapshot text,
  unique(aluno_id)
);


-- ─── CONFIG (singleton: preferências da academia) ──────────────────────
create table if not exists config (
  id int primary key default 1,
  nome_academia text default 'Garage Training',
  tema text check (tema in ('dark', 'light')) default 'dark',
  logo_url text,
  mensalidade_valor numeric(10,2) default 150,
  mensalidade_dia_vencimento int default 10 check (mensalidade_dia_vencimento between 1 and 31),
  termo_ativo boolean default false,
  termo_texto text,
  termo_pdf_url text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

-- Garante colunas pra config
alter table config add column if not exists logo_url text;
alter table config add column if not exists mensalidade_valor numeric(10,2) default 150;
alter table config add column if not exists mensalidade_dia_vencimento int default 10;
alter table config add column if not exists termo_ativo boolean default false;
alter table config add column if not exists termo_texto text;
alter table config add column if not exists termo_pdf_url text;


-- ════════════════════════════════════════════════════════════════════════
-- 2. ROW LEVEL SECURITY (ativa em todas)
-- ════════════════════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table schedule enable row level security;
alter table presences enable row level security;
alter table confirmacoes enable row level security;
alter table videos enable row level security;
alter table pagamentos enable row level security;
alter table eventos enable row level security;
alter table mural_recados enable row level security;
alter table notificacoes enable row level security;
alter table graduacoes_historico enable row level security;
alter table graduacao_regras enable row level security;
alter table termo_aceites enable row level security;
alter table config enable row level security;


-- ════════════════════════════════════════════════════════════════════════
-- 3. FUNÇÕES HELPER
-- ════════════════════════════════════════════════════════════════════════

-- Verifica se o usuário logado é professor OU founder
create or replace function is_professor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('professor', 'founder')
  );
$$;


-- ════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER DE CADASTRO — IGNORA role do client (FORÇA aluno)
-- ════════════════════════════════════════════════════════════════════════
-- Mesmo que o client mande role: 'professor', a trigger ignora.
-- A única forma de virar professor é um professor existente atualizar
-- o role via UPDATE direto (autorizado pela policy de admin abaixo).

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, nome, email, role, faixa, grau)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'aluno',  -- ← HARDCODED. NUNCA confia em raw_user_meta_data->>'role'
    'white',  -- ← HARDCODED. Faixa inicial é sempre branca.
    0
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ════════════════════════════════════════════════════════════════════════
-- 5. TRIGGER PARA IMPEDIR ESCALAÇÃO DE PRIVILÉGIO
-- ════════════════════════════════════════════════════════════════════════
-- Mesmo que o UPDATE seja permitido pela RLS, esta trigger bloqueia
-- mudanças em campos administrativos por usuários que não são professores.

create or replace function prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_prof boolean;
begin
  -- Se é o serviço (sem auth.uid), passa direto (webhook, admin SQL)
  if auth.uid() is null then
    return new;
  end if;

  -- Verifica se quem está chamando é professor/founder
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('professor', 'founder')
  ) into caller_is_prof;

  -- Se NÃO é professor, bloqueia mudanças em campos administrativos
  if not caller_is_prof then
    if new.role is distinct from old.role then
      raise exception 'Sem permissão pra alterar role';
    end if;
    if new.faixa is distinct from old.faixa then
      raise exception 'Sem permissão pra alterar faixa';
    end if;
    if new.grau is distinct from old.grau then
      raise exception 'Sem permissão pra alterar grau';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_role_escalation_trg on profiles;
create trigger prevent_role_escalation_trg
  before update on profiles
  for each row execute function prevent_role_escalation();


-- ════════════════════════════════════════════════════════════════════════
-- 6. POLICIES — PROFILES
-- ════════════════════════════════════════════════════════════════════════

-- Limpa policies antigas
drop policy if exists "Authenticated can read profiles" on profiles;
drop policy if exists "User updates own profile" on profiles;
drop policy if exists "Professor updates any profile" on profiles;
drop policy if exists "Professor deletes profiles" on profiles;
drop policy if exists "profiles_select_self" on profiles;
drop policy if exists "profiles_select_prof" on profiles;
drop policy if exists "profiles_update_self" on profiles;
drop policy if exists "profiles_update_prof" on profiles;
drop policy if exists "profiles_delete_prof" on profiles;
drop policy if exists "profiles_select_authenticated" on profiles;

-- SELECT: qualquer autenticado vê profiles (o client filtra os campos)
-- A proteção real é a trigger acima + o front-end pedir só os campos certos
-- Aluno comum no db.js usa: select 'id, nome, faixa, grau, avatar_url, role, created_at'
-- Professor usa: select '*'
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (true);

-- UPDATE: usuário só atualiza o próprio profile.
-- A trigger prevent_role_escalation impede ele mudar role/faixa/grau.
create policy "profiles_update_self"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- UPDATE: professor/founder pode atualizar qualquer profile (incluindo role)
create policy "profiles_update_prof"
  on profiles for update
  to authenticated
  using (is_professor())
  with check (is_professor());

-- DELETE: apenas professor/founder
create policy "profiles_delete_prof"
  on profiles for delete
  to authenticated
  using (is_professor());

-- INSERT: ninguém faz insert manual em profiles (só a trigger handle_new_user)
-- Sem policy de INSERT = bloqueado pra todos via RLS


-- ════════════════════════════════════════════════════════════════════════
-- 7. POLICIES — SCHEDULE
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "Authenticated reads schedule" on schedule;
drop policy if exists "Professor manages schedule" on schedule;
drop policy if exists "schedule_select_all" on schedule;
drop policy if exists "schedule_manage_prof" on schedule;

create policy "schedule_select_all"
  on schedule for select
  to authenticated
  using (true);

create policy "schedule_manage_prof"
  on schedule for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 8. POLICIES — PRESENCES
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "Aluno reads own presences" on presences;
drop policy if exists "Professor reads all presences" on presences;
drop policy if exists "Professor manages presences" on presences;
drop policy if exists "presences_select_own_or_prof" on presences;
drop policy if exists "presences_manage_prof" on presences;

create policy "presences_select_own_or_prof"
  on presences for select
  to authenticated
  using (auth.uid() = aluno_id or is_professor());

create policy "presences_manage_prof"
  on presences for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 9. POLICIES — CONFIRMACOES (aluno marca a própria intenção)
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "confirmacoes_select_authenticated" on confirmacoes;
drop policy if exists "confirmacoes_insert_self" on confirmacoes;
drop policy if exists "confirmacoes_delete_self" on confirmacoes;
drop policy if exists "confirmacoes_manage_prof" on confirmacoes;

-- Todos autenticados leem (pra professor ver quem confirmou)
create policy "confirmacoes_select_authenticated"
  on confirmacoes for select
  to authenticated
  using (true);

-- Aluno só confirma pra si mesmo
create policy "confirmacoes_insert_self"
  on confirmacoes for insert
  to authenticated
  with check (auth.uid() = aluno_id);

-- Aluno só desconfirma a própria
create policy "confirmacoes_delete_self"
  on confirmacoes for delete
  to authenticated
  using (auth.uid() = aluno_id);

-- Professor faz tudo
create policy "confirmacoes_manage_prof"
  on confirmacoes for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 10. POLICIES — VIDEOS
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "Authenticated reads videos" on videos;
drop policy if exists "Professor manages videos" on videos;
drop policy if exists "videos_select_all" on videos;
drop policy if exists "videos_manage_prof" on videos;

create policy "videos_select_all"
  on videos for select
  to authenticated
  using (true);

create policy "videos_manage_prof"
  on videos for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 11. POLICIES — PAGAMENTOS (crítico! aluno NÃO escreve)
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "pagamentos_select_own_or_prof" on pagamentos;
drop policy if exists "pagamentos_manage_prof" on pagamentos;

-- Aluno só LÊ as próprias mensalidades. Professor lê todas.
create policy "pagamentos_select_own_or_prof"
  on pagamentos for select
  to authenticated
  using (auth.uid() = aluno_id or is_professor());

-- Apenas professor cria/edita/deleta cobranças.
-- Aluno NÃO pode insert/update/delete (sem policy = bloqueado).
-- Quem marca pago no futuro será o webhook Stripe via service_role.
create policy "pagamentos_manage_prof"
  on pagamentos for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 12. POLICIES — EVENTOS
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "eventos_select_all" on eventos;
drop policy if exists "eventos_manage_prof" on eventos;

create policy "eventos_select_all"
  on eventos for select
  to authenticated
  using (true);

create policy "eventos_manage_prof"
  on eventos for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 13. POLICIES — MURAL_RECADOS
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "mural_select_all" on mural_recados;
drop policy if exists "mural_manage_prof" on mural_recados;

create policy "mural_select_all"
  on mural_recados for select
  to authenticated
  using (true);

create policy "mural_manage_prof"
  on mural_recados for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 14. POLICIES — NOTIFICACOES
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "notif_select_own" on notificacoes;
drop policy if exists "notif_update_own" on notificacoes;
drop policy if exists "notif_manage_prof" on notificacoes;

-- Cada usuário só lê as próprias notificações
create policy "notif_select_own"
  on notificacoes for select
  to authenticated
  using (auth.uid() = user_id);

-- Cada usuário só marca a própria como lida
create policy "notif_update_own"
  on notificacoes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Professor pode criar/deletar notificações pra qualquer usuário
create policy "notif_manage_prof"
  on notificacoes for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 15. POLICIES — GRADUACOES_HISTORICO
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "graduacoes_select_own_or_prof" on graduacoes_historico;
drop policy if exists "graduacoes_manage_prof" on graduacoes_historico;

create policy "graduacoes_select_own_or_prof"
  on graduacoes_historico for select
  to authenticated
  using (auth.uid() = aluno_id or is_professor());

-- Só professor adiciona graduação (insere histórico)
create policy "graduacoes_manage_prof"
  on graduacoes_historico for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 16. POLICIES — GRADUACAO_REGRAS
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "regras_select_all" on graduacao_regras;
drop policy if exists "regras_manage_prof" on graduacao_regras;

create policy "regras_select_all"
  on graduacao_regras for select
  to authenticated
  using (true);

create policy "regras_manage_prof"
  on graduacao_regras for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 17. POLICIES — TERMO_ACEITES
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "termo_select_own_or_prof" on termo_aceites;
drop policy if exists "termo_insert_self" on termo_aceites;
drop policy if exists "termo_manage_prof" on termo_aceites;

create policy "termo_select_own_or_prof"
  on termo_aceites for select
  to authenticated
  using (auth.uid() = aluno_id or is_professor());

-- Aluno só insere o próprio aceite (no fluxo de cadastro)
create policy "termo_insert_self"
  on termo_aceites for insert
  to authenticated
  with check (auth.uid() = aluno_id);

-- Professor pode editar/deletar
create policy "termo_manage_prof"
  on termo_aceites for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 18. POLICIES — CONFIG
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "Authenticated reads config" on config;
drop policy if exists "Professor manages config" on config;
drop policy if exists "config_select_all" on config;
drop policy if exists "config_manage_prof" on config;

create policy "config_select_all"
  on config for select
  to authenticated
  using (true);

create policy "config_manage_prof"
  on config for all
  to authenticated
  using (is_professor())
  with check (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- 19. CONFIG INICIAL (singleton)
-- ════════════════════════════════════════════════════════════════════════

insert into config (id, nome_academia, tema)
values (1, 'Garage Training', 'dark')
on conflict (id) do nothing;


-- ════════════════════════════════════════════════════════════════════════
-- TESTES DE PENETRAÇÃO
-- ════════════════════════════════════════════════════════════════════════
-- Rode no console do navegador, logado como ALUNO:
--
-- 1. Tentar virar professor (deve FALHAR):
--    await sb.from('profiles').update({ role: 'professor' }).eq('id', (await sb.auth.getUser()).data.user.id)
--    Esperado: erro "Sem permissão pra alterar role"
--
-- 2. Tentar marcar pagamento como pago (deve FALHAR):
--    await sb.from('pagamentos').update({ pago: true }).eq('aluno_id', (await sb.auth.getUser()).data.user.id)
--    Esperado: PostgrestError "new row violates RLS policy"
--
-- 3. Tentar criar professor via cadastro (deve nascer COMO ALUNO):
--    await sb.auth.signUp({email:'teste@x.com', password:'12345678', options:{data:{role:'professor'}}})
--    Depois: select role from profiles where email='teste@x.com'
--    Esperado: role = 'aluno' (trigger ignora o que veio do client)
--
-- 4. Aluno PODE alterar próprio nome (deve PASSAR):
--    await sb.from('profiles').update({ nome: 'Novo Nome' }).eq('id', (await sb.auth.getUser()).data.user.id)
--    Esperado: sucesso
-- ════════════════════════════════════════════════════════════════════════

-- Pronto. Schema completo, RLS reforçada, escalação bloqueada. ✓
