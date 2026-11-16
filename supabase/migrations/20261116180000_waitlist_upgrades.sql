-- ---------------------------------------------------------------------------
-- "Join Waitlist" now upgrades the account (Chris, 16 Nov). join_waitlist()
-- still records the waitlist row, and also makes the caller's plan 'paid',
-- lifting the free limits. Admin stays admin. Nothing is charged.
-- Anyone signed in can therefore make themselves paid: that is the intent
-- for now, while there is no purchase flow.
-- ---------------------------------------------------------------------------

create or replace function public.join_waitlist(p_reason text default '')
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

  insert into public.account_plans (user_id, plan) values (uid, 'paid')
  on conflict (user_id) do update set plan = 'paid', updated_at = now()
    where public.account_plans.plan = 'free';

  select created_at into joined from public.waitlist where user_id = uid;
  return joined;
end;
$$;
revoke execute on function public.join_waitlist(text) from public, anon;
grant execute on function public.join_waitlist(text) to authenticated;

-- Anyone already on the waitlist gets the same upgrade.
insert into public.account_plans (user_id, plan)
select w.user_id, 'paid' from public.waitlist w
on conflict (user_id) do update set plan = 'paid', updated_at = now()
  where public.account_plans.plan = 'free';
