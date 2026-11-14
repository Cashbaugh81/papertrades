-- ---------------------------------------------------------------------------
-- Up to 10 portfolios per comparison (Chris, 14 Nov). Was 3.
-- Same functions as in comparison_sets, with the slot range widened.
-- ---------------------------------------------------------------------------

alter table public.portfolios drop constraint portfolios_slot_check;
alter table public.portfolios add constraint portfolios_slot_check check (slot between 1 and 10);

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

