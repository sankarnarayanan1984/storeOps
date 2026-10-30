import type {
  ActivityCreatedEvent,
  ActivityDeletedEvent,
  ActivityStatusChangedEvent,
  ProgrammeCreatedEvent,
  ProgrammeStoreEnrolledEvent,
} from '../../shared/events/domainEvents';
import type { ReportsRepository } from './reports.repository';
import type { MetricField, MetricScope, Metrics } from './reports.types';

/** Read-only aggregation: builds metrics from events and never writes to other modules. */
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  async getMetrics(scope: MetricScope, id: string): Promise<Metrics> {
    const counters = await this.repository.get(scope, id);
    const completionRate =
      counters.activitiesTotal === 0 ? 0 : counters.activitiesCompleted / counters.activitiesTotal;
    return { scope, id, ...counters, completionRate: Math.round(completionRate * 1000) / 1000 };
  }

  async recordActivityCreated(event: ActivityCreatedEvent): Promise<void> {
    await this.bump(event, 'activitiesTotal', 1);
  }

  async recordStatusChange(event: ActivityStatusChangedEvent): Promise<void> {
    if (event.from === 'BLOCKED') await this.bump(event, 'activitiesBlocked', -1);
    if (event.to === 'BLOCKED') await this.bump(event, 'activitiesBlocked', 1);
    if (event.to === 'DONE') await this.bump(event, 'activitiesCompleted', 1);
  }

  async recordActivityDeleted(event: ActivityDeletedEvent): Promise<void> {
    await this.bump(event, 'activitiesTotal', -1);
    if (event.status === 'DONE') await this.bump(event, 'activitiesCompleted', -1);
    if (event.status === 'BLOCKED') await this.bump(event, 'activitiesBlocked', -1);
  }

  async recordEnrolment(event: ProgrammeStoreEnrolledEvent | ProgrammeCreatedEvent): Promise<void> {
    // Programme events carry no region, so this metric is store-scoped only.
    await this.repository.increment('store', event.storeId, 'programmesEnrolled');
  }

  private async bump(
    target: { storeId: string; regionId: string },
    field: MetricField,
    delta: number,
  ): Promise<void> {
    await this.repository.increment('store', target.storeId, field, delta);
    await this.repository.increment('region', target.regionId, field, delta);
  }
}
