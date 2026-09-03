import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The CI `ui` job runs `vitest --reporter=junit` and publishes test-results/junit.xml
// (research R10, github-ci-standards). The JUnit output path is fixed here so the workflow
// step and the config cannot disagree.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: {
      junit: './test-results/junit.xml',
    },
  },
});
