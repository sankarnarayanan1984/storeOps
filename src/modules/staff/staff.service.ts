import { randomBytes } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors';
import { newId, nowIso } from '../../shared/id';
import { hashPassword, verifyPassword } from './staff.passwords';
import type { StaffReader } from './staff.reader';
import type { AuthTokenRepository, StaffRepository } from './staff.repository';
import type {
  LoginResult,
  RegisterStaffInput,
  StaffFilter,
  StoredUser,
  UpdateStaffInput,
  User,
  UserProfile,
} from './staff.types';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
/** Verified against when the email is unknown, so failed logins take the same time either way. */
const DUMMY_HASH =
  'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const toPublic = ({ passwordHash: _hash, ...user }: StoredUser): User => user;

export class StaffService implements StaffReader {
  constructor(
    private readonly repository: StaffRepository,
    private readonly tokens: AuthTokenRepository,
  ) {}

  async list(filter: StaffFilter): Promise<User[]> {
    return (await this.repository.list(filter)).map(toPublic);
  }

  async getById(id: string): Promise<User> {
    return toPublic(await this.getStored(id));
  }

  async register(input: RegisterStaffInput): Promise<User> {
    await this.assertEmailAvailable(input.email);
    const { password, ...rest } = input;
    const timestamp = nowIso();
    const user = await this.repository.save({
      id: newId('stf'),
      ...rest,
      active: true,
      passwordHash: await hashPassword(password),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return toPublic(user);
  }

  async update(id: string, input: UpdateStaffInput): Promise<User> {
    const current = await this.getStored(id);
    if (input.email && input.email !== current.email) await this.assertEmailAvailable(input.email);

    const { profile, ...fields } = input;
    const updated = await this.repository.save({
      ...current,
      ...fields,
      profile: { ...current.profile, ...profile },
      updatedAt: nowIso(),
    });
    // Deactivating someone ends their sessions immediately.
    if (current.active && !updated.active) await this.tokens.deleteForUser(id);
    return toPublic(updated);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.repository.findByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new UnauthorizedError('Invalid email or password');
    if (!user.active) throw new ForbiddenError('This account is inactive');

    const issuedAt = new Date();
    const token = {
      token: randomBytes(32).toString('base64url'),
      tokenType: 'Bearer' as const,
      userId: user.id,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS).toISOString(),
    };
    await this.tokens.save(token);
    const loggedIn = await this.repository.save({ ...user, lastLoginAt: token.issuedAt });
    return { token, user: toPublic(loggedIn) };
  }

  /** Resolves a bearer token to its active user, or throws UnauthorizedError. */
  async authenticate(token: string): Promise<User> {
    const found = await this.tokens.find(token);
    if (!found) throw new UnauthorizedError('Invalid or expired token');
    if (Date.parse(found.expiresAt) <= Date.now()) {
      await this.tokens.delete(token);
      throw new UnauthorizedError('Invalid or expired token');
    }
    const user = await this.repository.findById(found.userId);
    if (!user?.active) throw new UnauthorizedError('Invalid or expired token');
    return toPublic(user);
  }

  logout(token: string): Promise<void> {
    return this.tokens.delete(token);
  }

  updateProfile(userId: string, profile: Partial<UserProfile>): Promise<User> {
    return this.update(userId, { profile });
  }

  /** Changes the password and signs out every other session. */
  async changePassword(userId: string, currentPassword: string, newPassword: string, keepToken: string): Promise<void> {
    const user = await this.getStored(userId);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    await this.repository.save({ ...user, passwordHash: await hashPassword(newPassword), updatedAt: nowIso() });
    await this.tokens.deleteForUser(userId, keepToken);
  }

  private async getStored(id: string): Promise<StoredUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundError('Staff', id);
    return user;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    if (await this.repository.findByEmail(email)) {
      throw new ConflictError(`A staff member with email '${email}' already exists`, 'EMAIL_TAKEN');
    }
  }
}
