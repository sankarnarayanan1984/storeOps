import type { Project } from './programmes.types';

const SEEDED_AT = '2026-10-01T09:00:00.000Z';

/** Mock programmes. Members reference staff ids from staff.seed.ts — never copy staff data here. */
export const programmesSeed: readonly Project[] = [
  {
    id: 'prg_001',
    name: 'Festive Season Readiness',
    description: 'Stock, staffing and visual merchandising checks ahead of peak trading.',
    type: 'SEASONAL_ROLLOUT',
    status: 'ACTIVE',
    startsOn: '2026-10-01',
    endsOn: '2026-12-31',
    enrolledStoreIds: ['store_001'],
    members: [
      { staffId: 'stf_001', role: 'STORE_MANAGER', addedAt: SEEDED_AT },
      { staffId: 'stf_002', role: 'ASSOCIATE', addedAt: SEEDED_AT },
    ],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'prg_002',
    name: 'Fire Safety Compliance Drive',
    description: 'Quarterly fire-exit, signage and extinguisher checks across the southern region.',
    type: 'COMPLIANCE_DRIVE',
    status: 'ACTIVE',
    startsOn: '2026-10-15',
    endsOn: '2027-01-15',
    enrolledStoreIds: ['store_001', 'store_002'],
    members: [
      { staffId: 'stf_005', role: 'DEPARTMENT_LEAD', addedAt: SEEDED_AT },
      { staffId: 'stf_003', role: 'STORE_MANAGER', addedAt: SEEDED_AT },
    ],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'prg_003',
    name: 'Store 003 Refit',
    description: 'New shelving and lighting for the household and frozen aisles.',
    type: 'STORE_REFIT',
    status: 'COMPLETED',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    enrolledStoreIds: ['store_003'],
    members: [{ staffId: 'stf_006', role: 'STORE_MANAGER', addedAt: SEEDED_AT }],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'prg_004',
    name: 'Winter Range Rollout',
    description: 'Introduce the winter range and seasonal end-caps.',
    type: 'SEASONAL_ROLLOUT',
    status: 'PLANNED',
    startsOn: '2026-11-15',
    endsOn: '2027-02-28',
    enrolledStoreIds: ['store_002'],
    members: [],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
];
