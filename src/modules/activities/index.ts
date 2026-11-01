import type { Router } from 'express';
import type { EventBus } from '../../shared/events/eventBus';
import type { StaffReader } from '../staff/staff.reader';
import { InMemoryActivitiesRepository, InMemoryActivityAuditRepository } from './activities.repository';
import { createActivitiesRouter } from './activities.routes';
import { activitiesSeed } from './activities.seed';
import { ActivitiesService } from './activities.service';
import type { Task } from './activities.types';

export interface ActivitiesModuleDeps {
  eventBus: EventBus;
  staff: StaffReader;
  seed?: readonly Task[];
}

export function createActivitiesModule(deps: ActivitiesModuleDeps): { router: Router } {
  const service = new ActivitiesService(
    new InMemoryActivitiesRepository(deps.seed ?? activitiesSeed),
    deps.staff,
    deps.eventBus,
    new InMemoryActivityAuditRepository(),
  );
  return { router: createActivitiesRouter(service, (token) => deps.staff.authenticate(token)) };
}
