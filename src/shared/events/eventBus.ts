import type { DomainEvents, EventName } from './domainEvents';

export type EventHandler<K extends EventName> = (payload: DomainEvents[K]) => void | Promise<void>;

export interface EventBus {
  /** Resolves once every subscriber has settled. Subscriber failures never reject. */
  publish<K extends EventName>(name: K, payload: DomainEvents[K]): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe<K extends EventName>(name: K, handler: EventHandler<K>): () => void;
}

type AnyHandler = (payload: unknown) => void | Promise<void>;
type ErrorReporter = (eventName: EventName, error: unknown) => void;

const defaultErrorReporter: ErrorReporter = (eventName, error) => {
  console.error(`[event-bus] subscriber for '${eventName}' failed`, error);
};

/** In-process event bus. Swap for a broker-backed implementation later. */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventName, Set<AnyHandler>>();

  constructor(private readonly onError: ErrorReporter = defaultErrorReporter) {}

  async publish<K extends EventName>(name: K, payload: DomainEvents[K]): Promise<void> {
    const handlers = [...(this.handlers.get(name) ?? [])];
    const results = await Promise.allSettled(
      handlers.map(async (handler) => handler(Object.freeze({ ...payload }))),
    );
    for (const result of results) {
      if (result.status === 'rejected') this.onError(name, result.reason);
    }
  }

  subscribe<K extends EventName>(name: K, handler: EventHandler<K>): () => void {
    const set = this.handlers.get(name) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(name, set);
    return () => {
      set.delete(handler as AnyHandler);
    };
  }
}
