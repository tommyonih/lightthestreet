/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths so dist/ works from any folder or static host
  // the 3D street (three.js) is one lazy chunk of ~600 kB raw / ~155 kB gzipped, loaded only in 3D mode
  build: { chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
  },
});
