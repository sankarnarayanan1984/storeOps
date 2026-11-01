import type { EventBus } from '../../shared/events/eventBus';
import type { AlertsService } from './alerts.service';

/** Alerts is the notification sink: it reacts to other modules' events only. */
export function registerAlertSubscribers(bus: EventBus, service: AlertsService): void {
  // A blocked activity is escalated to the store's managers. A blocked restocking
  // run usually means a stock problem, so it is raised as an INVENTORY alert.
  bus.subscribe('activity.status_changed', async (event) => {
    if (event.to !== 'BLOCKED') return;
    const inventory = event.category === 'RESTOCKING';
    await service.notifyStore({
      type: inventory ? 'INVENTORY' : 'ESCALATION',
      storeId: event.storeId,
      recipientRoles: ['STORE_MANAGER'],
      title: inventory ? 'Restocking blocked' : 'Activity blocked',
      message: `${event.priority} ${event.category} activity '${event.activityId}' is blocked`,
      sourceEvent: 'activity.status_changed',
      entityId: event.activityId,
    });
  });

  // A shift handover is summarised once per store, so each manager sees only
  // the counts for their own store rather than the whole (possibly regional) batch.
  bus.subscribe('activity.handover_completed', async (event) => {
    await Promise.all(
      event.stores.map((store) =>
        service.notifyStore({
          type: 'SHIFT_HANDOVER',
          storeId: store.storeId,
          recipientRoles: ['STORE_MANAGER'],
          title: 'Shift handover',
          message: `Shift handover by ${event.completedByName}: ${store.closedCount} closed, ${store.blockedCount} blocked`,
          sourceEvent: 'activity.handover_completed',
          entityId: event.batchId,
        }),
      ),
    );
  });
}
