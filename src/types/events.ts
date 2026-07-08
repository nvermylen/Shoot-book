import type { LeadQualificationStatus, BookingStatus, InvoiceKind } from './erp';

// ---------------------------------------------------------------------------
// Base event shape — all domain events carry these fields
// ---------------------------------------------------------------------------

interface BaseEvent {
  photographer_id: string;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Domain events — discriminated union on `type`
// ---------------------------------------------------------------------------

export interface LeadCreatedEvent extends BaseEvent {
  type: 'lead.created';
  lead_id: string;
}

export interface LeadQualifiedEvent extends BaseEvent {
  type: 'lead.qualified';
  lead_id: string;
  qualification_status: LeadQualificationStatus;
}

export interface LeadNeedsInfoEvent extends BaseEvent {
  type: 'lead.needs_info';
  lead_id: string;
  missing_fields: string[];
}

export interface LeadConvertedEvent extends BaseEvent {
  type: 'lead.converted';
  lead_id: string;
  client_id: string;
}

export interface ClientCreatedEvent extends BaseEvent {
  type: 'client.created';
  client_id: string;
}

export interface ClientDeletedEvent extends BaseEvent {
  type: 'client.deleted';
  client_id: string;
}

export interface BookingCreatedEvent extends BaseEvent {
  type: 'booking.created';
  booking_id: string;
}

export interface BookingLocationsAssignedEvent extends BaseEvent {
  type: 'booking.locations_assigned';
  booking_id: string;
  location_ids: string[];
}

export interface BookingCancelledEvent extends BaseEvent {
  type: 'booking.cancelled';
  booking_id: string;
  previous_status: BookingStatus;
}

export interface CommLogCreatedEvent extends BaseEvent {
  type: 'comm_log.created';
  comm_log_id: string;
}

export interface PackageCreatedEvent extends BaseEvent {
  type: 'package.created';
  package_id: string;
}

export interface PackageUpdatedEvent extends BaseEvent {
  type: 'package.updated';
  package_id: string;
}

export interface LocationCreatedEvent extends BaseEvent {
  type: 'location.created';
  location_id: string;
}

export interface LocationUpdatedEvent extends BaseEvent {
  type: 'location.updated';
  location_id: string;
}

export interface InvoiceCreatedEvent extends BaseEvent {
  type: 'invoice.created';
  invoice_id: string;
  booking_id: string;
  kind: InvoiceKind;
  amount_cents: number;
}

export interface InvoiceCancelledEvent extends BaseEvent {
  type: 'invoice.cancelled';
  invoice_id: string;
}

// No body content in the payload — comm_log is the ledger for content
// (ZDR posture, ANTI_PATTERNS #28 spirit).
export interface InvoiceReminderSentEvent extends BaseEvent {
  type: 'invoice.reminder_sent';
  invoice_id: string;
  step: number;
  recipient: string;
}

export interface PaymentReceivedEvent extends BaseEvent {
  type: 'payment.received';
  invoice_id: string;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
}

export interface GmailMessageReceivedEvent extends BaseEvent {
  type: 'gmail.message_received';
  thread_id: string;
  message_id: string;
}

export type DomainEvent =
  | LeadCreatedEvent
  | LeadQualifiedEvent
  | LeadNeedsInfoEvent
  | LeadConvertedEvent
  | ClientCreatedEvent
  | ClientDeletedEvent
  | BookingCreatedEvent
  | BookingLocationsAssignedEvent
  | BookingCancelledEvent
  | CommLogCreatedEvent
  | PackageCreatedEvent
  | PackageUpdatedEvent
  | LocationCreatedEvent
  | LocationUpdatedEvent
  | InvoiceCreatedEvent
  | InvoiceCancelledEvent
  | InvoiceReminderSentEvent
  | PaymentReceivedEvent
  | GmailMessageReceivedEvent;

export type DomainEventType = DomainEvent['type'];
