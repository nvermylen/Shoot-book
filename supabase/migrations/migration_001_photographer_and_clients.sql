-- Migration: 001 | photographer and client tables | 2026-05-04

-- ============================================================
-- photographer
-- ============================================================
create table photographer (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  display_name text not null,
  timezone text not null default 'America/Chicago',
  default_email_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table photographer enable row level security;

create policy "Users can view their own photographer row"
  on photographer for select
  using (id = auth.uid());

create policy "Users can insert their own photographer row"
  on photographer for insert
  with check (id = auth.uid());

create policy "Users can update their own photographer row"
  on photographer for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- auto-update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger photographer_updated_at
  before update on photographer
  for each row execute function set_updated_at();

-- ============================================================
-- client
-- ============================================================
create table client (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  display_name text not null,
  email text not null,
  phone text,
  parent_email text,
  parent_name text,
  parent_phone text,
  notes text,
  source text not null default 'manual'
    check (source in ('web_form', 'gmail', 'manual', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table client enable row level security;

create policy "Photographers can view their own clients"
  on client for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own clients"
  on client for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own clients"
  on client for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can soft-delete their own clients"
  on client for delete
  using (photographer_id = auth.uid());

create index client_photographer_id_idx on client(photographer_id);

create trigger client_updated_at
  before update on client
  for each row execute function set_updated_at();

-- ============================================================
-- lead
-- ============================================================
create table lead (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  display_name text not null,
  email text not null,
  phone text,
  source text not null default 'other'
    check (source in ('web_form', 'gmail_inbound', 'referral', 'social', 'other')),
  intent_summary text,
  qualification_status text not null default 'new'
    check (qualification_status in ('new', 'qualified', 'disqualified', 'converted')),
  qualification_notes text,
  converted_client_id uuid references client(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table lead enable row level security;

create policy "Photographers can view their own leads"
  on lead for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own leads"
  on lead for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own leads"
  on lead for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own leads"
  on lead for delete
  using (photographer_id = auth.uid());

create index lead_photographer_id_idx on lead(photographer_id);
create index lead_qualification_status_idx on lead(photographer_id, qualification_status);

create trigger lead_updated_at
  before update on lead
  for each row execute function set_updated_at();
