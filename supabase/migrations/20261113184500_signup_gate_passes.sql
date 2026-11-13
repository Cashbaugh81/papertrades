-- Signup gate, take two. Supabase Auth inserts a new user before it writes any
-- custom app_metadata, so the trigger cannot rely on a flag there. Instead the
-- signup function issues a one-time pass for the email (valid for two
-- minutes) just before creating the user, and the trigger consumes it.

create table public.signup_passes (
  email       text primary key,
  expires_at  timestamptz not null default now() + interval '2 minutes'
);
comment on table public.signup_passes is
  'One-time passes issued by the signup function after the password gate. Service role only.';

alter table public.signup_passes enable row level security;  -- no policies: nobody but the service role
revoke all on public.signup_passes from public, anon, authenticated;

-- Removes and reports a valid pass. Security definer so the auth role can use
-- it without being granted the table.
create function public.consume_signup_pass(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_one boolean;
begin
  delete from public.signup_passes where expires_at < now();
  delete from public.signup_passes where email = lower(p_email)
  returning true into found_one;
  return coalesce(found_one, false);
end;
$$;

revoke execute on function public.consume_signup_pass(text) from public, anon, authenticated;
grant execute on function public.consume_signup_pass(text) to supabase_auth_admin, service_role;

create or replace function public.enforce_signup_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'supabase_auth_admin' and not public.consume_signup_pass(new.email) then
    raise exception 'this is not a public site for use';
  end if;
  return new;
end;
$$;
