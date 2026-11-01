import type { Task, TaskAuditEntry, TaskFilter } from './activities.types';

export interface ActivitiesRepository {
  list(filter: TaskFilter): Promise<Task[]>;
  findById(id: string): Promise<Task | undefined>;
  save(task: Task): Promise<Task>;
  delete(id: string): Promise<void>;
}

export class InMemoryActivitiesRepository implements ActivitiesRepository {
  private readonly items = new Map<string, Task>();

  constructor(seed: readonly Task[] = []) {
    for (const task of seed) this.items.set(task.id, { ...task });
  }

  list(filter: TaskFilter): Promise<Task[]> {
    const result = [...this.items.values()]
      .filter((t) => !filter.programmeId || t.programmeId === filter.programmeId)
      .filter((t) => !filter.storeId || t.storeId === filter.storeId)
      .filter((t) => !filter.status || t.status === filter.status)
      .filter((t) => !filter.priority || t.priority === filter.priority)
      .filter((t) => !filter.category || t.category === filter.category)
      .filter((t) => !filter.assigneeId || t.assigneeId === filter.assigneeId)
      .map((t) => ({ ...t }));
    return Promise.resolve(result);
  }

  findById(id: string): Promise<Task | undefined> {
    const task = this.items.get(id);
    return Promise.resolve(task ? { ...task } : undefined);
  }

  save(task: Task): Promise<Task> {
    this.items.set(task.id, { ...task });
    return Promise.resolve({ ...task });
  }

  delete(id: string): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }
}

export interface ActivityAuditRepository {
  append(entry: TaskAuditEntry): Promise<TaskAuditEntry>;
  /** Entries for one activity, oldest first. */
  listByActivity(activityId: string): Promise<TaskAuditEntry[]>;
}

export class InMemoryActivityAuditRepository implements ActivityAuditRepository {
  private readonly entries: TaskAuditEntry[] = [];

  append(entry: TaskAuditEntry): Promise<TaskAuditEntry> {
    this.entries.push({ ...entry });
    return Promise.resolve({ ...entry });
  }

  listByActivity(activityId: string): Promise<TaskAuditEntry[]> {
    return Promise.resolve(this.entries.filter((e) => e.activityId === activityId).map((e) => ({ ...e })));
  }
}
