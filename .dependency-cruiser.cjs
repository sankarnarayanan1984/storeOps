/**
 * StoreOps module-boundary rules (capstone brief §3.5), checked by `npm run depcheck`.
 * These complement the ESLint import rules and tests/architecture.test.ts.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular imports anywhere in src.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-module-repository',
      severity: 'error',
      comment: "Failure mode 1: a module must never import another module's repository.",
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/.+[.]repository[.]ts$', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'no-cross-module-except-staff-reader',
      severity: 'error',
      comment:
        'Modules talk through the event bus. The only cross-module import allowed is the read-only staff reader contract.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/$1/', '^src/modules/staff/staff[.]reader[.]ts$'],
      },
    },
    {
      name: 'no-direct-service-imports',
      severity: 'error',
      comment:
        'Failure mode 4: side effects across modules go through EventBus.publish — never by importing another service (e.g. AlertsService, ReportsService).',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/.+[.]service[.]ts$', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'shared-is-independent',
      severity: 'error',
      comment: 'src/shared must never depend on a feature module.',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'modules-not-composition-root',
      severity: 'error',
      comment: 'Modules must not import the composition root.',
      from: { path: '^src/modules/' },
      to: { path: '^src/(app|server)[.]ts$' },
    },
    {
      name: 'reports-read-only',
      severity: 'error',
      comment: 'reports aggregates from events only; it may not import any other module, not even the staff reader.',
      from: { path: '^src/modules/reports/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/reports/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '^(dist|coverage|tests)/' },
  },
};
