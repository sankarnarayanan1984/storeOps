import type { Router } from 'express';
import type { EventBus } from '../../shared/events/eventBus';
import type { StaffReader } from '../staff/staff.reader';
import { InMemoryProgrammesRepository } from './programmes.repository';
import { createProgrammesRouter } from './programmes.routes';
import { programmesSeed } from './programmes.seed';
import { ProgrammesService } from './programmes.service';
import { registerProgrammesSubscribers } from './programmes.subscribers';
import type { Project } from './programmes.types';

export interface ProgrammesModuleDeps {
  eventBus: EventBus;
  staff: StaffReader;
  seed?: readonly Project[];
}

export function createProgrammesModule(deps: ProgrammesModuleDeps): { router: Router } {
  const repository = new InMemoryProgrammesRepository(deps.seed ?? programmesSeed);
  const service = new ProgrammesService(repository, deps.staff, deps.eventBus);
  registerProgrammesSubscribers(deps.eventBus, service);
  return { router: createProgrammesRouter(service, (token) => deps.staff.authenticate(token)) };
}
