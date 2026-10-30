import type { Project } from './programmes.types';

export interface ProgrammesRepository {
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | undefined>;
  save(programme: Project): Promise<Project>;
}

const clone = (p: Project): Project => ({
  ...p,
  enrolledStoreIds: [...p.enrolledStoreIds],
  members: p.members.map((m) => ({ ...m })),
});

export class InMemoryProgrammesRepository implements ProgrammesRepository {
  private readonly items = new Map<string, Project>();

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
}
