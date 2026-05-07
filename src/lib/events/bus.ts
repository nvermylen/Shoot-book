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
    } catch {
      // Handler errors are swallowed so one bad subscriber doesn't crash the publisher.
      // TODO: LENS-NNN — structured error logging + dead-letter queue for failed handlers.
    }
  }
}

export function clearSubscribers(): void {
  subscribers.length = 0;
}
