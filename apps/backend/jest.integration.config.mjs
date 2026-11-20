import base from './jest.config.mjs';
export default {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/integration/**/*.test.ts'],
  reporters: ['default'],
  testTimeout: 30000,
};
