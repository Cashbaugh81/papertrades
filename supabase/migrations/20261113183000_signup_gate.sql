-- Private sign-up gate.
--
-- Accounts can only be created through the `signup` edge function. It checks
-- the chosen password against a secret word kept in Vault (secret name
-- 'signup_gate_word', created separately so the word is not in this
-- repository), then creates the user with app_metadata.signup_gate = 'passed'.
--
-- Any other route (the public /auth/v1/signup endpoint called directly with
-- the publishable key, for example) is refused by the trigger below.

-- Called by the signup function with the service role. The word itself never
-- leaves Postgres.
create function public.signup_gate_ok(p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'signup_gate_word'
      and length(decrypted_secret) > 0
      and position(decrypted_secret in p_password) > 0
  )
$$;

revoke execute on function public.signup_gate_ok(text) from public, anon, authenticated;
grant execute on function public.signup_gate_ok(text) to service_role;

-- Runs as the inserting role. Supabase Auth inserts users as
-- supabase_auth_admin; a user created through the gate carries the flag in
-- app_metadata, which the public sign-up endpoint cannot set.
-- Inserts by other roles (the postgres role, for test accounts) are allowed.
create function public.enforce_signup_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'supabase_auth_admin'
     and coalesce(new.raw_app_meta_data ->> 'signup_gate', '') <> 'passed' then
    raise exception 'this is not a public site for use';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_signup_gate() from public, anon, authenticated;
grant execute on function public.enforce_signup_gate() to supabase_auth_admin;

create trigger enforce_signup_gate
  before insert on auth.users
  for each row execute function public.enforce_signup_gate();
