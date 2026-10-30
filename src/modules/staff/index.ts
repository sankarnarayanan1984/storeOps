import type { Router } from 'express';
import { InMemoryAuthTokenRepository, InMemoryStaffRepository } from './staff.repository';
import type { StaffReader } from './staff.reader';
import { createStaffRouter } from './staff.routes';
import { staffSeed } from './staff.seed';
import { StaffService } from './staff.service';
import type { StoredUser } from './staff.types';

export interface StaffModule {
  router: Router;
  /** Exposed to other modules as read-only. */
  reader: StaffReader;
}

export function createStaffModule(options: { seed?: readonly StoredUser[] } = {}): StaffModule {
  const service = new StaffService(
    new InMemoryStaffRepository(options.seed ?? staffSeed),
    new InMemoryAuthTokenRepository(),
  );
  return { router: createStaffRouter(service), reader: service };
}
