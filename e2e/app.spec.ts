import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

const networkingDeck = fileURLToPath(new URL('./fixtures/networking.md', import.meta.url));

async function expectNoAxeViolations(page: Page) {
  // Scan the settled screen, including the reveal animation, rather than an arbitrary frame.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
}

async function revealWithKeyboard(page: Page) {
  // Hash navigation and React effects finish asynchronously after the link click.
  // Focus on the answer also confirms that the grade shortcut is ready.
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('card-back')).toBeFocused();
}

async function importNetworkingDeck(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Your decks' })).toBeVisible();
  await page.getByLabel('Choose a file').setInputFiles(networkingDeck);
  await expect(page.getByTestId('import-summary')).toHaveText('Found 3 valid cards.');
  await page.getByRole('button', { name: 'Import 3 cards' }).click();
  await expect(page.getByRole('link', { name: 'Networking basics', exact: true })).toBeVisible();
}

test('first open shows the sample decks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Data structures', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'HTTP basics', exact: true })).toBeVisible();
});

test('import a Markdown deck, review it with the keyboard, reload and keep progress', async ({ page }) => {
  await importNetworkingDeck(page);
  await page.getByRole('link', { name: 'Networking basics', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Networking basics' })).toBeFocused();
  await page.getByRole('link', { name: 'Review 3 due cards' }).click();

  const front = page.getByTestId('card-front');
  await expect(front).toHaveText('What does DNS do?');
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeFocused();

  // DNS: Good. TCP/UDP: Again (re-queued), HTTPS: Easy, then TCP/UDP again: Good.
  for (const [question, key] of [
    ['What does DNS do?', '3'],
    ['What is the difference between TCP and UDP?', '1'],
    ['What port does HTTPS use by default?', '4'],
    ['What is the difference between TCP and UDP?', '3'],
  ] as const) {
    await expect(front).toHaveText(question);
    await revealWithKeyboard(page);
    await expect(page.getByTestId('card-back')).toBeVisible();
    await page.keyboard.press(key);
  }
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeFocused();
  await expect(page.getByText('You reviewed 3 cards (4 answers, 1 forgotten).')).toBeVisible();
  await expect(page.getByTestId('live-region')).toHaveText('Graded Good. Session complete.');

  // Everything was written to IndexedDB: a full reload shows the same state.
  await page.goto('/#/stats');
  await page.reload();
  await expect(page.getByTestId('reviews-today')).toHaveText('4');
  await page.goto('/#/');
  await expect(page.getByText('3 cards · 0 due · 0 new')).toBeVisible();
});

test('keyboard users can leave the review screen with Enter, during and after a session', async ({
  page,
}) => {
  // During a review: Enter on a focused navigation link follows the link.
  await page.goto('/#/review');
  await expect(page.getByTestId('card-front')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stats' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible();

  // After a session: Tab to "Done" and press Enter.
  await importNetworkingDeck(page);
  await page.getByRole('link', { name: 'Review 3 due from Networking basics' }).click();
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByRole('button', { name: /Show answer/ })).toBeFocused();
    await revealWithKeyboard(page);
    await expect(page.getByTestId('card-back')).toBeVisible();
    await page.keyboard.press('3');
  }
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/deck\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Networking basics' })).toBeVisible();
});

test('works offline after the first load (service worker)', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'HTTP basics', exact: true })).toBeVisible();
  // Wait until the service worker has installed, precached the app and taken control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your decks' })).toBeVisible();
  await page.getByRole('link', { name: 'Review 12 due from HTTP basics' }).click();
  await revealWithKeyboard(page);
  await page.keyboard.press('3');
  await expect(page.getByText('1 of 12 done')).toBeVisible();

  // The review written while offline survives a reload that is also served offline.
  await page.evaluate(() => {
    window.location.hash = '#/stats';
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible();
  await expect(page.getByTestId('reviews-today')).toHaveText('1');
  await context.setOffline(false);
});

test('a second tab picks up reviews made in another tab (BroadcastChannel)', async ({ context }) => {
  const statsTab = await context.newPage();
  await statsTab.goto('/#/stats');
  await expect(statsTab.getByTestId('reviews-today')).toHaveText('0');

  const reviewTab = await context.newPage();
  await reviewTab.goto('/#/review');
  await expect(reviewTab.getByRole('button', { name: /Show answer/ })).toBeFocused();
  await revealWithKeyboard(reviewTab);
  await reviewTab.keyboard.press('3');
  await expect(reviewTab.getByText('1 of 24 done')).toBeVisible();

  // No reload: the stats tab reloads its copy of the data when told about the write.
  await expect(statsTab.getByTestId('reviews-today')).toHaveText('1');
  await expect(statsTab.getByTestId('due-now')).toHaveText('23');
});

test('download a JSON backup', async ({ page }) => {
  await page.goto('/#/data');
  await expect(page.getByText(/2 decks · 24 cards · 0 reviews/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup (JSON)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^recall-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, 'utf8')) as { format: string; cards: unknown[] };
  expect(backup.format).toBe('recall-flashcards-backup');
  expect(backup.cards).toHaveLength(24);
});

for (const [reducedMotion, check] of [
  ['no-preference', (seconds: number) => expect(seconds).toBeCloseTo(0.18, 3)],
  ['reduce', (seconds: number) => expect(seconds).toBeLessThan(0.001)],
] as const) {
  test(`reveal animation honours prefers-reduced-motion: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/#/review');
    await expect(page.getByTestId('card-front')).toBeVisible();
    await revealWithKeyboard(page);
    const duration = await page
      .getByTestId('card-back')
      .evaluate((el) => getComputedStyle(el).animationDuration);
    check(parseFloat(duration));
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`has no detectable WCAG 2.2 AA violations (${colorScheme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Data structures', exact: true })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Data structures', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Data structures' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/#/review');
    await expect(page.getByTestId('card-front')).toBeVisible();
    await revealWithKeyboard(page);
    await expect(page.getByTestId('card-back')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/#/stats');
    await expect(page.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/#/data');
    await expectNoAxeViolations(page);

    // Import preview with a line-numbered problem list.
    await page.goto('/');
    await page.getByLabel('Or paste the text').fill('### Good?\nYes.\n\n### Empty?\n');
    await expect(page.getByTestId('import-summary')).toHaveText('Found 1 valid card, 1 problem.');
    await expect(page.getByRole('list', { name: 'Problems' })).toBeVisible();
    await expectNoAxeViolations(page);

    // Session summary screen.
    await page.getByLabel('Deck name', { exact: true }).last().fill('Axe check');
    await page.getByRole('button', { name: 'Import 1 card (skip 1)' }).click();
    await page.getByRole('link', { name: 'Review 1 due from Axe check' }).click();
    await expect(page.getByRole('button', { name: /Show answer/ })).toBeFocused();
    await revealWithKeyboard(page);
    await expect(page.getByTestId('card-back')).toBeVisible();
    await page.keyboard.press('3');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeFocused();
    await expectNoAxeViolations(page);
  });
}
