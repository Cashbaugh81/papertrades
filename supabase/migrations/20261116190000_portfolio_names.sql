-- ---------------------------------------------------------------------------
-- Portfolio names (Chris, 16 Nov). A portfolio shows as "Portfolio N" unless
-- its owner names it. The chosen name lives in its own column, so a mix
-- change (which rewrites `name` to the mix) never overwrites it.
-- ---------------------------------------------------------------------------

alter table public.portfolios
  add column custom_name text
  check (custom_name is null or char_length(custom_name) between 1 and 40);
comment on column public.portfolios.custom_name is 'Name the owner chose; null shows "Portfolio N".';

-- Owners rename through the existing "own portfolios: rename" update policy.
grant update (custom_name) on public.portfolios to authenticated;

-- create_comparison_set: each column may carry a "customName" (kept when the
-- start date changes or a comparison is re-run). Otherwise unchanged.
create or replace function public.create_comparison_set(p_start_date date, p_initial numeric, p_weekly numeric, p_columns jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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

    insert into public.portfolios (user_id, set_id, slot, name, thesis, start_date, custom_name)
    values (uid, set_id, slot_no,
            left(coalesce(nullif(trim(col ->> 'name'), ''), public.mix_name(col -> 'weights')), 80),
            '', p_start_date,
            left(nullif(trim(col ->> 'customName'), ''), 40))
    returning id into pid;

    insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status)
    values (pid, uid, 'rebalance', col -> 'weights', p_start_date,
            case when is_what_if then null else now() end,
            case when is_what_if then 'filled' else 'pending' end);
  end loop;

  return set_id;
end;
$function$;
