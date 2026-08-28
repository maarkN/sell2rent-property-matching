/**
 * Jest does not read tsconfig `paths`; the aliases must be restated here or
 * every aliased import fails to resolve at test time.
 */
const moduleNameMapper = {
  '^@domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@application/(.*)$': '<rootDir>/src/application/$1',
  '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
};

const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper,
  rootDir: '.',
};

module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
      globalSetup: '<rootDir>/tests/integration/global-setup.ts',
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
    },
  ],
};
