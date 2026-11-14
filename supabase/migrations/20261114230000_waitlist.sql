-- ---------------------------------------------------------------------------
-- Paid-tier waitlist (Chris, 14 Nov). The upgrade window's "Join Waitlist"
-- button calls join_waitlist(), which records the signed-in user once, with
-- their email and what they were trying to do. Users can see only their own
-- row; Chris reads the list in the Supabase dashboard or with SQL.
-- ---------------------------------------------------------------------------

create table public.waitlist (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.waitlist is 'People who asked to hear about the paid tier ($2.99/month).';

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant select on public.waitlist to authenticated;
create policy "own waitlist row: read" on public.waitlist for select to authenticated
  using (user_id = (select auth.uid()));

create function public.join_waitlist(p_reason text default '')
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  joined timestamptz;
begin
  if uid is null then raise exception 'sign in first'; end if;
  insert into public.waitlist (user_id, email, reason)
  select uid, u.email, left(coalesce(p_reason, ''), 40) from auth.users u where u.id = uid
  on conflict (user_id) do nothing;
  select created_at into joined from public.waitlist where user_id = uid;
  return joined;
end;
$$;
revoke execute on function public.join_waitlist(text) from public, anon;
grant execute on function public.join_waitlist(text) to authenticated;
