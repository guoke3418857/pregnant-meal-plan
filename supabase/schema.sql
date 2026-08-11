-- 在 Supabase SQL Editor 中执行本文件
-- 孕期用户资料表 + RLS

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  height numeric(5, 1) not null,
  weight numeric(5, 1) not null,
  age integer not null check (age between 18 and 50),
  week integer not null check (week between 1 and 42),
  activity numeric(4, 3) not null default 1.375,
  prefs text[] not null default '{}',
  avoid text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();
