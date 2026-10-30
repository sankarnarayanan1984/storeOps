import type { AuthToken, StaffFilter, StoredUser } from './staff.types';

export interface StaffRepository {
  list(filter: StaffFilter): Promise<StoredUser[]>;
  findById(id: string): Promise<StoredUser | undefined>;
  findByEmail(email: string): Promise<StoredUser | undefined>;
  save(user: StoredUser): Promise<StoredUser>;
}

export interface AuthTokenRepository {
  find(token: string): Promise<AuthToken | undefined>;
  save(token: AuthToken): Promise<void>;
  delete(token: string): Promise<void>;
  deleteForUser(userId: string, except?: string): Promise<void>;
}

const clone = (user: StoredUser): StoredUser => ({ ...user, profile: { ...user.profile } });

export class InMemoryStaffRepository implements StaffRepository {
  private readonly items = new Map<string, StoredUser>();

  constructor(seed: readonly StoredUser[] = []) {
    for (const user of seed) this.items.set(user.id, clone(user));
  }

  list(filter: StaffFilter): Promise<StoredUser[]> {
    const result = [...this.items.values()]
      .filter((u) => !filter.storeId || u.storeId === filter.storeId)
      .filter((u) => !filter.regionId || u.regionId === filter.regionId)
      .filter((u) => !filter.role || u.role === filter.role)
      .filter((u) => filter.active === undefined || u.active === filter.active)
      .map(clone);
    return Promise.resolve(result);
  }

  findById(id: string): Promise<StoredUser | undefined> {
    const user = this.items.get(id);
    return Promise.resolve(user ? clone(user) : undefined);
  }

  findByEmail(email: string): Promise<StoredUser | undefined> {
    const user = [...this.items.values()].find((u) => u.email === email);
    return Promise.resolve(user ? clone(user) : undefined);
  }

  save(user: StoredUser): Promise<StoredUser> {
    this.items.set(user.id, clone(user));
    return Promise.resolve(clone(user));
  }
}

export class InMemoryAuthTokenRepository implements AuthTokenRepository {
  private readonly tokens = new Map<string, AuthToken>();

  find(token: string): Promise<AuthToken | undefined> {
    const found = this.tokens.get(token);
    return Promise.resolve(found ? { ...found } : undefined);
  }

  save(token: AuthToken): Promise<void> {
    this.tokens.set(token.token, { ...token });
    return Promise.resolve();
  }

  delete(token: string): Promise<void> {
    this.tokens.delete(token);
    return Promise.resolve();
  }

  deleteForUser(userId: string, except?: string): Promise<void> {
    for (const [key, value] of this.tokens) {
      if (value.userId === userId && key !== except) this.tokens.delete(key);
    }
    return Promise.resolve();
  }
}
