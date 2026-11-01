import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import type { HandoverProgrammeGroup, HandoverStoreGroup } from '../../shared/events/domainEvents';
import type { EventBus } from '../../shared/events/eventBus';
import type { AuthUser } from '../../shared/http/auth';
import { newId, nowIso } from '../../shared/id';
import type { StaffReader } from '../staff/staff.reader';
import type { ActivitiesRepository, ActivityAuditRepository } from './activities.repository';
import type {
  BulkStatus,
  BulkStatusInput,
  BulkStatusItemResult,
  BulkStatusResult,
  CreateTaskInput,
  Task,
  TaskAuditEntry,
  TaskFilter,
  TaskStatus,
  UpdateTaskInput,
} from './activities.types';

const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
  IN_PROGRESS: ['BLOCKED', 'DONE'],
  BLOCKED: ['IN_PROGRESS', 'DONE'],
  DONE: [],
};

/** Roles whose bulk-update scope is their whole region rather than their own store. */
const REGION_SCOPED_ROLES: readonly string[] = ['REGIONAL_MANAGER'];

export class ActivitiesService {
  constructor(
    private readonly repository: ActivitiesRepository,
    private readonly staff: StaffReader,
    private readonly events: EventBus,
    private readonly audit: ActivityAuditRepository,
  ) {}

  list(filter: TaskFilter): Promise<Task[]> {
    return this.repository.list(filter);
  }

  async getById(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError('Activity', id);
    return task;
  }

  async create(input: CreateTaskInput, caller: AuthUser): Promise<Task> {
    if (input.assigneeId) await this.assertAssignable(input.assigneeId);

    const timestamp = nowIso();
    const task = await this.repository.save({
      id: newId('tsk'),
      ...input,
      storeId: input.storeId ?? caller.storeId,
      regionId: input.regionId ?? caller.regionId,
      status: 'TODO',
      createdBy: caller.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.events.publish('activity.created', {
      activityId: task.id,
      storeId: task.storeId,
      regionId: task.regionId,
      ...(task.programmeId ? { programmeId: task.programmeId } : {}),
      ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
      category: task.category,
      priority: task.priority,
      createdBy: caller.id,
      occurredAt: timestamp,
    });
    return task;
  }

  async update(id: string, input: UpdateTaskInput, caller: AuthUser): Promise<Task> {
    const current = await this.getById(id);
    if (input.status && input.status !== current.status && !ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
      throw new ConflictError(
        `Cannot move activity from '${current.status}' to '${input.status}'`,
        'INVALID_STATUS_TRANSITION',
      );
    }
    if (input.assigneeId) await this.assertAssignable(input.assigneeId);

    const { assigneeId, ...fields } = input;
    const next: Task = { ...current, ...fields, updatedAt: nowIso() };
    if (assigneeId === null) delete next.assigneeId;
    else if (assigneeId !== undefined) next.assigneeId = assigneeId;
    const updated = await this.repository.save(next);

    if (updated.status !== current.status) {
      await this.events.publish('activity.status_changed', {
        activityId: updated.id,
        storeId: updated.storeId,
        regionId: updated.regionId,
        category: updated.category,
        priority: updated.priority,
        ...(updated.assigneeId ? { assigneeId: updated.assigneeId } : {}),
        from: current.status,
        to: updated.status,
        changedBy: caller.id,
        occurredAt: updated.updatedAt,
      });
    }
    return updated;
  }

  /** Only the task's creator, or a store manager of the task's store, may delete it. */
  async delete(id: string, caller: AuthUser): Promise<void> {
    const task = await this.getById(id);
    const isOwner = task.createdBy === caller.id;
    const isStoreManager = caller.role === 'STORE_MANAGER' && caller.storeId === task.storeId;
    if (!isOwner && !isStoreManager) {
      throw new ForbiddenError('Only the activity owner or a store manager of its store can delete it');
    }

    await this.repository.delete(id);
    await this.events.publish('activity.deleted', {
      activityId: task.id,
      storeId: task.storeId,
      regionId: task.regionId,
      status: task.status,
      deletedBy: caller.id,
      occurredAt: nowIso(),
    });
  }

  /** Audit trail of bulk status changes for one activity, oldest first. */
  async listAudit(id: string): Promise<TaskAuditEntry[]> {
    await this.getById(id);
    return this.audit.listByActivity(id);
  }

  /**
   * Shift handover: moves each id to DONE/BLOCKED independently, in request order.
   * Per-id AppErrors become FAILED results; anything else is a bug and re-throws.
   */
  async bulkUpdateStatus(input: BulkStatusInput, caller: AuthUser): Promise<BulkStatusResult> {
    const batchId = newId('hnd');
    const actor = await this.staff.getById(caller.id);
    const actorName = `${actor.profile.firstName} ${actor.profile.lastName}`;

    const results: BulkStatusItemResult[] = [];
    const updated: Task[] = [];
    for (const id of input.ids) {
      try {
        const { from, task } = await this.applyBulkStatus(id, input, caller, batchId, actorName);
        results.push({ id, outcome: 'UPDATED', from, to: input.status });
        updated.push(task);
      } catch (err: unknown) {
        if (!(err instanceof AppError)) throw err;
        results.push({ id, outcome: 'FAILED', error: { code: err.code, message: err.message } });
      }
    }

    if (updated.length > 0) {
      const closedCount = input.status === 'DONE' ? updated.length : 0;
      await this.events.publish('activity.handover_completed', {
        batchId,
        completedBy: caller.id,
        completedByName: actorName,
        ...(input.note ? { note: input.note } : {}),
        closedCount,
        blockedCount: updated.length - closedCount,
        stores: groupByStore(updated, input.status),
        programmes: groupByProgramme(updated, input.status),
        occurredAt: nowIso(),
      });
    }

    return {
      batchId,
      status: input.status,
      results,
      summary: { updated: updated.length, failed: results.length - updated.length },
    };
  }

  private async applyBulkStatus(
    id: string,
    input: BulkStatusInput,
    caller: AuthUser,
    batchId: string,
    actorName: string,
  ): Promise<{ from: TaskStatus; task: Task }> {
    const current = await this.getById(id);
    const regionScoped = REGION_SCOPED_ROLES.includes(caller.role);
    const inScope = regionScoped ? current.regionId === caller.regionId : current.storeId === caller.storeId;
    if (!inScope) throw new ForbiddenError(`Activity '${id}' is outside your ${regionScoped ? 'region' : 'store'}`);
    if (!ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
      throw new ConflictError(
        `Cannot move activity from '${current.status}' to '${input.status}'`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const timestamp = nowIso();
    const task = await this.repository.save({ ...current, status: input.status, updatedAt: timestamp });
    await this.audit.append({
      id: newId('aud'),
      activityId: task.id,
      batchId,
      from: current.status,
      to: task.status,
      actorId: caller.id,
      actorName,
      ...(input.note ? { note: input.note } : {}),
      createdAt: timestamp,
    });
    await this.events.publish('activity.status_changed', {
      activityId: task.id,
      storeId: task.storeId,
      regionId: task.regionId,
      category: task.category,
      priority: task.priority,
      ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
      from: current.status,
      to: task.status,
      changedBy: caller.id,
      occurredAt: timestamp,
    });
    return { from: current.status, task };
  }

  private async assertAssignable(staffId: string): Promise<void> {
    const member = await this.staff.getById(staffId).catch((err: unknown) => {
      if (err instanceof NotFoundError) return undefined;
      throw err;
    });
    if (!member) throw new ValidationError(`assigneeId '${staffId}' does not reference a staff member`);
    if (!member.active) throw new ValidationError(`Staff member '${staffId}' is inactive`);
  }
}

function groupByStore(tasks: readonly Task[], status: BulkStatus): HandoverStoreGroup[] {
  const groups = new Map<string, HandoverStoreGroup>();
  for (const task of tasks) {
    const group = groups.get(task.storeId) ?? {
      storeId: task.storeId,
      regionId: task.regionId,
      closedCount: 0,
      blockedCount: 0,
      activityIds: [],
    };
    if (status === 'DONE') group.closedCount += 1;
    else group.blockedCount += 1;
    group.activityIds.push(task.id);
    groups.set(task.storeId, group);
  }
  return [...groups.values()];
}

function groupByProgramme(tasks: readonly Task[], status: BulkStatus): HandoverProgrammeGroup[] {
  const groups = new Map<string, HandoverProgrammeGroup>();
  for (const task of tasks) {
    if (!task.programmeId) continue;
    const key = `${task.programmeId}|${task.storeId}`;
    const group = groups.get(key) ?? {
      programmeId: task.programmeId,
      storeId: task.storeId,
      closedCount: 0,
      blockedCount: 0,
      activityIds: [],
    };
    if (status === 'DONE') group.closedCount += 1;
    else group.blockedCount += 1;
    group.activityIds.push(task.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}
