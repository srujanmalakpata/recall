/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves a project site from /<repo-name>/, so the deploy workflow
// sets BASE_PATH. Locally (dev, preview, e2e) the app lives at the root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new deployment waits until the user clicks "Reload to update"
      // (src/registerServiceWorker.ts), so it never force-reloads a tab mid-review.
      registerType: 'prompt',
      injectRegister: false, // registered explicitly in src/registerServiceWorker.ts
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'recall: spaced-repetition flashcards',
        short_name: 'recall',
        description: 'Offline-first flashcards scheduled with the SM-2 algorithm.',
        theme_color: '#1f4f8a',
        background_color: '#fcfcfb',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        // Take control of the page on the very first install (so it works offline at once);
        // later versions wait for SKIP_WAITING from the update banner.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Component tests type real keystrokes with user-event; give slow/shared CI machines headroom.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      reporter: ['text-summary', 'html'],
    },
  },
});
