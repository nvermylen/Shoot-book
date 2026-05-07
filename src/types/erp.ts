// ---------------------------------------------------------------------------
// Status / enum union types — values match CHECK constraints in migrations
// ---------------------------------------------------------------------------

export type ClientSource =
  | 'web_form'
  | 'gmail'
  | 'manual'
  | 'imported';

export type LeadSource =
  | 'web_form'
  | 'gmail_inbound'
  | 'referral'
  | 'social'
  | 'other';

export type LeadQualificationStatus =
  | 'new'
  | 'qualified'
  | 'disqualified'
  | 'converted';

export type PackageSessionType =
  | 'senior'
  | 'family'
  | 'couples'
  | 'newborn'
  | 'event'
  | 'custom';

export type LocationCategory =
  | 'nature_rustic'
  | 'downtown'
  | 'studio'
  | 'beach'
  | 'custom';

export type BookingStatus =
  | 'tentative'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export type CommDirection =
  | 'inbound'
  | 'outbound';

export type CommChannel =
  | 'email'
  | 'sms'
  | 'in_app';

export type CommLogAgentId =
  | 'comms'
  | 'lead'
  | 'billing'
  | 'manual';

export type CommSequenceStateStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type IntegrationService =
  | 'gmail'
  | 'quickbooks'
  | 'stripe'
  | 'calendar'
  | 'storage';

// ---------------------------------------------------------------------------
// Migration 001 entities
// ---------------------------------------------------------------------------

export interface Photographer {
  id: string;
  business_name: string;
  display_name: string;
  timezone: string;
  default_email_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  photographer_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  parent_email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  notes: string | null;
  source: ClientSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Lead {
  id: string;
  photographer_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  source: LeadSource;
  intent_summary: string | null;
  qualification_status: LeadQualificationStatus;
  qualification_notes: string | null;
  converted_client_id: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Migration 002 entities
// ---------------------------------------------------------------------------

export interface Package {
  id: string;
  photographer_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  deposit_cents: number;
  session_type: PackageSessionType;
  included_locations_count: number;
  included_outfits_count: number | null;
  delivery_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Location {
  id: string;
  photographer_id: string;
  name: string;
  category: LocationCategory;
  description: string | null;
  representative_image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Booking {
  id: string;
  photographer_id: string;
  client_id: string;
  package_id: string;
  session_date: string | null;
  duration_minutes: number | null;
  status: BookingStatus;
  contract_id: string | null;
  deposit_invoice_id: string | null;
  final_invoice_id: string | null;
  external_calendar_event_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookingLocation {
  id: string;
  booking_id: string;
  location_id: string;
  sequence: number;
  created_at: string;
}

export interface Contract {
  id: string;
  booking_id: string;
  client_id: string;
  template_id: string | null;
  content: string;
  signed_at: string | null;
  signature_image_url: string | null;
  signed_ip: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CommSequence {
  id: string;
  photographer_id: string;
  name: string;
  trigger_event: string;
  steps: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommLog {
  id: string;
  photographer_id: string;
  client_id: string | null;
  lead_id: string | null;
  booking_id: string | null;
  direction: CommDirection;
  channel: CommChannel;
  agent_id: CommLogAgentId | null;
  subject: string | null;
  body: string | null;
  external_message_id: string | null;
  sequence_id: string | null;
  sent_at: string;
  created_at: string;
}

export interface CommSequenceState {
  id: string;
  sequence_id: string;
  client_id: string;
  booking_id: string | null;
  current_step: number;
  last_sent_at: string | null;
  status: CommSequenceStateStatus;
  created_at: string;
  updated_at: string;
}

export interface IntegrationCredentials {
  id: string;
  photographer_id: string;
  service: IntegrationService;
  access_token_ciphertext: Uint8Array;
  refresh_token_ciphertext: Uint8Array | null;
  key_version: number;
  expires_at: string | null;
  scope: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AgentToolCallLog {
  id: string;
  photographer_id: string;
  agent_id: string;
  tool_name: string;
  input_hash: string;
  output_hash: string | null;
  status: string;
  latency_ms: number | null;
  prompt_version: string | null;
  called_at: string;
}

export interface DomainEventLog {
  id: string;
  photographer_id: string;
  type: string;
  payload: unknown;
  created_at: string;
}
