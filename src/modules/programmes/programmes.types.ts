import type { ProjectRole, ProjectType } from '../../shared/events/domainEvents';
import type { Staff } from '../staff/staff.reader';

export type { ProjectRole, ProjectType };

export const PROJECT_TYPES = ['SEASONAL_ROLLOUT', 'COMPLIANCE_DRIVE', 'STORE_REFIT'] as const satisfies readonly ProjectType[];
export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_ROLES = ['STORE_MANAGER', 'DEPARTMENT_LEAD', 'ASSOCIATE'] as const satisfies readonly ProjectRole[];

export interface ProjectMember {
  staffId: string;
  role: ProjectRole;
  addedAt: string;
}

/** A store programme (seasonal rollout, compliance drive, store refit). */
export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  startsOn: string;
  endsOn: string;
  enrolledStoreIds: string[];
  members: ProjectMember[];
  createdAt: string;
  updatedAt: string;
}

/** Staff fields exposed alongside a member — never credentials. */
export type MemberStaff = Pick<Staff, 'id' | 'email' | 'role' | 'storeId' | 'active' | 'profile'>;

export interface ProjectMemberView extends ProjectMember {
  staff: MemberStaff | null;
}

export interface ProjectView extends Omit<Project, 'members'> {
  members: ProjectMemberView[];
}

export interface ProjectSummary extends Omit<Project, 'members'> {
  memberCount: number;
  /** Members whose staff record belongs to the caller's store. */
  storeMemberCount: number;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  type: ProjectType;
  startsOn: string;
  endsOn: string;
}

export interface ProjectFilter {
  type?: ProjectType;
  status?: ProjectStatus;
  staffId?: string;
}
