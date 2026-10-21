import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    // Playwright specs run through `npm run e2e`, not vitest.
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
  },
});
