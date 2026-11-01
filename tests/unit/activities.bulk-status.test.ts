import { InMemoryActivitiesRepository, InMemoryActivityAuditRepository } from '../../src/modules/activities/activities.repository';
import { ActivitiesService } from '../../src/modules/activities/activities.service';
import type { Task } from '../../src/modules/activities/activities.types';
import type { Staff, StaffReader } from '../../src/modules/staff/staff.reader';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import type { AuthUser } from '../../src/shared/http/auth';

const caller: AuthUser = { id: 'stf_test', role: 'ASSOCIATE', storeId: 'store_001', regionId: 'region_south' };

const task: Task = {
  id: 'tsk_unit',
  title: 'Unit task',
  storeId: 'store_001',
  regionId: 'region_south',
  status: 'TODO',
  priority: 'LOW',
  category: 'GENERAL',
  dueAt: '2026-11-01T09:00:00.000Z',
  createdBy: 'stf_test',
  createdAt: '2026-10-30T09:00:00.000Z',
  updatedAt: '2026-10-30T09:00:00.000Z',
};

const stubStaff: StaffReader = {
  getById: (id) =>
    Promise.resolve({
      id,
      email: 'test.actor@storeops.example',
      role: 'ASSOCIATE',
      storeId: 'store_001',
      regionId: 'region_south',
      active: true,
      profile: { firstName: 'Test', lastName: 'Actor' },
      createdAt: '2026-10-30T09:00:00.000Z',
      updatedAt: '2026-10-30T09:00:00.000Z',
    } satisfies Staff),
  list: () => Promise.resolve([]),
  authenticate: () => Promise.reject(new TypeError('not used')),
};

describe('ActivitiesService.bulkUpdateStatus', () => {
  it('S1-AC6 resolves actorName through the injected StaffReader', async () => {
    const audit = new InMemoryActivityAuditRepository();
    const service = new ActivitiesService(new InMemoryActivitiesRepository([task]), stubStaff, new InMemoryEventBus(), audit);

    const result = await service.bulkUpdateStatus({ ids: [task.id], status: 'DONE' }, caller);

    expect(result.summary).toEqual({ updated: 1, failed: 0 });
    const entries = await audit.listByActivity(task.id);
    expect(entries).toEqual([
      expect.objectContaining({ actorId: 'stf_test', actorName: 'Test Actor', batchId: result.batchId, from: 'TODO', to: 'DONE' }),
    ]);
    expect(entries[0]).not.toHaveProperty('note');
  });

  it('re-throws non-AppError failures instead of reporting them as an item failure', async () => {
    const repository = new InMemoryActivitiesRepository([task]);
    repository.save = () => Promise.reject(new TypeError('storage down'));
    const service = new ActivitiesService(repository, stubStaff, new InMemoryEventBus(), new InMemoryActivityAuditRepository());

    await expect(service.bulkUpdateStatus({ ids: [task.id], status: 'DONE' }, caller)).rejects.toThrow('storage down');
  });
});
