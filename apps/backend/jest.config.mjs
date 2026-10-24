export default {
  testEnvironment: 'node',
  cacheDirectory: '<rootDir>/../../.local/jest-cache',
  roots: ['<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
};
