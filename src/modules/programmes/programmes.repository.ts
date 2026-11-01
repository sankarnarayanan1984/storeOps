import type { ProgrammeHandover, Project } from './programmes.types';

export interface ProgrammesRepository {
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | undefined>;
  save(programme: Project): Promise<Project>;
  appendHandover(record: ProgrammeHandover): Promise<ProgrammeHandover>;
  /** Handovers of one programme, oldest first. */
  listHandovers(programmeId: string): Promise<ProgrammeHandover[]>;
}

const clone = (p: Project): Project => ({
  ...p,
  enrolledStoreIds: [...p.enrolledStoreIds],
  members: p.members.map((m) => ({ ...m })),
});

const cloneHandover = (h: ProgrammeHandover): ProgrammeHandover => ({ ...h, activityIds: [...h.activityIds] });

export class InMemoryProgrammesRepository implements ProgrammesRepository {
  private readonly items = new Map<string, Project>();
  private readonly handovers: ProgrammeHandover[] = [];

  constructor(seed: readonly Project[] = []) {
    for (const programme of seed) this.items.set(programme.id, clone(programme));
  }

  list(): Promise<Project[]> {
    return Promise.resolve([...this.items.values()].map(clone));
  }

  findById(id: string): Promise<Project | undefined> {
    const programme = this.items.get(id);
    return Promise.resolve(programme ? clone(programme) : undefined);
  }

  save(programme: Project): Promise<Project> {
    this.items.set(programme.id, clone(programme));
    return Promise.resolve(clone(programme));
  }

  appendHandover(record: ProgrammeHandover): Promise<ProgrammeHandover> {
    this.handovers.push(cloneHandover(record));
    return Promise.resolve(cloneHandover(record));
  }

  listHandovers(programmeId: string): Promise<ProgrammeHandover[]> {
    return Promise.resolve(this.handovers.filter((h) => h.programmeId === programmeId).map(cloneHandover));
  }
}
