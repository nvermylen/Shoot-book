import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publish, subscribe, clearSubscribers } from './bus';
import type { DomainEvent, LeadCreatedEvent, BookingCreatedEvent } from '@/types/events';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockSupabase(insertResult: { error: null | { message: string } } = { error: null }) {
  const insertFn = vi.fn().mockResolvedValue(insertResult);
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn });
  return {
    client: { from: fromFn } as unknown as SupabaseClient,
    fromFn,
    insertFn,
  };
}

function makeLeadEvent(overrides?: Partial<LeadCreatedEvent>): LeadCreatedEvent {
  return {
    type: 'lead.created',
    photographer_id: 'phot-001',
    occurred_at: new Date().toISOString(),
    lead_id: 'lead-001',
    ...overrides,
  };
}

function makeBookingEvent(overrides?: Partial<BookingCreatedEvent>): BookingCreatedEvent {
  return {
    type: 'booking.created',
    photographer_id: 'phot-001',
    occurred_at: new Date().toISOString(),
    booking_id: 'booking-001',
    ...overrides,
  };
}

describe('event bus', () => {
  beforeEach(() => {
    clearSubscribers();
  });

  it('pub/sub round-trip: subscriber receives the published event', async () => {
    const { client } = mockSupabase();
    const received: DomainEvent[] = [];

    subscribe('lead.created', async (event) => {
      received.push(event);
    });

    const event = makeLeadEvent();
    await publish(event, client);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('type narrowing: handler param is the specific event subtype', async () => {
    const { client } = mockSupabase();

    subscribe('lead.created', async (event) => {
      // If type narrowing works, event.lead_id is accessible without casting.
      // This is a compile-time check — if it compiles, the type is narrowed.
      const id: string = event.lead_id;
      expect(id).toBe('lead-001');
    });

    await publish(makeLeadEvent(), client);
  });

  it('type narrowing is verified at compile time via satisfies', () => {
    // This block exists purely to prove the type system narrows correctly.
    // If this file compiles, the narrowing is correct.
    const handler: (event: Extract<DomainEvent, { type: 'booking.created' }>) => Promise<void> =
      async (event) => {
        const _bookingId: string = event.booking_id;
        void _bookingId;
      };
    handler satisfies (event: BookingCreatedEvent) => Promise<void>;
  });

  it('domain_event_log write: persists event with photographer_id, type, payload', async () => {
    const { client, fromFn, insertFn } = mockSupabase();
    const event = makeLeadEvent();

    await publish(event, client);

    expect(fromFn).toHaveBeenCalledWith('domain_event_log');
    expect(insertFn).toHaveBeenCalledWith({
      photographer_id: 'phot-001',
      type: 'lead.created',
      payload: event,
    });
  });

  it('domain_event_log write failure throws', async () => {
    const { client } = mockSupabase({ error: { message: 'RLS violation' } });
    await expect(publish(makeLeadEvent(), client)).rejects.toThrow(
      'Failed to persist domain event: RLS violation',
    );
  });

  it('multiple subscribers receive the same event', async () => {
    const { client } = mockSupabase();
    const calls: string[] = [];

    subscribe('lead.created', async () => { calls.push('handler-1'); });
    subscribe('lead.created', async () => { calls.push('handler-2'); });
    subscribe('lead.created', async () => { calls.push('handler-3'); });

    await publish(makeLeadEvent(), client);

    expect(calls).toEqual(['handler-1', 'handler-2', 'handler-3']);
  });

  it('handler error does not crash the publisher', async () => {
    const { client } = mockSupabase();
    const calls: string[] = [];

    subscribe('lead.created', async () => {
      throw new Error('handler blew up');
    });
    subscribe('lead.created', async () => {
      calls.push('second-handler-ran');
    });

    await expect(publish(makeLeadEvent(), client)).resolves.toBeUndefined();
    expect(calls).toEqual(['second-handler-ran']);
  });

  it('subscribers only receive events matching their type', async () => {
    const { client } = mockSupabase();
    const leadCalls: string[] = [];
    const bookingCalls: string[] = [];

    subscribe('lead.created', async () => { leadCalls.push('lead'); });
    subscribe('booking.created', async () => { bookingCalls.push('booking'); });

    await publish(makeLeadEvent(), client);
    await publish(makeBookingEvent(), client);

    expect(leadCalls).toEqual(['lead']);
    expect(bookingCalls).toEqual(['booking']);
  });

  it('unsubscribe removes the handler', async () => {
    const { client } = mockSupabase();
    const calls: string[] = [];

    const unsub = subscribe('lead.created', async () => { calls.push('called'); });
    unsub();

    await publish(makeLeadEvent(), client);
    expect(calls).toEqual([]);
  });
});
