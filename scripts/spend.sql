-- Applied 2026-09-17. The spend ledger and the monthly ceiling.
--
-- WHY. Until now the product's only cost signal was a balance reaching
-- zero. Both call paths computed their cost correctly and wrote it to
-- console.log, where Vercel discards it — so "I keep running out more than
-- I should" could not be answered, only felt. This table is the answer.
--
-- Operator data, not product data: RLS on, no policy, no grants. Nothing
-- in the app reads a row. The budget gate reads one aggregate through
-- month_to_date_spend(), which is SECURITY DEFINER and returns a single
-- number — the same boundary pattern as clip_descriptions and
-- panel_composition.
--
-- clip_id is ON DELETE SET NULL, not CASCADE: deleting a clip must not
-- erase the record that money was spent on it. The row is an accounting
-- fact about the past, and a ledger you can edit by deleting its subject
-- is not a ledger.

create table if not exists api_spend (
  id                  uuid primary key default gen_random_uuid(),
  at                  timestamptz not null default now(),
  model               text not null,
  kind                text not null,
  clip_id             uuid references clips(id) on delete set null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_write_tokens  integer not null default 0,
  cache_read_tokens   integer not null default 0,
  usd                 numeric(12,8) not null default 0,
  -- False when the model had no entry in lib/claude/pricing.ts. Recorded
  -- rather than dropped: a model nobody priced is the one about to
  -- surprise you, and a silent $0 is how a ceiling stops working.
  priced              boolean not null default true
);

create index if not exists api_spend_at_idx on api_spend (at desc);

alter table api_spend enable row level security;
revoke all on api_spend from anon, authenticated;

-- UTC month, matching how the Anthropic console reports a billing period.
-- A local-time month would reset the ceiling at a different hour than the
-- bill, which is the kind of off-by-a-few-hours that shows up once, at
-- month end, and takes an afternoon to understand.
create or replace function month_to_date_spend()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(usd), 0)
  from api_spend
  where at >= date_trunc('month', now() at time zone 'utc');
$$;

revoke all on function month_to_date_spend() from public, anon, authenticated;


-- ------------------------------------------------------------------
-- Added 2026-09-17, hours after the above: the ceiling was measuring the
-- wrong period.
--
-- month_to_date_spend() assumes a monthly allowance. The actual constraint
-- is a PREPAID BALANCE — $6 added on 17 September that has to last until
-- 16 October — and that window crosses a month boundary. A calendar
-- ceiling would have reset on 1 October and handed out the same $6 a
-- second time, reporting everything as fine right up to the moment the
-- account went dry. Money is not a calendar.
--
-- month_to_date_spend() is kept, because the Anthropic console bills on a
-- calendar month and scripts/spend-report.ts shows both: one number
-- answers "will this last", the other answers "what will the invoice say".

create or replace function spend_since(from_at timestamptz)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(usd), 0) from api_spend where at >= from_at;
$$;

revoke all on function spend_since(timestamptz) from public, anon, authenticated;
