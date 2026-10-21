/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          strictPropertyInitialization: false,
          skipLibCheck: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['/src/main.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
  moduleNameMapper: {
    '^@toka/platform$': '<rootDir>/../../shared/platform/src/index.ts',
    '^@toka/contracts$': '<rootDir>/../../shared/contracts/src/index.ts',
  },
};
