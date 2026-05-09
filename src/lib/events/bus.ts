import type { DomainEvent, DomainEventType } from '@/types/events';
import type { SupabaseClient } from '@supabase/supabase-js';

type Handler<T extends DomainEvent> = (event: T) => Promise<void>;
type Unsubscribe = () => void;

type SubscriberEntry = {
  type: DomainEventType;
  handler: Handler<never>;
};

const subscribers: SubscriberEntry[] = [];

export function subscribe<T extends DomainEventType>(
  type: T,
  handler: Handler<Extract<DomainEvent, { type: T }>>,
): Unsubscribe {
  const entry: SubscriberEntry = { type, handler: handler as Handler<never> };
  subscribers.push(entry);
  return () => {
    const idx = subscribers.indexOf(entry);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

export async function publish(
  event: DomainEvent,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.from('domain_event_log').insert({
    photographer_id: event.photographer_id,
    type: event.type,
    payload: event,
  });

  if (error) {
    throw new Error(`Failed to persist domain event: ${error.message}`);
  }

  const matching = subscribers.filter((s) => s.type === event.type);
  for (const { handler } of matching) {
    try {
      await (handler as Handler<DomainEvent>)(event);
    } catch (err) {
      // TODO: LENS-NNN — replace with structured logger + add handler identity.
      console.error('event_bus.handler_failed', {
        event_type: event.type,
        error_name: err instanceof Error ? err.name : 'unknown',
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function clearSubscribers(): void {
  subscribers.length = 0;
}
