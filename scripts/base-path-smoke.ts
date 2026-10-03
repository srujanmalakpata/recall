/**
 * Smoke test for a GitHub Pages-style build served under a sub-path (VERIFICATION.md row 7).
 *
 * Builds into dist-base/ with BASE_PATH (default /recall/), leaving dist/ unchanged,
 * and serves the result with `vite preview` on port 4180. Chromium checks asset URLs,
 * sample-deck rendering, service-worker scope, and page, request and HTTP errors.
 *
 * Run `npm run smoke:base`; override BASE_PATH for another repository path and
 * CHROMIUM_PATH for a specific Chromium executable (as in playwright.config.ts).
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_PATH ?? '/recall/';
if (!BASE.startsWith('/') || !BASE.endsWith('/')) {
  throw new Error(`BASE_PATH must start and end with "/" (got ${BASE})`);
}
const PORT = 4180;
const ORIGIN = `http://localhost:${PORT}`;
const OUT_DIR = 'dist-base';
const env = { ...process.env, BASE_PATH: BASE };
// Run Vite's CLI with this Node directly (not through npx), so kill() stops the server itself.
const VITE = ['node_modules/vite/bin/vite.js'];

function fail(message: string): never {
  throw new Error(message);
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`vite preview did not answer at ${url} within ${timeoutMs} ms`);
}

async function main(): Promise<void> {
  const build = spawnSync(process.execPath, [...VITE, 'build', '--outDir', OUT_DIR, '--emptyOutDir'], {
    env,
    stdio: 'inherit',
  });
  if (build.status !== 0) fail('vite build failed');

  let server: ChildProcess | null = null;
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  try {
    server = spawn(
      process.execPath,
      [...VITE, 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
      {
        env,
        stdio: 'ignore',
      },
    );
    await waitForServer(`${ORIGIN}${BASE}`);

    const page = await browser.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`));
    page.on('response', (response) => {
      if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    await page.goto(`${ORIGIN}${BASE}`);
    await page.getByRole('link', { name: 'Data structures', exact: true }).waitFor();

    const urls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src], link[href]')).map(
        (el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '',
      ),
    );
    const outside = urls.filter((url) => !url.startsWith(BASE));
    if (outside.length > 0) problems.push(`asset URLs outside ${BASE}: ${outside.join(', ')}`);

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    if (scope !== `${ORIGIN}${BASE}`) problems.push(`service worker scope is ${scope}`);

    console.log(`index.html asset URLs (${urls.length}): ${urls.join(', ')}`);
    console.log(`service worker scope: ${scope}`);
    if (problems.length > 0) fail(`base-path smoke test FAILED:\n  ${problems.join('\n  ')}`);
    console.log(`base-path smoke test PASSED: app rendered under ${BASE} with no errors`);
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
