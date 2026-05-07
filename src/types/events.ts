import type { LeadQualificationStatus } from './erp';

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

export interface BookingCreatedEvent extends BaseEvent {
  type: 'booking.created';
  booking_id: string;
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
  | BookingCreatedEvent
  | PaymentReceivedEvent
  | GmailMessageReceivedEvent;

export type DomainEventType = DomainEvent['type'];
