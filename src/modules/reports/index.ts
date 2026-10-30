import type { Router } from 'express';
import type { EventBus } from '../../shared/events/eventBus';
import { InMemoryReportsRepository } from './reports.repository';
import { createReportsRouter } from './reports.routes';
import { ReportsService } from './reports.service';
import { registerReportSubscribers } from './reports.subscribers';

export function createReportsModule(deps: { eventBus: EventBus }): { router: Router } {
  const service = new ReportsService(new InMemoryReportsRepository());
  registerReportSubscribers(deps.eventBus, service);
  return { router: createReportsRouter(service) };
}
