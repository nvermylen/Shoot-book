-- Migration: 005 | invoice and payment tables ("who owes") | 2026-07-07
--
-- LENS-022a: the money half of the morning sweep.
--
-- 1) invoice + payment tables per ERP_DATA_MODEL, with one deliberate
--    divergence: no 'overdue' in the stored status enum. Overdue is DERIVED
--    at read time (due_date < today while sent/partial) so the sweep can
--    never show a stale status (HABIT_DESIGN Rule 4). ERP_DATA_MODEL.md is
--    updated in the same PR to record this (LENS-D-023).
--
-- 2) booking.deposit_invoice_id / final_invoice_id were created as text in
--    migration_002 (invoice table didn't exist yet). No feature has ever
--    written them; a pre-flight guard below halts if any row is non-null.
--    Converted to uuid FKs.
--
-- 3) comm_log gains nullable invoice_id: payment reminders are logged
--    against the invoice they chase, and chase state (what was already
--    sent) is derived from the append-only log — no separate state table
--    (LENS-D-024).
--
-- Apply manually to BOTH Supabase projects (prod + test) per the
-- test-topology rules; both must stay migration-identical.

BEGIN;

-- ============================================================
-- invoice
-- ============================================================
create table invoice (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  booking_id uuid not null references booking(id),
  client_id uuid not null references client(id),
  amount_cents int not null check (amount_cents > 0),
  kind text not null check (kind in ('deposit', 'final', 'addon', 'refund')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partial', 'paid', 'cancelled')),
  due_date date not null,
  recipient_email text not null,
  stripe_payment_link_url text,
  stripe_payment_intent_id text,
  quickbooks_invoice_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table invoice enable row level security;

create policy "Photographers can view their own invoices"
  on invoice for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own invoices"
  on invoice for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own invoices"
  on invoice for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own invoices"
  on invoice for delete
  using (photographer_id = auth.uid());

create index invoice_photographer_id_idx on invoice(photographer_id);
create index invoice_booking_id_idx on invoice(booking_id);
create index invoice_client_id_idx on invoice(client_id);

-- The morning-sweep query: open money, ordered by due date. Partial index
-- keeps it fast at any invoice volume.
create index invoice_open_sweep_idx
  on invoice(photographer_id, due_date)
  where status in ('sent', 'partial') and deleted_at is null;

create trigger invoice_updated_at
  before update on invoice
  for each row execute function set_updated_at();

-- ============================================================
-- payment
-- ============================================================
create table payment (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  invoice_id uuid not null references invoice(id),
  amount_cents int not null check (amount_cents > 0),
  method text not null check (method in ('stripe', 'cash', 'check', 'other')),
  stripe_charge_id text,
  received_at timestamptz not null default now(),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment enable row level security;

create policy "Photographers can view their own payments"
  on payment for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own payments"
  on payment for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own payments"
  on payment for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

-- Delete allowed at RLS level for manual-entry corrections (a fat-fingered
-- check amount). The ERP layer is the gate: once Stripe lands, stripe-
-- sourced payments must refuse deletion in code.
create policy "Photographers can delete their own payments"
  on payment for delete
  using (photographer_id = auth.uid());

create index payment_photographer_id_idx on payment(photographer_id);
create index payment_invoice_id_idx on payment(invoice_id);

create trigger payment_updated_at
  before update on payment
  for each row execute function set_updated_at();

-- ============================================================
-- booking: convert text invoice refs (migration_002) to real FKs
-- ============================================================

-- Pre-flight guard: no invoice feature has ever written these columns, so
-- every row must be null. A non-null value means an assumption this
-- migration rests on is wrong — halt for human inspection, don't coerce.
do $$
begin
  if exists (
    select 1 from booking
    where deposit_invoice_id is not null
       or final_invoice_id is not null
  ) then
    raise exception 'booking has non-null deposit_invoice_id/final_invoice_id rows — inspect before converting to uuid. Run: select id, deposit_invoice_id, final_invoice_id from booking where deposit_invoice_id is not null or final_invoice_id is not null;';
  end if;
end $$;

alter table booking
  alter column deposit_invoice_id type uuid using deposit_invoice_id::uuid,
  alter column final_invoice_id type uuid using final_invoice_id::uuid;

alter table booking
  add constraint booking_deposit_invoice_id_fkey
    foreign key (deposit_invoice_id) references invoice(id),
  add constraint booking_final_invoice_id_fkey
    foreign key (final_invoice_id) references invoice(id);

-- ============================================================
-- comm_log: reminders are logged against the invoice they chase
-- ============================================================
alter table comm_log add column invoice_id uuid references invoice(id);

create index comm_log_invoice_id_idx on comm_log(invoice_id)
  where invoice_id is not null;

COMMIT;
