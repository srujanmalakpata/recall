/** Capture the production study screen with fresh sample data in both themes. */
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

async function main(): Promise<void> {
  const server = await preview({
    preview: { host: '127.0.0.1', port: 4181, strictPort: true, open: false },
  });
  try {
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    );
    try {
      await mkdir('docs', { recursive: true });
      for (const colorScheme of ['light', 'dark'] as const) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          colorScheme,
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:4181${server.config.base}`);
          await page.getByRole('link', { name: 'Review 12 due from HTTP basics' }).click();
          const reveal = page.getByRole('button', { name: /Show answer/ });
          await expect(reveal).toBeFocused();
          await reveal.click();
          await expect(page.getByTestId('card-back')).toBeFocused();
          await page.screenshot({
            path: `docs/screenshot-${colorScheme}.png`,
            animations: 'disabled',
          });
          console.log(`Saved docs/screenshot-${colorScheme}.png (1280x800)`);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
