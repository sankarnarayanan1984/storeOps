/**
 * Event contracts shared between modules. Modules never import each other to
 * notify; they publish these events and subscribe to the ones they care about.
 * The vocabularies below are part of the contract, so they live here rather
 * than in the owning module (shared must never import from a module).
 */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskCategory = 'RESTOCKING' | 'PLANOGRAM' | 'AUDIT' | 'COMPLIANCE' | 'GENERAL';
export type ProjectType = 'SEASONAL_ROLLOUT' | 'COMPLIANCE_DRIVE' | 'STORE_REFIT';
export type ProjectRole = 'STORE_MANAGER' | 'DEPARTMENT_LEAD' | 'ASSOCIATE';

export interface ActivityCreatedEvent {
  activityId: string;
  storeId: string;
  regionId: string;
  programmeId?: string;
  assigneeId?: string;
  category: TaskCategory;
  priority: TaskPriority;
  createdBy: string;
  occurredAt: string;
}

export interface ActivityStatusChangedEvent {
  activityId: string;
  storeId: string;
  regionId: string;
  category: TaskCategory;
  priority: TaskPriority;
  assigneeId?: string;
  from: TaskStatus;
  to: TaskStatus;
  changedBy: string;
  occurredAt: string;
}

export interface ActivityDeletedEvent {
  activityId: string;
  storeId: string;
  regionId: string;
  status: TaskStatus;
  deletedBy: string;
  occurredAt: string;
}

/** Per-store slice of a shift handover batch. */
export interface HandoverStoreGroup {
  storeId: string;
  regionId: string;
  closedCount: number;
  blockedCount: number;
  activityIds: string[];
}

/** Per-programme slice of a shift handover batch (grouped by programmeId + storeId). */
export interface HandoverProgrammeGroup {
  programmeId: string;
  storeId: string;
  closedCount: number;
  blockedCount: number;
  activityIds: string[];
}

/** One per bulk-status request that updated at least one activity. */
export interface ActivityHandoverCompletedEvent {
  batchId: string;
  completedBy: string;
  completedByName: string;
  note?: string;
  closedCount: number;
  blockedCount: number;
  stores: HandoverStoreGroup[];
  programmes: HandoverProgrammeGroup[];
  occurredAt: string;
}

export interface ProgrammeCreatedEvent {
  programmeId: string;
  programmeName: string;
  type: ProjectType;
  storeId: string;
  occurredAt: string;
}

export interface ProgrammeStoreEnrolledEvent {
  programmeId: string;
  programmeName: string;
  storeId: string;
  occurredAt: string;
}

export interface ProgrammeMemberEvent {
  programmeId: string;
  programmeName: string;
  staffId: string;
  role: ProjectRole;
  storeId: string;
  occurredAt: string;
}

export interface DomainEvents {
  'activity.created': ActivityCreatedEvent;
  'activity.status_changed': ActivityStatusChangedEvent;
  'activity.deleted': ActivityDeletedEvent;
  'activity.handover_completed': ActivityHandoverCompletedEvent;
  'programme.created': ProgrammeCreatedEvent;
  'programme.store_enrolled': ProgrammeStoreEnrolledEvent;
  'programme.member_added': ProgrammeMemberEvent;
  'programme.member_removed': ProgrammeMemberEvent;
}

export type EventName = keyof DomainEvents;
