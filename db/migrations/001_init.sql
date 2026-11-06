-- Freshroots demand planner on Neon Postgres.
-- Run with a DIRECT (non-pooled) connection: npm run db:migrate

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ---------- master data ----------
create table if not exists distributors (
  id text primary key,
  name text not null,
  region text,
  status text not null default 'Active'
);

create table if not exists sku_master (
  sku text primary key,
  name text not null,
  category text not null,
  perishable boolean not null default false,
  standard_qty integer not null check (standard_qty > 0),
  unit_price numeric(10, 2) not null default 1 check (unit_price >= 0),
  launch_date date not null,
  active boolean not null default true,
  distributor_id text references distributors (id),
  uom text not null default 'Units',
  updated_at timestamptz not null default now()
);

create table if not exists festival_calendar (
  year integer not null,
  month integer not null check (month between 1 and 12),
  is_festival boolean not null,
  primary key (year, month)
);

create table if not exists rule_settings (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- inputs (SAP export, Zoho) ----------
create table if not exists sales_weekly (
  week_start date not null,
  sku text not null references sku_master (sku),
  distributor_id text not null default 'ALL',
  units integer not null check (units >= 0),
  primary key (week_start, sku, distributor_id)
);

create table if not exists stock_snapshots (
  as_of date not null,
  sku text not null references sku_master (sku),
  location text not null,
  on_hand integer not null,
  primary key (as_of, sku, location)
);

create table if not exists open_pos (
  po_number text not null,
  sku text not null references sku_master (sku),
  qty integer not null check (qty >= 0),
  eta date,
  primary key (po_number, sku)
);

-- ---------- runs and the human gate ----------
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  last_complete_week date,
  stock_as_of date,
  festival boolean,
  settings jsonb not null,
  status text not null default 'ready' check (status in ('ready', 'blocked', 'sent')),
  counts jsonb,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists runs_created_idx on runs (created_at desc);

create table if not exists recommendations (
  run_id uuid not null references runs (id) on delete cascade,
  sku text not null references sku_master (sku),
  status text not null check (status in ('reorder_now', 'reorder', 'pause', 'ok', 'exception', 'held')),
  recommended_qty integer,
  cover_weeks numeric,
  rupees_at_risk numeric not null default 0,
  reason text not null,
  detail jsonb not null,             -- the full engine Recommendation
  primary key (run_id, sku)
);

create table if not exists decisions (
  run_id uuid not null references runs (id) on delete cascade,
  sku text not null,
  decision text not null check (decision in ('approved', 'edited', 'rejected', 'decided')),
  final_qty integer check (final_qty is null or final_qty >= 0),
  note text,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  primary key (run_id, sku),
  foreign key (run_id, sku) references recommendations (run_id, sku) on delete cascade,
  check (decision = 'approved' or (note is not null and length(trim(note)) > 0)),
  check (decision = 'rejected' or final_qty is not null)
);

create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  line_count integer not null,
  total_units integer not null,
  csv text not null,
  sent_by text not null,
  sent_at timestamptz not null default now()
);
