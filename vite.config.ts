/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths so dist/ works from any folder or static host
  test: {
    environment: 'jsdom',
  },
});
