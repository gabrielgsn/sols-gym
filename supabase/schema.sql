-- Sols Gym — Supabase schema
-- Rodar no SQL Editor do Supabase (Dashboard → SQL Editor → New query → colar → Run).
-- Idempotente: pode rodar várias vezes sem quebrar.

-- Extensão pra uuid default (já vem ativa em projetos novos)
create extension if not exists "pgcrypto";

-- ========== EXERCISES ==========
create table if not exists public.exercises (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  muscle_group  text not null,
  notes         text,
  created_at    bigint not null,
  updated_at    bigint not null,
  deleted_at    bigint
);
create index if not exists exercises_user_updated on public.exercises(user_id, updated_at);

alter table public.exercises enable row level security;

drop policy if exists "exercises_own" on public.exercises;
create policy "exercises_own" on public.exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========== TEMPLATES ==========
create table if not exists public.templates (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  exercise_ids   text[] not null default '{}',
  created_at     bigint not null,
  updated_at     bigint not null,
  deleted_at     bigint
);
create index if not exists templates_user_updated on public.templates(user_id, updated_at);

alter table public.templates enable row level security;

drop policy if exists "templates_own" on public.templates;
create policy "templates_own" on public.templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========== SESSIONS ==========
create table if not exists public.sessions (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id  text,
  name         text not null,
  started_at   bigint not null,
  finished_at  bigint,
  notes        text,
  updated_at   bigint not null,
  deleted_at   bigint
);
create index if not exists sessions_user_updated on public.sessions(user_id, updated_at);

alter table public.sessions enable row level security;

drop policy if exists "sessions_own" on public.sessions;
create policy "sessions_own" on public.sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========== SETS ==========
create table if not exists public.sets (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id    text not null,
  exercise_id   text not null,
  set_index     int  not null,
  weight        numeric not null,
  reps          int  not null,
  rir           int  not null,
  completed_at  bigint not null,
  updated_at    bigint not null,
  deleted_at    bigint
);
create index if not exists sets_user_updated on public.sets(user_id, updated_at);
create index if not exists sets_user_session on public.sets(user_id, session_id);

alter table public.sets enable row level security;

drop policy if exists "sets_own" on public.sets;
create policy "sets_own" on public.sets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
