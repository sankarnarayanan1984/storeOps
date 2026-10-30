import type { TaskCategory, TaskPriority, TaskStatus } from '../../shared/events/domainEvents';

export type { TaskCategory, TaskPriority, TaskStatus };

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const satisfies readonly TaskStatus[];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const satisfies readonly TaskPriority[];
export const TASK_CATEGORIES = [
  'RESTOCKING',
  'PLANOGRAM',
  'AUDIT',
  'COMPLIANCE',
  'GENERAL',
] as const satisfies readonly TaskCategory[];

/** An operational activity (restocking run, planogram reset, audit, compliance check, general task). */
export interface Task {
  id: string;
  title: string;
  description?: string;
  storeId: string;
  regionId: string;
  programmeId?: string;
  assigneeId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueAt: string;
  /** Staff id of the creator — the task "owner" for delete permission. */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  storeId?: string;
  regionId?: string;
  programmeId?: string;
  assigneeId?: string;
  priority: TaskPriority;
  category: TaskCategory;
  dueAt: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  /** null unassigns the task. */
  assigneeId?: string | null;
}

export interface TaskFilter {
  programmeId?: string;
  storeId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  assigneeId?: string;
}
