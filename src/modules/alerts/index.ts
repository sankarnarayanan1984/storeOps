import type { Router } from 'express';
import type { EventBus } from '../../shared/events/eventBus';
import type { StaffReader } from '../staff/staff.reader';
import { InMemoryAlertsRepository } from './alerts.repository';
import { createAlertsRouter } from './alerts.routes';
import { AlertsService } from './alerts.service';
import { registerAlertSubscribers } from './alerts.subscribers';

export interface AlertsModuleDeps {
  eventBus: EventBus;
  staff: StaffReader;
}

export function createAlertsModule(deps: AlertsModuleDeps): { router: Router } {
  const service = new AlertsService(new InMemoryAlertsRepository(), deps.staff);
  registerAlertSubscribers(deps.eventBus, service);
  return { router: createAlertsRouter(service, (token) => deps.staff.authenticate(token)) };
}
