export const METRIC_SCOPES = ['store', 'region'] as const;
export type MetricScope = (typeof METRIC_SCOPES)[number];

export interface MetricCounters {
  activitiesTotal: number;
  activitiesCompleted: number;
  activitiesBlocked: number;
  programmesEnrolled: number;
  /** Shift handover batches touching the scope (a region counts a batch once). */
  handoversCompleted: number;
  handoverTasksClosed: number;
  handoverTasksBlocked: number;
}

export type MetricField = keyof MetricCounters;

export interface Metrics extends MetricCounters {
  scope: MetricScope;
  id: string;
  completionRate: number;
}

/** Report records (generated summaries). Produced from events; reports never writes to other modules. */
export const REPORT_TYPES = ['STORE_SUMMARY', 'REGIONAL_ROLLUP', 'DEPARTMENT_PERFORMANCE'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface Report {
  id: string;
  type: ReportType;
  status: ReportStatus;
  /** Store id for STORE_SUMMARY / DEPARTMENT_PERFORMANCE, region id for REGIONAL_ROLLUP. */
  scopeId: string;
  requestedAt: string;
  completedAt?: string;
  data?: Record<string, unknown>;
  error?: string;
}
