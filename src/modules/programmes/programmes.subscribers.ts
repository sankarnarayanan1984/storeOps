import type { EventBus } from '../../shared/events/eventBus';
import type { ProgrammesService } from './programmes.service';

/** Programmes reacts to other modules only through these subscriptions, and only writes its own state. */
export function registerProgrammesSubscribers(bus: EventBus, service: ProgrammesService): void {
  bus.subscribe('activity.handover_completed', async (event) => {
    if (event.programmes.length === 0) return;
    await service.recordHandover(event);
  });
}
