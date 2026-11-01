import type { MetricCounters, MetricField, MetricScope } from './reports.types';

export interface ReportsRepository {
  get(scope: MetricScope, id: string): Promise<MetricCounters>;
  increment(scope: MetricScope, id: string, field: MetricField, delta?: number): Promise<void>;
}

const emptyCounters = (): MetricCounters => ({
  activitiesTotal: 0,
  activitiesCompleted: 0,
  activitiesBlocked: 0,
  programmesEnrolled: 0,
  handoversCompleted: 0,
  handoverTasksClosed: 0,
  handoverTasksBlocked: 0,
});

/** Read model built from domain events; reports never queries other modules. */
export class InMemoryReportsRepository implements ReportsRepository {
  private readonly counters = new Map<string, MetricCounters>();

  get(scope: MetricScope, id: string): Promise<MetricCounters> {
    return Promise.resolve({ ...(this.counters.get(`${scope}:${id}`) ?? emptyCounters()) });
  }

  increment(scope: MetricScope, id: string, field: MetricField, delta = 1): Promise<void> {
    const key = `${scope}:${id}`;
    const current = this.counters.get(key) ?? emptyCounters();
    this.counters.set(key, { ...current, [field]: Math.max(0, current[field] + delta) });
    return Promise.resolve();
  }
}
