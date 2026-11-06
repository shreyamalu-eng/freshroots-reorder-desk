-- v2: Gemini-written reasons and Zoho Inventory orders.

alter table runs add column if not exists summary text;
alter table runs add column if not exists summary_source text not null default 'template';

alter table recommendations add column if not exists reason_source text not null default 'template'
  check (reason_source in ('template', 'gemini'));
alter table recommendations add column if not exists rejected_ai_reason text;

-- Open POs can come from Zoho (synced before each run) or be entered by hand.
alter table open_pos add column if not exists source text not null default 'manual';
alter table open_pos add column if not exists synced_at timestamptz;

-- Draft purchase orders the desk created in Zoho after a hand-off. Procurement issues them in Zoho.
create table if not exists zoho_pos (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  vendor_name text not null,
  zoho_po_id text,
  zoho_po_number text,
  status text not null check (status in ('draft', 'issued', 'failed', 'skipped')),
  line_count integer not null default 0,
  total_units integer not null default 0,
  error text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists zoho_pos_run_idx on zoho_pos (run_id);
