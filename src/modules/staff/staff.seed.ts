import type { StoredUser } from './staff.types';

const SEEDED_AT = '2026-10-01T09:00:00.000Z';

/** Mock staff. Every seeded account's password is `StoreOps@123` (stf_004 is inactive and cannot log in). */
export const staffSeed: readonly StoredUser[] = [
  {
    id: 'stf_001',
    email: 'priya.nair@storeops.example',
    role: 'STORE_MANAGER',
    storeId: 'store_001',
    regionId: 'region_south',
    active: true,
    profile: { firstName: 'Priya', lastName: 'Nair', phone: '+91 98450 11001' },
    passwordHash:
      'scrypt$RPJTpNE6AIsyQ3AU8x7Zcw$jAu4HwPPAWMQfX9FbeGt2QtcI9Aezm9DIfAHekZ74IgTL3g1mrrZVf10wjGEGyQb0MUdgftb7FfgL7MycN6LuA',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'stf_002',
    email: 'arun.kumar@storeops.example',
    role: 'ASSOCIATE',
    storeId: 'store_001',
    regionId: 'region_south',
    active: true,
    profile: { firstName: 'Arun', lastName: 'Kumar', department: 'Dairy & Chilled' },
    passwordHash:
      'scrypt$qPSvpf-swawvUEEcz8OuyA$A_-e2mGPaj1UAvGRW4JamPnGTxNQJTgnBakqnAwduuoi1oYf12EZyEI1mjAdVw5wlGcBIuyxgkr42iAWxKWgOQ',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'stf_003',
    email: 'meera.iyer@storeops.example',
    role: 'REGIONAL_MANAGER',
    storeId: 'store_002',
    regionId: 'region_south',
    active: true,
    profile: { firstName: 'Meera', lastName: 'Iyer', phone: '+91 98450 11003' },
    passwordHash:
      'scrypt$rVTp__mQ7bDK0DKD9JqMJw$lSPB9zGdL9Pnv3T_Be2EYdHpn6uVOaXxMIVx-iQV_IaeW17hNn8t5wDHbxCzE03ix4iOU-_WtVNJsGzc_sWLOA',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'stf_004',
    email: 'ravi.shah@storeops.example',
    role: 'ASSOCIATE',
    storeId: 'store_003',
    regionId: 'region_north',
    active: false,
    profile: { firstName: 'Ravi', lastName: 'Shah', department: 'Household' },
    passwordHash:
      'scrypt$mZ4O2ZlF4HXo5stjkhIXkg$RwZ3est3dnauslWi4fuzkahs_liuMCoyIn0eo8v7_-v4h_epHd41Z_FTsk6hmujCXu8290R-2mk5i_fYq5xH1Q',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'stf_005',
    email: 'kavya.reddy@storeops.example',
    role: 'DEPARTMENT_LEAD',
    storeId: 'store_001',
    regionId: 'region_south',
    active: true,
    profile: { firstName: 'Kavya', lastName: 'Reddy', department: 'Fresh Produce', phone: '+91 98450 11005' },
    passwordHash:
      'scrypt$EchLdGkxSNQ7b2v2OfTgUA$KHz_2_pFBZXeWmS0NDBLA-DQrCdg_0gnd4eu2R6Nqqu1IhLkRVOTgdZpBxiX6vn9Bpw_Z_T9pMBwB6aO_BZA7g',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'stf_006',
    email: 'vikram.singh@storeops.example',
    role: 'STORE_MANAGER',
    storeId: 'store_003',
    regionId: 'region_north',
    active: true,
    profile: { firstName: 'Vikram', lastName: 'Singh' },
    passwordHash:
      'scrypt$E0lNYy-AEdcsVJt2N0MQ7w$bFc2NYGND3uwQlZLD5e_v7DNbCnQBc9gZ0Y0iI4aqMytJnhf3yYzIJAF4NfpA5M1_LYpW9rE-25wzaN_T5KOwQ',
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
];
