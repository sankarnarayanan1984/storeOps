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
}
