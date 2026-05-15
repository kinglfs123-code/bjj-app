-- ════════════════════════════════════════════════════════════════════════
-- SCHEMA DO APP DE JIU-JITSU
-- Cole este script inteiro no SQL Editor do Supabase e execute uma vez.
-- ════════════════════════════════════════════════════════════════════════


-- ─── 1. PROFILES (estende auth.users com role, nome, faixa) ─────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  role text not null check (role in ('professor', 'aluno')) default 'aluno',
  faixa text check (faixa in ('white', 'blue', 'purple', 'brown', 'black')),
  created_at timestamptz default now()
);


-- ─── 2. SCHEDULE (grade de aulas semanal) ───────────────────────────────
create table if not exists schedule (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6),
  horario time not null,
  nome text not null,
  tipo text not null check (tipo in ('gi', 'nogi', 'kids')),
  created_at timestamptz default now()
);


-- ─── 3. PRESENCES (presença diária dos alunos) ──────────────────────────
create table if not exists presences (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id) on delete cascade,
  data date not null,
  presente boolean not null default true,
  created_at timestamptz default now(),
  unique(aluno_id, data)
);


-- ─── 4. VIDEOS (biblioteca técnica) ─────────────────────────────────────
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


-- ─── 5. CONFIG (preferências da academia) ───────────────────────────────
create table if not exists config (
  id int primary key default 1,
  nome_academia text default 'Art of BJJ',
  tema text check (tema in ('dark', 'light')) default 'dark',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);


-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Define quem pode ler/escrever cada tabela
-- ════════════════════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table schedule enable row level security;
alter table presences enable row level security;
alter table videos enable row level security;
alter table config enable row level security;


-- ─── Função helper: verifica se o usuário logado é professor ────────────
create or replace function is_professor()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'professor'
  );
$$ language sql security definer;


-- ─── PROFILES ───────────────────────────────────────────────────────────
-- Todo mundo logado vê todos os perfis (necessário para listar alunos)
create policy "Authenticated can read profiles"
  on profiles for select using (auth.role() = 'authenticated');

-- Aluno só edita o próprio perfil
create policy "User updates own profile"
  on profiles for update using (auth.uid() = id);

-- Professor pode editar qualquer perfil
create policy "Professor updates any profile"
  on profiles for update using (is_professor());

-- Professor pode deletar perfis (alunos)
create policy "Professor deletes profiles"
  on profiles for delete using (is_professor());


-- ─── SCHEDULE ───────────────────────────────────────────────────────────
-- Todo mundo logado vê a grade
create policy "Authenticated reads schedule"
  on schedule for select using (auth.role() = 'authenticated');

-- Só professor edita
create policy "Professor manages schedule"
  on schedule for all using (is_professor());


-- ─── PRESENCES ──────────────────────────────────────────────────────────
-- Aluno vê só as próprias presenças
create policy "Aluno reads own presences"
  on presences for select using (auth.uid() = aluno_id);

-- Professor vê todas
create policy "Professor reads all presences"
  on presences for select using (is_professor());

-- Só professor lança presença
create policy "Professor manages presences"
  on presences for all using (is_professor());


-- ─── VIDEOS ─────────────────────────────────────────────────────────────
-- Todo mundo logado vê os vídeos
create policy "Authenticated reads videos"
  on videos for select using (auth.role() = 'authenticated');

-- Só professor adiciona/edita
create policy "Professor manages videos"
  on videos for all using (is_professor());


-- ─── CONFIG ─────────────────────────────────────────────────────────────
create policy "Authenticated reads config"
  on config for select using (auth.role() = 'authenticated');

create policy "Professor manages config"
  on config for all using (is_professor());


-- ════════════════════════════════════════════════════════════════════════
-- TRIGGER: cria profile automaticamente quando alguém faz signup
-- ════════════════════════════════════════════════════════════════════════

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nome, email, role, faixa)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'aluno'),
    coalesce(new.raw_user_meta_data->>'faixa', 'white')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ════════════════════════════════════════════════════════════════════════
-- CONFIG INICIAL
-- ════════════════════════════════════════════════════════════════════════

insert into config (id, nome_academia, tema)
values (1, 'Art of BJJ', 'dark')
on conflict (id) do nothing;


-- Pronto. Banco montado. ✓
