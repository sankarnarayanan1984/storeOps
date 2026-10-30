import type { ProgrammeStoreEnrolledEvent } from '../../src/shared/events/domainEvents';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';

const event: ProgrammeStoreEnrolledEvent = {
  programmeId: 'prg_1',
  programmeName: 'Test',
  storeId: 'store_1',
  occurredAt: '2026-10-24T00:00:00.000Z',
};

describe('InMemoryEventBus', () => {
  it('delivers events to every subscriber and awaits them', async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    bus.subscribe('programme.store_enrolled', (e) => {
      received.push(`a:${e.storeId}`);
    });
    bus.subscribe('programme.store_enrolled', async (e) => {
      await Promise.resolve();
      received.push(`b:${e.storeId}`);
    });

    await bus.publish('programme.store_enrolled', event);
    expect(received.sort()).toEqual(['a:store_1', 'b:store_1']);
  });

  it('isolates subscriber failures from the publisher', async () => {
    const onError = jest.fn();
    const bus = new InMemoryEventBus(onError);
    const healthy = jest.fn();
    bus.subscribe('programme.store_enrolled', () => Promise.reject(new TypeError('boom')));
    bus.subscribe('programme.store_enrolled', healthy);

    await expect(bus.publish('programme.store_enrolled', event)).resolves.toBeUndefined();
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('programme.store_enrolled', expect.any(TypeError));
  });

  it('supports unsubscribing', async () => {
    const bus = new InMemoryEventBus();
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('programme.store_enrolled', handler);
    unsubscribe();
    await bus.publish('programme.store_enrolled', event);
    expect(handler).not.toHaveBeenCalled();
  });
});
