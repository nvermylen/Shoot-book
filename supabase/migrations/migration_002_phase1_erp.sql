-- Migration: 002 | phase 1 erp entities | 2026-05-06

-- ============================================================
-- package
-- ============================================================
create table package (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null,
  deposit_cents int not null,
  session_type text not null
    check (session_type in ('senior', 'family', 'couples', 'newborn', 'event', 'custom')),
  included_locations_count int not null,
  included_outfits_count int,
  delivery_count int not null,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table package enable row level security;

create policy "Photographers can view their own packages"
  on package for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own packages"
  on package for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own packages"
  on package for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own packages"
  on package for delete
  using (photographer_id = auth.uid());

create index package_photographer_id_idx on package(photographer_id);

create trigger package_updated_at
  before update on package
  for each row execute function set_updated_at();

-- ============================================================
-- location
-- ============================================================
create table location (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  name text not null,
  category text not null
    check (category in ('nature_rustic', 'downtown', 'studio', 'beach', 'custom')),
  description text,
  representative_image_url text,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table location enable row level security;

create policy "Photographers can view their own locations"
  on location for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own locations"
  on location for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own locations"
  on location for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own locations"
  on location for delete
  using (photographer_id = auth.uid());

create index location_photographer_id_idx on location(photographer_id);

create trigger location_updated_at
  before update on location
  for each row execute function set_updated_at();

-- ============================================================
-- booking (contract_id FK deferred until contract table exists)
-- ============================================================
create table booking (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  client_id uuid not null references client(id),
  package_id uuid not null references package(id),
  session_date timestamptz,
  duration_minutes int,
  status text not null default 'tentative'
    check (status in ('tentative', 'confirmed', 'completed', 'cancelled')),
  contract_id uuid,
  deposit_invoice_id text,
  final_invoice_id text,
  external_calendar_event_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table booking enable row level security;

create policy "Photographers can view their own bookings"
  on booking for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own bookings"
  on booking for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own bookings"
  on booking for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own bookings"
  on booking for delete
  using (photographer_id = auth.uid());

create index booking_photographer_id_idx on booking(photographer_id);
create index booking_client_id_idx on booking(client_id);
create index booking_package_id_idx on booking(package_id);
create index booking_contract_id_idx on booking(contract_id);

create trigger booking_updated_at
  before update on booking
  for each row execute function set_updated_at();

-- ============================================================
-- booking_location
-- ============================================================
create table booking_location (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references booking(id) on delete cascade,
  location_id uuid not null references location(id),
  sequence int not null,
  created_at timestamptz not null default now()
);

alter table booking_location enable row level security;

create policy "Photographers can view their own booking locations"
  on booking_location for select
  using (exists (
    select 1 from booking b
    where b.id = booking_location.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can insert locations for their own bookings"
  on booking_location for insert
  with check (exists (
    select 1 from booking b
    where b.id = booking_location.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can update their own booking locations"
  on booking_location for update
  using (exists (
    select 1 from booking b
    where b.id = booking_location.booking_id
    and b.photographer_id = auth.uid()
  ))
  with check (exists (
    select 1 from booking b
    where b.id = booking_location.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can delete their own booking locations"
  on booking_location for delete
  using (exists (
    select 1 from booking b
    where b.id = booking_location.booking_id
    and b.photographer_id = auth.uid()
  ));

create index booking_location_booking_id_idx on booking_location(booking_id);
create index booking_location_location_id_idx on booking_location(location_id);

-- same-category enforcement trigger
create or replace function enforce_booking_location_same_category()
returns trigger as $$
declare
  existing_category text;
  new_category text;
begin
  select l.category into new_category
    from location l where l.id = new.location_id;

  select l.category into existing_category
    from booking_location bl
    join location l on l.id = bl.location_id
    where bl.booking_id = new.booking_id
    and bl.id != new.id
    limit 1;

  if existing_category is not null and existing_category != new_category then
    raise exception 'booking_location category mismatch: booking % already has category %, cannot add %',
      new.booking_id, existing_category, new_category;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger booking_location_same_category
  before insert or update on booking_location
  for each row execute function enforce_booking_location_same_category();

-- ============================================================
-- contract
-- ============================================================
create table contract (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references booking(id) on delete cascade,
  client_id uuid not null references client(id),
  template_id uuid,
  content text not null,
  signed_at timestamptz,
  signature_image_url text,
  signed_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table contract enable row level security;

create policy "Photographers can view their own contracts"
  on contract for select
  using (exists (
    select 1 from booking b
    where b.id = contract.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can insert contracts for their own bookings"
  on contract for insert
  with check (exists (
    select 1 from booking b
    where b.id = contract.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can update their own contracts"
  on contract for update
  using (exists (
    select 1 from booking b
    where b.id = contract.booking_id
    and b.photographer_id = auth.uid()
  ))
  with check (exists (
    select 1 from booking b
    where b.id = contract.booking_id
    and b.photographer_id = auth.uid()
  ));

create policy "Photographers can delete their own contracts"
  on contract for delete
  using (exists (
    select 1 from booking b
    where b.id = contract.booking_id
    and b.photographer_id = auth.uid()
  ));

create index contract_booking_id_idx on contract(booking_id);
create index contract_client_id_idx on contract(client_id);

create trigger contract_updated_at
  before update on contract
  for each row execute function set_updated_at();

-- deferred FK: booking.contract_id → contract
alter table booking
  add constraint booking_contract_id_fkey
  foreign key (contract_id) references contract(id)
  on delete set null;

-- ============================================================
-- comm_sequence
-- ============================================================
create table comm_sequence (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  name text not null,
  trigger_event text not null,
  steps jsonb not null,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comm_sequence enable row level security;

create policy "Photographers can view their own comm sequences"
  on comm_sequence for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own comm sequences"
  on comm_sequence for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own comm sequences"
  on comm_sequence for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own comm sequences"
  on comm_sequence for delete
  using (photographer_id = auth.uid());

create index comm_sequence_photographer_id_idx on comm_sequence(photographer_id);

create trigger comm_sequence_updated_at
  before update on comm_sequence
  for each row execute function set_updated_at();

-- ============================================================
-- comm_log (append-only — SELECT and INSERT policies only)
-- ============================================================
create table comm_log (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  client_id uuid references client(id),
  lead_id uuid references lead(id),
  booking_id uuid references booking(id),
  direction text not null
    check (direction in ('inbound', 'outbound')),
  channel text not null
    check (channel in ('email', 'sms', 'in_app')),
  agent_id text
    check (agent_id in ('comms', 'lead', 'billing', 'manual')),
  subject text,
  body text,
  external_message_id text,
  sequence_id uuid references comm_sequence(id),
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table comm_log enable row level security;

create policy "Photographers can view their own comm logs"
  on comm_log for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own comm logs"
  on comm_log for insert
  with check (photographer_id = auth.uid());

create index comm_log_photographer_id_idx on comm_log(photographer_id);
create index comm_log_client_id_idx on comm_log(client_id);
create index comm_log_lead_id_idx on comm_log(lead_id);
create index comm_log_booking_id_idx on comm_log(booking_id);
create index comm_log_sequence_id_idx on comm_log(sequence_id);

-- ============================================================
-- comm_sequence_state
-- ============================================================
create table comm_sequence_state (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references comm_sequence(id) on delete cascade,
  client_id uuid not null references client(id),
  booking_id uuid references booking(id),
  current_step int not null default 0,
  last_sent_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comm_sequence_state enable row level security;

create policy "Photographers can view their own comm sequence states"
  on comm_sequence_state for select
  using (exists (
    select 1 from comm_sequence cs
    where cs.id = comm_sequence_state.sequence_id
    and cs.photographer_id = auth.uid()
  ));

create policy "Photographers can insert their own comm sequence states"
  on comm_sequence_state for insert
  with check (exists (
    select 1 from comm_sequence cs
    where cs.id = comm_sequence_state.sequence_id
    and cs.photographer_id = auth.uid()
  ));

create policy "Photographers can update their own comm sequence states"
  on comm_sequence_state for update
  using (exists (
    select 1 from comm_sequence cs
    where cs.id = comm_sequence_state.sequence_id
    and cs.photographer_id = auth.uid()
  ))
  with check (exists (
    select 1 from comm_sequence cs
    where cs.id = comm_sequence_state.sequence_id
    and cs.photographer_id = auth.uid()
  ));

create policy "Photographers can delete their own comm sequence states"
  on comm_sequence_state for delete
  using (exists (
    select 1 from comm_sequence cs
    where cs.id = comm_sequence_state.sequence_id
    and cs.photographer_id = auth.uid()
  ));

create index comm_sequence_state_sequence_id_idx on comm_sequence_state(sequence_id);
create index comm_sequence_state_client_id_idx on comm_sequence_state(client_id);
create index comm_sequence_state_booking_id_idx on comm_sequence_state(booking_id);

create trigger comm_sequence_state_updated_at
  before update on comm_sequence_state
  for each row execute function set_updated_at();

-- ============================================================
-- integration_credentials (Tier 1 — encrypted tokens)
-- ============================================================
create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  service text not null
    check (service in ('gmail', 'quickbooks', 'stripe', 'calendar', 'storage')),
  access_token_ciphertext bytea not null,
  refresh_token_ciphertext bytea,
  key_version int not null default 1,
  expires_at timestamptz,
  scope text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photographer_id, service)
);

alter table integration_credentials enable row level security;

create policy "Photographers can view their own integration credentials"
  on integration_credentials for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own integration credentials"
  on integration_credentials for insert
  with check (photographer_id = auth.uid());

create policy "Photographers can update their own integration credentials"
  on integration_credentials for update
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "Photographers can delete their own integration credentials"
  on integration_credentials for delete
  using (photographer_id = auth.uid());

create trigger integration_credentials_updated_at
  before update on integration_credentials
  for each row execute function set_updated_at();

-- ============================================================
-- agent_tool_call_log (append-only — SELECT and INSERT policies only)
-- ============================================================
create table agent_tool_call_log (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  agent_id text not null,
  tool_name text not null,
  input_hash text not null,
  output_hash text,
  status text not null,
  latency_ms int,
  prompt_version text,
  called_at timestamptz not null default now()
);

alter table agent_tool_call_log enable row level security;

create policy "Photographers can view their own agent tool call logs"
  on agent_tool_call_log for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own agent tool call logs"
  on agent_tool_call_log for insert
  with check (photographer_id = auth.uid());

create index agent_tool_call_log_photographer_id_called_at_idx
  on agent_tool_call_log(photographer_id, called_at desc);

-- ============================================================
-- domain_event_log (append-only — SELECT and INSERT policies only)
-- ============================================================
create table domain_event_log (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table domain_event_log enable row level security;

create policy "Photographers can view their own domain events"
  on domain_event_log for select
  using (photographer_id = auth.uid());

create policy "Photographers can insert their own domain events"
  on domain_event_log for insert
  with check (photographer_id = auth.uid());

create index domain_event_log_photographer_id_idx on domain_event_log(photographer_id);
