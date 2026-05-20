-- ════════════════════════════════════════════════════════════════════════
-- EVENTOS + NOTIFICAÇÕES
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── EVENTOS ─────────────────────────────────────────────────────────────
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data_evento date not null,
  hora text,
  local text,
  descricao text,
  criado_em timestamptz default now()
);

create index if not exists idx_eventos_data on eventos(data_evento desc);

alter table eventos enable row level security;

drop policy if exists "Todos autenticados veem eventos" on eventos;
create policy "Todos autenticados veem eventos"
  on eventos for select
  using (auth.uid() is not null);

drop policy if exists "Só professor gerencia eventos" on eventos;
create policy "Só professor gerencia eventos"
  on eventos for all
  using (is_professor())
  with check (is_professor());

-- ── NOTIFICAÇÕES ────────────────────────────────────────────────────────
create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  titulo text not null,
  texto text,
  link text,
  lida boolean default false,
  criado_em timestamptz default now()
);

create index if not exists idx_notif_user on notificacoes(user_id, criado_em desc);
create index if not exists idx_notif_lida on notificacoes(user_id) where lida = false;

alter table notificacoes enable row level security;

drop policy if exists "Aluno vê próprias notificações" on notificacoes;
create policy "Aluno vê próprias notificações"
  on notificacoes for select
  using (auth.uid() = user_id);

drop policy if exists "Aluno marca próprias como lidas" on notificacoes;
create policy "Aluno marca próprias como lidas"
  on notificacoes for update
  using (auth.uid() = user_id);

drop policy if exists "Sistema/Professor cria notificações" on notificacoes;
create policy "Sistema/Professor cria notificações"
  on notificacoes for insert
  with check (is_professor() or auth.uid() is not null);

-- ── Trigger: ao criar recado, notifica todos os alunos ─────────────────
create or replace function notificar_novo_recado() returns trigger
language plpgsql security definer
as $$
begin
  insert into notificacoes (user_id, titulo, texto)
  select id, '📌 Novo recado no mural', new.titulo
  from profiles
  where role = 'aluno';
  return new;
end;
$$;

drop trigger if exists trg_notificar_recado on mural_recados;
create trigger trg_notificar_recado
  after insert on mural_recados
  for each row execute function notificar_novo_recado();

-- ── Trigger: ao criar evento, notifica todos os alunos ─────────────────
create or replace function notificar_novo_evento() returns trigger
language plpgsql security definer
as $$
begin
  insert into notificacoes (user_id, titulo, texto)
  select id, '🏆 Novo evento', new.titulo || ' · ' || to_char(new.data_evento, 'DD/MM/YYYY')
  from profiles
  where role = 'aluno';
  return new;
end;
$$;

drop trigger if exists trg_notificar_evento on eventos;
create trigger trg_notificar_evento
  after insert on eventos
  for each row execute function notificar_novo_evento();

commit;
