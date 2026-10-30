import type { Staff, StaffFilter } from './staff.types';

export type { Staff, StaffFilter, StaffRole } from './staff.types';

/**
 * Read-only contract for the staff (users) module. This is the ONLY file other
 * modules may import from here, and only as a type — implementations are
 * injected by the composition root. Staff is never mutated outside this module.
 */
export interface StaffReader {
  getById(id: string): Promise<Readonly<Staff>>;
  list(filter: StaffFilter): Promise<readonly Readonly<Staff>[]>;
  /** Resolves a bearer token to its active staff member; throws UnauthorizedError otherwise. */
  authenticate(token: string): Promise<Readonly<Staff>>;
}
