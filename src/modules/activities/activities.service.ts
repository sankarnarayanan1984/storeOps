import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import type { EventBus } from '../../shared/events/eventBus';
import type { AuthUser } from '../../shared/http/auth';
import { newId, nowIso } from '../../shared/id';
import type { StaffReader } from '../staff/staff.reader';
import type { ActivitiesRepository } from './activities.repository';
import type { CreateTaskInput, Task, TaskFilter, TaskStatus, UpdateTaskInput } from './activities.types';

const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
  IN_PROGRESS: ['BLOCKED', 'DONE'],
  BLOCKED: ['IN_PROGRESS', 'DONE'],
  DONE: [],
};

export class ActivitiesService {
  constructor(
    private readonly repository: ActivitiesRepository,
    private readonly staff: StaffReader,
    private readonly events: EventBus,
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

  private async assertAssignable(staffId: string): Promise<void> {
    const member = await this.staff.getById(staffId).catch((err: unknown) => {
      if (err instanceof NotFoundError) return undefined;
      throw err;
    });
    if (!member) throw new ValidationError(`assigneeId '${staffId}' does not reference a staff member`);
    if (!member.active) throw new ValidationError(`Staff member '${staffId}' is inactive`);
  }
}
