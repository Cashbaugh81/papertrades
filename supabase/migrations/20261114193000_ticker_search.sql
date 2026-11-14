-- ---------------------------------------------------------------------------
-- Ticker search by name ("netflix" → NFLX), via Tiingo's search endpoint.
--
-- Every Tiingo search counts against the free plan (50 requests an hour), so
-- the `search` function caches each query for 30 days and remembers every
-- ticker and name it has seen; when Tiingo can't be reached it searches those
-- instead. Only the server (service role) reads or writes these tables.
-- ---------------------------------------------------------------------------

create table public.symbols (
  ticker text primary key,
  name text not null,
  asset_type text not null default '',
  updated_at timestamptz not null default now()
);
comment on table public.symbols is 'Tickers and names seen in Tiingo search results; the fallback when Tiingo is unavailable.';

create table public.symbol_search_cache (
  query text primary key,
  results jsonb not null,
  fetched_at timestamptz not null default now()
);
comment on table public.symbol_search_cache is 'Tiingo search results by normalised query, kept 30 days.';

alter table public.symbols enable row level security;
alter table public.symbol_search_cache enable row level security;
revoke all on public.symbols, public.symbol_search_cache from anon, authenticated;
