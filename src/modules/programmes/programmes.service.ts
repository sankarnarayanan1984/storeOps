import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import type { EventBus } from '../../shared/events/eventBus';
import type { AuthUser } from '../../shared/http/auth';
import { newId, nowIso } from '../../shared/id';
import type { Staff, StaffReader } from '../staff/staff.reader';
import type { ProgrammesRepository } from './programmes.repository';
import {
  PROJECT_ROLES,
  type CreateProjectInput,
  type MemberStaff,
  type Project,
  type ProjectFilter,
  type ProjectMember,
  type ProjectMemberView,
  type ProjectRole,
  type ProjectSummary,
  type ProjectView,
} from './programmes.types';

const CAN_CREATE: readonly string[] = ['STORE_MANAGER', 'REGIONAL_MANAGER'];
const CAN_ADD_MEMBERS: readonly string[] = ['STORE_MANAGER', 'DEPARTMENT_LEAD', 'REGIONAL_MANAGER'];
/** These roles may only add staff from their own store. */
const STORE_SCOPED: readonly string[] = ['STORE_MANAGER', 'DEPARTMENT_LEAD'];

const isProjectRole = (role: string): role is ProjectRole => (PROJECT_ROLES as readonly string[]).includes(role);

const toMemberStaff = ({ id, email, role, storeId, active, profile }: Readonly<Staff>): MemberStaff => ({
  id,
  email,
  role,
  storeId,
  active,
  profile: { ...profile },
});

export class ProgrammesService {
  constructor(
    private readonly repository: ProgrammesRepository,
    private readonly staff: StaffReader,
    private readonly events: EventBus,
  ) {}

  /** Programmes the caller's store is enrolled in. */
  async listForStore(caller: AuthUser, filter: ProjectFilter): Promise<ProjectSummary[]> {
    const programmes = (await this.repository.list())
      .filter((p) => p.enrolledStoreIds.includes(caller.storeId))
      .filter((p) => !filter.type || p.type === filter.type)
      .filter((p) => !filter.status || p.status === filter.status)
      .filter((p) => !filter.staffId || p.members.some((m) => m.staffId === filter.staffId));

    return Promise.all(
      programmes.map(async ({ members, ...programme }) => {
        const staff = await Promise.all(members.map((m) => this.findStaff(m.staffId)));
        return {
          ...programme,
          memberCount: members.length,
          storeMemberCount: staff.filter((s) => s?.storeId === caller.storeId).length,
        };
      }),
    );
  }

  async getById(id: string): Promise<ProjectView> {
    return this.toView(await this.getProgramme(id));
  }

  async listMembers(id: string, role?: ProjectRole): Promise<ProjectMemberView[]> {
    const { members } = await this.getById(id);
    return role ? members.filter((m) => m.role === role) : members;
  }

  async create(input: CreateProjectInput, caller: AuthUser): Promise<Project> {
    if (!CAN_CREATE.includes(caller.role)) {
      throw new ForbiddenError('Only store managers and regional managers can create programmes');
    }
    if (input.endsOn < input.startsOn) {
      throw new ValidationError('endsOn must be on or after startsOn', [{ path: 'endsOn', message: 'Must be on or after startsOn' }]);
    }

    const timestamp = nowIso();
    const programme = await this.repository.save({
      id: newId('prg'),
      ...input,
      status: 'PLANNED',
      enrolledStoreIds: [caller.storeId],
      members: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.events.publish('programme.created', {
      programmeId: programme.id,
      programmeName: programme.name,
      type: programme.type,
      storeId: caller.storeId,
      occurredAt: timestamp,
    });
    return programme;
  }

  async addMember(id: string, staffId: string, requestedRole: ProjectRole | undefined, caller: AuthUser): Promise<ProjectMemberView> {
    const programme = await this.getProgramme(id);
    // Don't reveal programmes that belong to other stores.
    if (!programme.enrolledStoreIds.includes(caller.storeId)) throw new NotFoundError('Programme', id);
    if (!CAN_ADD_MEMBERS.includes(caller.role)) {
      throw new ForbiddenError('Only managers and department leads can add programme members');
    }
    this.assertNotCompleted(programme);

    const staff = await this.findStaff(staffId);
    if (!staff) throw new ValidationError(`staffId '${staffId}' does not reference a staff member`);
    if (!staff.active) throw new ValidationError(`Staff member '${staffId}' is inactive`);
    if (STORE_SCOPED.includes(caller.role) && staff.storeId !== caller.storeId) {
      throw new ForbiddenError('You can only add staff from your own store');
    }
    if (!programme.enrolledStoreIds.includes(staff.storeId)) {
      throw new ValidationError(
        `Staff member's store '${staff.storeId}' is not enrolled in programme '${id}'`,
        undefined,
        'STORE_NOT_ENROLLED',
      );
    }
    if (programme.members.some((m) => m.staffId === staffId)) {
      throw new ConflictError(`Staff member '${staffId}' is already a member of programme '${id}'`, 'MEMBER_EXISTS');
    }

    const role = requestedRole ?? (isProjectRole(staff.role) ? staff.role : undefined);
    if (!role) {
      throw new ValidationError(`A role is required: '${staff.role}' is not a programme role`, [
        { path: 'role', message: `Choose one of ${PROJECT_ROLES.join(', ')}` },
      ]);
    }

    const member: ProjectMember = { staffId, role, addedAt: nowIso() };
    await this.repository.save({ ...programme, members: [...programme.members, member], updatedAt: member.addedAt });
    await this.events.publish('programme.member_added', {
      programmeId: programme.id,
      programmeName: programme.name,
      staffId,
      role,
      storeId: staff.storeId,
      occurredAt: member.addedAt,
    });
    return { ...member, staff: toMemberStaff(staff) };
  }

  async changeMemberRole(id: string, staffId: string, role: ProjectRole): Promise<ProjectMemberView> {
    const programme = await this.getProgramme(id);
    const member = this.getMember(programme, staffId);
    const updated = { ...member, role };
    await this.repository.save({
      ...programme,
      members: programme.members.map((m) => (m.staffId === staffId ? updated : m)),
      updatedAt: nowIso(),
    });
    return this.toMemberView(updated);
  }

  async removeMember(id: string, staffId: string): Promise<void> {
    const programme = await this.getProgramme(id);
    this.assertNotCompleted(programme);
    const member = this.getMember(programme, staffId);

    const timestamp = nowIso();
    await this.repository.save({
      ...programme,
      members: programme.members.filter((m) => m.staffId !== staffId),
      updatedAt: timestamp,
    });
    const staff = await this.findStaff(staffId);
    await this.events.publish('programme.member_removed', {
      programmeId: programme.id,
      programmeName: programme.name,
      staffId,
      role: member.role,
      storeId: staff?.storeId ?? programme.enrolledStoreIds[0] ?? '',
      occurredAt: timestamp,
    });
  }

  async enrolStore(programmeId: string, storeId: string): Promise<Project> {
    const programme = await this.getProgramme(programmeId);
    if (programme.enrolledStoreIds.includes(storeId)) {
      throw new ConflictError(`Store '${storeId}' is already enrolled in programme '${programmeId}'`, 'ALREADY_ENROLLED');
    }

    const timestamp = nowIso();
    const updated = await this.repository.save({
      ...programme,
      enrolledStoreIds: [...programme.enrolledStoreIds, storeId],
      updatedAt: timestamp,
    });

    await this.events.publish('programme.store_enrolled', {
      programmeId: updated.id,
      programmeName: updated.name,
      storeId,
      occurredAt: timestamp,
    });
    return updated;
  }

  private async getProgramme(id: string): Promise<Project> {
    const programme = await this.repository.findById(id);
    if (!programme) throw new NotFoundError('Programme', id);
    return programme;
  }

  private getMember(programme: Project, staffId: string): ProjectMember {
    const member = programme.members.find((m) => m.staffId === staffId);
    if (!member) throw new NotFoundError('Member', staffId);
    return member;
  }

  private assertNotCompleted(programme: Project): void {
    if (programme.status === 'COMPLETED') {
      throw new ConflictError(`Programme '${programme.id}' is completed`, 'PROGRAMME_COMPLETED');
    }
  }

  /** Read-only staff lookup; a missing record is not an error here. */
  private async findStaff(staffId: string): Promise<Readonly<Staff> | undefined> {
    return this.staff.getById(staffId).catch((err: unknown) => {
      if (err instanceof NotFoundError) return undefined;
      throw err;
    });
  }

  private async toMemberView(member: ProjectMember): Promise<ProjectMemberView> {
    const staff = await this.findStaff(member.staffId);
    return { ...member, staff: staff ? toMemberStaff(staff) : null };
  }

  private async toView({ members, ...programme }: Project): Promise<ProjectView> {
    return { ...programme, members: await Promise.all(members.map((m) => this.toMemberView(m))) };
  }
}
