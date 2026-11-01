import type { EventBus } from '../../shared/events/eventBus';
import type { ReportsService } from './reports.service';

export function registerReportSubscribers(bus: EventBus, service: ReportsService): void {
  bus.subscribe('activity.created', (event) => service.recordActivityCreated(event));
  bus.subscribe('activity.status_changed', (event) => service.recordStatusChange(event));
  bus.subscribe('activity.deleted', (event) => service.recordActivityDeleted(event));
  bus.subscribe('activity.handover_completed', (event) => service.recordHandover(event));
  // A new programme enrols its creator's store.
  bus.subscribe('programme.created', (event) => service.recordEnrolment(event));
  bus.subscribe('programme.store_enrolled', (event) => service.recordEnrolment(event));
}
