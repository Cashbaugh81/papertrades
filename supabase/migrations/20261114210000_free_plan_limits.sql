-- ---------------------------------------------------------------------------
-- Account plans and the free plan's limits (Chris, 14 Nov).
--
-- Every account is 'free' unless account_plans says 'paid' or 'admin'.
-- Free accounts:
--   1. Portfolio 1 is always VTI 100% and can't be changed.
--   2. At most 3 portfolios (slots 1-3).
--   3. Portfolios hold at most 3 tickers each.
-- Paid and admin accounts have no limits beyond the app's own (10 portfolios,
-- 8 tickers). Limits are enforced here, in every path that writes a mix:
-- create_comparison_set, add_column, replace_column and direct rebalance
-- inserts. Messages that start with "upgrade_required:" are the ones a paid
-- account would lift; the app shows them as an upgrade prompt.
-- ---------------------------------------------------------------------------

create table public.account_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'paid', 'admin')),
  updated_at timestamptz not null default now()
);
comment on table public.account_plans is 'Plan per account; no row means free. Only the server and admins (via SQL) change it.';

alter table public.account_plans enable row level security;
revoke all on public.account_plans from anon, authenticated;
grant select on public.account_plans to authenticated;
create policy "own plan: read" on public.account_plans for select to authenticated
  using (user_id = (select auth.uid()));

create function public.plan_of(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select plan from public.account_plans where user_id = p_uid), 'free')
$$;
revoke execute on function public.plan_of(uuid) from public, anon, authenticated;

create function public.check_plan(p_uid uuid, p_slot int, p_weights jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Always the signed-in user's own plan (every caller passes auth.uid()),
  -- so calling this directly says nothing about anyone else.
  if public.plan_of(auth.uid()) <> 'free' then return; end if;
  if p_slot is not null and p_slot > 3 then
    raise exception 'upgrade_required: Free accounts can compare up to 3 portfolios.';
  end if;
  if p_slot = 1 and p_weights is distinct from '{"VTI": 1}'::jsonb then
    raise exception 'Portfolio 1 is always the whole US market (VTI).';
  end if;
  if (select count(*) from jsonb_object_keys(p_weights)) > 3 then
    raise exception 'upgrade_required: Free portfolios can hold up to 3 tickers.';
  end if;
end;
$$;
revoke execute on function public.check_plan(uuid, int, jsonb) from public, anon;
-- The insert trigger runs as the signed-in user, so they may call it; it only refuses.
grant execute on function public.check_plan(uuid, int, jsonb) to authenticated;

create or replace function public.create_comparison_set(
  p_start_date date,
  p_initial numeric,
  p_weekly numeric,
  p_columns jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  is_what_if boolean;
  set_id uuid;
  col jsonb;
  pid uuid;
  slot_no int;
  seen int[] := '{}';
begin
  if uid is null then raise exception 'sign in first'; end if;
  if p_start_date is null or p_start_date > today then
    raise exception 'the start date can''t be in the future';
  end if;
  if p_start_date < date '2000-01-03' then
    raise exception 'prices go back to January 2000';
  end if;
  if coalesce(p_initial, 0) < 0 or coalesce(p_weekly, 0) < 0 then
    raise exception 'amounts can''t be negative';
  end if;
  if coalesce(p_initial, 0) = 0 and coalesce(p_weekly, 0) = 0 then
    raise exception 'enter a starting amount, a weekly amount, or both';
  end if;
  if p_initial > 100000000 or p_weekly > 1000000 then
    raise exception 'that amount is too large';
  end if;
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) not between 1 and 10 then
    raise exception 'choose 1 to 10 portfolios';
  end if;

  if public.plan_of(uid) = 'free' and not exists (
    select 1 from jsonb_array_elements(p_columns) c where (c ->> 'slot')::int = 1
  ) then
    raise exception 'Portfolio 1 is always the whole US market (VTI).';
  end if;

  is_what_if := p_start_date < today;

  update public.comparison_sets set archived_at = now()
  where user_id = uid and archived_at is null;

  insert into public.comparison_sets (user_id, start_date, initial, weekly, what_if)
  values (uid, p_start_date, coalesce(p_initial, 0), coalesce(p_weekly, 0), is_what_if)
  returning id into set_id;

  for col in select * from jsonb_array_elements(p_columns) loop
    slot_no := (col ->> 'slot')::int;
    if slot_no is null or slot_no not between 1 and 10 or slot_no = any (seen) then
      raise exception 'each portfolio needs its own slot, 1 to 10';
    end if;
    seen := seen || slot_no;
    perform public.validate_mix(col -> 'weights');
    perform public.check_plan(uid, slot_no, col -> 'weights');

    insert into public.portfolios (user_id, set_id, slot, name, thesis, start_date)
    values (uid, set_id, slot_no,
            left(coalesce(nullif(trim(col ->> 'name'), ''), public.mix_name(col -> 'weights')), 80),
            '', p_start_date)
    returning id into pid;

    -- The first mix. A live set's fills at the next close after now; a
    -- what-if's fills at the start date's close (computed by the engine).
    insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status)
    values (pid, uid, 'rebalance', col -> 'weights', p_start_date,
            case when is_what_if then null else now() end,
            case when is_what_if then 'filled' else 'pending' end);
  end loop;

  return set_id;
end;
$$;

-- Add a portfolio to the active set. It starts alongside the others (since
-- 14 Nov, matching replace_column): in a what-if from the start date's close,
-- in a live set at the same close as the set's first portfolios.
create or replace function public.add_column(p_set uuid, p_slot int, p_name text, p_weights jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.comparison_sets;
  first_placed timestamptz;
  pid uuid;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select * into s from public.comparison_sets where id = p_set and user_id = uid;
  if s.id is null then raise exception 'comparison not found'; end if;
  if s.archived_at is not null then raise exception 'that comparison has been closed'; end if;
  if p_slot is null or p_slot not between 1 and 10 then raise exception 'slot must be 1 to 10'; end if;
  if exists (select 1 from public.portfolios where set_id = p_set and slot = p_slot) then
    raise exception 'that column is already filled';
  end if;
  perform public.validate_mix(p_weights);
  perform public.check_plan(uid, p_slot, p_weights);

  -- When the set's money first went in (live sets).
  select min(t.placed_at) into first_placed
  from public.transactions t join public.portfolios p on p.id = t.portfolio_id
  where p.set_id = p_set and t.kind = 'rebalance';

  insert into public.portfolios (user_id, set_id, slot, name, thesis, start_date)
  values (uid, p_set, p_slot, left(coalesce(nullif(trim(p_name), ''), public.mix_name(p_weights)), 80), '', s.start_date)
  returning id into pid;

  insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status)
  values (pid, uid, 'rebalance', p_weights, s.start_date,
          case when s.what_if then null else coalesce(first_placed, s.created_at) end,
          case when s.what_if then 'filled' else 'pending' end);
  return pid;
end;
$$;


create or replace function public.replace_column(p_portfolio uuid, p_weights jsonb, p_name text default '', p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.portfolios;
  s public.comparison_sets;
  first_tx public.transactions;
  old_mix jsonb;
  today date := (now() at time zone 'America/New_York')::date;
  note text;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select * into p from public.portfolios where id = p_portfolio and user_id = uid;
  if p.id is null then raise exception 'portfolio not found'; end if;
  select * into s from public.comparison_sets where id = p.set_id;
  if s.archived_at is not null then raise exception 'that comparison has been closed'; end if;
  perform public.validate_mix(p_weights);
  perform public.check_plan(uid, p.slot, p_weights);

  -- The original start: the earliest mix in this column.
  select * into first_tx from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz), created_at
  limit 1;

  -- What it holds now, for the note: the latest mix.
  select weights into old_mix from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz) desc, created_at desc
  limit 1;

  note := 'Replaced ' || coalesce(public.mix_name(old_mix), 'the old mix') || ' on '
          || to_char(today, 'Mon FMDD, YYYY') || '.';
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    note := note || ' ' || left(trim(p_note), 500);
  end if;

  delete from public.transactions where portfolio_id = p.id;

  update public.portfolios
  set name = left(coalesce(nullif(trim(p_name), ''), public.mix_name(p_weights)), 80)
  where id = p.id;

  insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status, note)
  values (
    p.id, uid, 'rebalance', p_weights,
    coalesce(first_tx.trade_date, p.start_date),
    case when s.what_if then null else coalesce(first_tx.placed_at, p.created_at) end,
    case when s.what_if then 'filled' else 'pending' end,
    note
  );
  return p.id;
end;
$$;


create or replace function public.transactions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  archived timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- RPCs (security definer), service role, migrations: trusted
  end if;

  select s.archived_at into archived
  from public.portfolios p
  join public.comparison_sets s on s.id = p.set_id
  where p.id = new.portfolio_id;
  if archived is not null then
    raise exception 'that comparison has been closed';
  end if;

  new.user_id := auth.uid();
  new.filled_on := null;
  new.fill_price := null;
  new.fill_units := null;
  new.fill_amount := null;
  new.reject_reason := null;
  new.processed_at := null;
  new.placed_at := now();
  new.trade_date := (now() at time zone 'America/New_York')::date;

  if new.kind = 'rebalance' then
    perform public.validate_mix(new.weights);
    perform public.check_plan(auth.uid(), (select slot from public.portfolios where id = new.portfolio_id), new.weights);
    new.ticker := null;
    new.amount := null;
    new.units := null;
    new.status := 'pending';
  elsif new.kind = 'deposit' then
    new.weights := null;
    new.status := 'filled';
  else
    if new.amount is null then
      raise exception 'orders are sized in dollars (amount)';
    end if;
    new.weights := null;
    new.units := null;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

