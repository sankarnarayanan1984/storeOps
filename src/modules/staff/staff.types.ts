export const STAFF_ROLES = ['REGIONAL_MANAGER', 'STORE_MANAGER', 'DEPARTMENT_LEAD', 'ASSOCIATE'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone?: string;
  department?: string;
}

/** A staff member as exposed by the API (never includes credentials). */
export interface User {
  id: string;
  email: string;
  role: StaffRole;
  storeId: string;
  regionId: string;
  active: boolean;
  profile: UserProfile;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Internal record: a user plus their password hash. Stays inside this module. */
export interface StoredUser extends User {
  passwordHash: string;
}

export interface AuthToken {
  token: string;
  tokenType: 'Bearer';
  userId: string;
  issuedAt: string;
  expiresAt: string;
}

/** Name kept for the cross-module StaffReader contract. */
export type Staff = User;

export interface RegisterStaffInput {
  email: string;
  password: string;
  role: StaffRole;
  storeId: string;
  regionId: string;
  profile: UserProfile;
}

export interface UpdateStaffInput {
  email?: string;
  role?: StaffRole;
  storeId?: string;
  regionId?: string;
  active?: boolean;
  profile?: Partial<UserProfile>;
}

export interface StaffFilter {
  storeId?: string;
  regionId?: string;
  role?: StaffRole;
  active?: boolean;
}

export interface LoginResult {
  token: AuthToken;
  user: User;
}
