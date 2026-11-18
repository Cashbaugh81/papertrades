-- ---------------------------------------------------------------------------
-- Per-account settings (Chris, 18 Nov). First use: the lesson cards on the
-- dashboard. "Hide" is remembered on the account, so it holds on every sign-in
-- and device; the card a person is on is kept too.
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lessons_hidden boolean not null default false,
  lesson_index int not null default 0 check (lesson_index between 0 and 1000),
  updated_at timestamptz not null default now()
);
comment on table public.user_settings is 'One row per account for UI settings; no row means defaults. Owners read and write their own row.';

alter table public.user_settings enable row level security;

create policy "own settings: read" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own settings: insert" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own settings: update" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.user_settings from anon;
grant select, insert, update on public.user_settings to authenticated;
