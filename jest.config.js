/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  clearMocks: true,
  // StoreOps coverage thresholds (capstone brief §3.6). Glob keys apply to each matching file.
  coverageThreshold: {
    global: { lines: 70 },
    './src/modules/**/*.service.ts': { lines: 80 },
    './src/modules/**/*.routes.ts': { lines: 70 },
    './src/shared/**/*.ts': { lines: 60 },
  },
};
