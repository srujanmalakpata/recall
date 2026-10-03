# recall verification

## Current verification (2026-10-03)

Environment: macOS arm64, Node.js 26.10.0, npm 11.19.1; project-local dependencies from the
existing lockfile. Registry DNS, listening ports and Chromium's macOS process registration are
restricted. These results apply to the current changes; the earlier Linux results below are a
historical baseline, not a claim that current browser checks passed.

| Check                                                                                                                                       | Result  | Evidence                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --cache /private/tmp/recall-npm-cache --fetch-retries=0 --fetch-timeout=20000`                                                      | BLOCKED | Registry request failed with `ENOTFOUND registry.npmjs.org`.                                                                                                                                                                                                                                                        |
| `npm ci --offline --cache /private/tmp/recall-npm-cache`                                                                                    | PASS    | Copied the available npm cache into a writable temporary directory; installed 524 packages. Repeated successfully after updating the root engine constraint in both manifests.                                                                                                                                      |
| `npm run lint && npm run format:check && npm run typecheck`                                                                                 | PASS    | ESLint reports no problems, Prettier reports all matched files formatted, strict TypeScript exits 0. Local ignored working notes initially caused formatting failures; they are now excluded from formatting.                                                                                                       |
| `npm run test:coverage`                                                                                                                     | PASS    | 199 tests in 20 files. Statements 94.93%, branches 88.27%, functions 94.28%, lines 96.4%. Assertions and property-test counts are unchanged.                                                                                                                                                                        |
| `npm run build`                                                                                                                             | PASS    | Main JS 280.61 kB / 88.52 kB gzip; CSS 8.08 kB; Workbox precaches 12 entries / 300.16 KiB.                                                                                                                                                                                                                          |
| `BASE_PATH=/recall/ npm run build`                                                                                                          | PASS    | Main JS 280.65 kB / 88.52 kB gzip; 12 precache entries / 300.23 KiB.                                                                                                                                                                                                                                                |
| Pages fallback command from `deploy.yml`, followed by static Node assertions                                                                | PASS    | `404.html` matches `index.html`; all 5 asset URLs start with `/recall/`; manifest start URL and scope resolve to `/recall/`; bundled worker registration uses `/recall/sw.js` and scope `/recall/`; the relative Workbox navigation fallback resolves to `/recall/index.html`. The test-only update hook is absent. |
| Workflow YAML parsing and trigger assertions using Ruby's standard-library YAML parser                                                      | PASS    | CI jobs: quality/build/e2e; deployment jobs: build/deploy. Deployment runs after a successful CI run on a push to main, or manually; it requires the `PAGES_ENABLED` repository variable. This is syntax/structure checking, not the GitHub Actions schema validator.                                                          |
| `npm exec --offline --cache /private/tmp/recall-npm-cache --package=@action-validator/cli -- action-validator .github/workflows/deploy.yml` | BLOCKED | Validator metadata is not cached (`ENOTCACHED`); registry access is unavailable.                                                                                                                                                                                                                                    |
| Static CSS text-token contrast calculation                                                                                                  | PASS    | Text, muted text, links, status text and chart-axis text against each theme's backgrounds, plus primary-button text: minimum 5.57:1 in light and 6.30:1 in dark. These calculations do not replace browser axe-core scans. The answer reveal retains full opacity throughout its movement.                          |
| `npm run e2e`                                                                                                                               | BLOCKED | Preview server cannot bind `::1:4173` (`listen EPERM`); no application test ran. An independent Chromium launch also fails at `MachPortRendezvousServer` with permission denied. Both theme scans and offline review assertions therefore remain unverified here.                                                   |
| `npm run smoke:base`                                                                                                                        | BLOCKED | The `/recall/` production build succeeds; Chromium launch is denied before the browser checks can run.                                                                                                                                                                                                              |
| `BASE_PATH=recall npm run smoke:base`                                                                                                       | PASS    | Expected rejection: exit 1 with `BASE_PATH must start and end with "/"`.                                                                                                                                                                                                                                            |
| `npm run screenshots`                                                                                                                       | BLOCKED | Production build succeeds; the screenshot preview cannot bind `127.0.0.1:4181` (`listen EPERM`). No PNGs were generated.                                                                                                                                                                                            |
| `npm view @playwright/test version --cache /private/tmp/recall-npm-cache --fetch-retries=0 --fetch-timeout=10000`                           | BLOCKED | `ENOTFOUND`; the offline query also returns `ENOTCACHED`. The latest 1.x version cannot be determined or fetched. Playwright and its core override remain at 1.56.1.                                                                                                                                                |
| GitHub-hosted CI and Pages deployment for these changes                                                                                     | NOT_RUN | No commit, push or deployment was performed. Pages must be enabled with the GitHub Actions source before the next main-branch push.                                                                                                                                                                                 |
| `git diff --check` and tracked-output inspection                                                                                            | PASS    | No whitespace errors; no tracked node_modules, dist, coverage or browser-test output. LICENSE is unchanged.                                                                                                                                                                                                         |

### Defects and changes

- **Offline keyboard race:** the test waited for service-worker control but pressed Space immediately
  after hash navigation, then pressed 3 without observing the revealed answer. Link clicks do not
  wait for React's route render/effects. Every keyboard reveal now waits for the reveal button's
  focus and then for answer focus before grading. The `1 of 12 done` assertion and the offline
  persistence assertion are unchanged. No retries or fixed delays were added; CI retries are disabled.
  This diagnosis follows the event order in the code; runtime confirmation is blocked above.
- **Transient answer contrast:** fading the answer from zero opacity blends its text into the
  background during the reveal. The animation now moves fully opaque text, preserving the existing
  duration and reduced-motion behavior. Axe-core scans wait for observable animation completion
  and report affected nodes if they fail. The specific reported macOS axe failure cannot be
  reproduced in this sandbox; a current full scan is still required.
- **Skipped deployment:** removed the `PAGES_ENABLED` prerequisite and changed the trigger to
  pushes on main, with manual main-branch runs still supported. Existing Vite base-path and
  service-worker configuration already support `/recall/`; deployment adds a Pages `404.html` shell.
  The CI sub-path check now also grades and reloads offline.
- **Toolchain/documentation drift:** replaced the Node 22.6 claim with the locked toolchain's
  supported engine ranges; added the screenshot command, badges, highlights and runnable clone
  instructions; separated historical browser results from this run's blocked checks.

Remaining validation: run `npm run e2e`, `npm run smoke:base` and `npm run screenshots` on an
unrestricted host, update Playwright and its core override together when the registry is reachable,
and verify the next CI/Pages runs. Screenshot links refer to the files those host captures will create.

## Earlier Linux baseline (2026-10-03)

### Test environment

- **Date:** 2026-10-03
- **Environment:** a shared 4-vCPU Linux container (x86_64, shared with other jobs), Node.js 22.22.0,
  npm 10.9.4, TypeScript 5.9.3, Vite 8.3.2, Vitest 5.0.3, Playwright 1.56.1 with its pinned
  Chromium 141.0.7390.37 (pre-installed at `/opt/pw-browsers`, revision 1194).
- **Clean state:** the test run starts with `dist/`, `dist-base/`,
  `coverage/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo` and the whole `node_modules/`
  removed. Dependencies are installed with `npm ci` (lockfile, 526 packages). Commands run
  in order from the project root with
  `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Wall-clock times are from a
  shared machine and are indicative only.
- **Disk-space note:** the shared container's disk fills up while other jobs run. The initial
  `npm run test:coverage` passes all 199 tests but exits 1 with `ENOSPC` while V8 writes its
  temporary coverage files. Commands use `TMPDIR=/dev/shm/recall-tmp`; the successful coverage
  command uses `--coverage.reportsDirectory=/dev/shm/recall-cov` (RAM-backed tmpfs). Coverage totals are unchanged by the output location.

| #   | Command                                                                    | Result  | Key output                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm run lint`                                                             | PASS    | `eslint . --max-warnings 0`: no problems (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, react-hooks); 33.3 s                                                                                                                                                                        |
| 2   | `npm run format:check`                                                     | PASS    | `All matched files use Prettier code style!`                                                                                                                                                                                                                                                          |
| 3   | `npm run typecheck`                                                        | PASS    | `tsc -b --noEmit`: 0 errors (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)                                                                                                                                                                                                        |
| 4a  | `npm run test:coverage`                                                    | FAIL    | All 199 tests pass; exit 1 (`ENOSPC`) while V8 writes temporary coverage files.                                                                                                                                                                                                                       |
| 4b  | `npm run test:coverage -- --coverage.reportsDirectory=/dev/shm/recall-cov` | PASS    | `Test Files 20 passed (20)`, `Tests 199 passed (199)`, 24.0 s; Statements 94.93%, Branches 88.27%, Functions 94.28%, Lines 96.4%; lines 100% in `src/domain`, `src/storage`, `src/router`                                                                                                             |
| 5   | `npm run build`                                                            | PASS    | `dist/assets/index-*.js 280.65 kB │ gzip: 88.54 kB`, CSS 8.10 kB; `PWA v1.3.0 mode generateSW precache 12 entries (300.21 KiB)`; `dist/sw.js` calls `skipWaiting()` only on a `SKIP_WAITING` message (prompt mode); the test-only update hook `simulateAvailable` is absent from the bundle (grep: 0) |
| 6   | `npm run e2e`                                                              | PASS    | `10 passed (34.6s)` against `vite preview` of `dist/` (list below)                                                                                                                                                                                                                                    |
| 7   | `npm run smoke:base` (`scripts/base-path-smoke.ts`)                        | PASS    | builds with the default `BASE_PATH=/recall/` into `dist-base/` and serves it on :4180; all 5 asset URLs in index.html start with `/recall/`; `service worker scope: http://localhost:4180/recall/`; no page errors, failed requests or HTTP errors; `BASE_PATH=recall` (no slashes) is rejected       |
| 8   | `npx @action-validator/cli .github/workflows/ci.yml` (and `deploy.yml`)    | PASS    | both exit 0 against the GitHub Actions workflow schema (an invalid workflow file is rejected)                                                                                                                                                                                                         |
| 9   | PyYAML `yaml.safe_load` on both workflow files (`uv run --with pyyaml`)    | PASS    | `ci.yml jobs: quality, build, e2e`; `deploy.yml jobs: build, deploy`, triggers `workflow_run` (after CI) and `workflow_dispatch`; `build.if` requires `vars.PAGES_ENABLED == 'true'` for both triggers                                                                                                |
| 10  | GitHub Actions CI and GitHub Pages deployment on github.com                | NOT_RUN | Not exercised in this local baseline. Later CI runs reported offline failures and skipped deployment; this baseline does not establish deployment success.                                                                                                                                            |
| 11  | `npx playwright install --with-deps chromium` (CI step)                    | NOT_RUN | The test environment uses pre-installed Chromium matching Playwright 1.56.1; the CI browser-install step is not run.                                                                                                                                                                                  |

## Test inventory

Vitest (199 tests in 20 files):

- `src/domain/sm2.test.ts`: SM-2 examples (1 → 6 → n×EF progression, ease formula for each grade, lapse
  handling, no extra ease penalty for same-day repeats of a failed card, cap, immutability) and 7
  fast-check properties (ease ≥ 1.3, successful review never shortens the interval, strictly growing
  intervals on runs of passes, Again resets, due = day + interval, lapses only on Again, better grade
  ≥ worse grade interval). fast-check default: 100 generated cases per property.
- `src/domain/{session,stats,days}.test.ts` (including a drop after a failed card keeping
  answered ≤ total), `src/router/routes.test.ts` (including malformed escapes
  such as `#/deck/%`), `src/components/chartScale.test.ts` (whole-number midline for 0–5000): pure logic.
- `src/io/{markdown,csv,backup,markdownFixture}.test.ts`: importers, exporters and backup validation,
  including CSV and Markdown export → import round-trip properties (Markdown: 500 runs over headings,
  fences, backslashes and multi-line questions), the CSV formula-injection guard, bare `###` and
  indented headings, the skipped-card count, backup rules (editor validation, interval cap, review
  deck matches card deck), an unclosed code fence reported on its opening line with the swallowing
  card skipped, and a check that a sample Markdown deck imports with no errors.
- `src/storage/repository.contract.test.ts`: one contract run against `MemoryRepository`,
  `IndexedDbRepository` (on fake-indexeddb) and `deferredRepository`: read-modify-write
  `recordReview`/`updateCard` from the stored card, missing-card and throwing-callback cases write
  nothing, `saveCards` into a deleted deck rejected with nothing written, atomic deck + cards + flag
  insert, cascades, plus persistence across connections.
- `src/state/store.test.tsx`: two `StoreProvider`s on one repository (two tabs): a stale tab's edit
  keeps the other tab's review; a stale tab's grade starts from the stored schedule; a second grade
  of a card already passed today is refused (`StaleReviewError`, nothing written, no banner); the
  change feed refreshes the other tab; a failed new-deck import leaves no empty deck.
  `src/state/appReducer.test.ts`: reducer upserts and cascades.
- `src/state/useToday.test.ts` (fake timers across two midnights; `visibilitychange`, `focus` and
  `refresh()` re-read the clock) and `src/components/DayRollover.test.tsx` (the app with a movable
  clock from 23:50 to 08:00: the home page, navigation to the review screen and the open "nothing
  due" screen all show the card that fell due; the summary offers "Review 2 more due cards"). These
  three app tests also fail with a render-only `today` calculation.
- `src/components/DeckView.test.tsx`: rename (empty name refused inline, failed save keeps the form
  open), CSV and Markdown export parsed back to the same cards, import into an existing deck, and a
  failed delete reported without leaving the page. `src/components/UpdateBanner.test.tsx`: the
  "Reload to update" flow through `registerServiceWorker` with `virtual:pwa-register` mocked.
- `src/components/ReviewSession.test.tsx` (including two review screens on one repository: a card
  graded in one leaves the other's queue, with and without a change notification),
  `src/components/App.test.tsx`, `src/components/ErrorBoundary.test.tsx`: React Testing Library with
  user-event keyboard input:
  Space/1–4 flow, Enter on a nav link during a review and on "Done" after it navigates, focus targets,
  live-region text, Again re-queue, CRUD with validation messages, Markdown and CSV import with
  line-numbered problems, stats tiles, backup restore (valid and invalid), malformed URL, error
  boundary, persistent-storage status and request.

Playwright (10 tests, production build via `vite preview`):

```
✓ first open shows the sample decks
✓ import a Markdown deck, review it with the keyboard, reload and keep progress
✓ keyboard users can leave the review screen with Enter, during and after a session
✓ works offline after the first load (service worker)        (grades offline, then reloads offline)
✓ a second tab picks up reviews made in another tab (BroadcastChannel)
✓ download a JSON backup
✓ reveal animation honours prefers-reduced-motion: no-preference   (0.18 s)
✓ reveal animation honours prefers-reduced-motion: reduce          (< 1 ms)
✓ has no detectable WCAG 2.2 AA violations (light theme)
✓ has no detectable WCAG 2.2 AA violations (dark theme)
```

The axe-core scans use tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` on seven screens (decks,
deck detail, review with answer revealed, statistics, backup, import preview with a problem list,
session summary) and assert zero violations.

## Bugs found by testing and fixed

- **CSV header detection:** one-letter `q`/`a` aliases treated a headerless `Q,A` row as a
  header and lost the first card. Header aliases are limited to `front`/`back`/`question`/`answer`;
  `src/io/csv.test.ts` and the component import test cover headerless input.
- **Review focus:** the app-level heading effect stole focus from "Show answer" after navigation.
  The effect leaves focus alone when the page has placed it; the Playwright review test covers this.
- **Markdown closing hashes:** `### What is C#` lost its trailing `#`. The parser strips only a
  closing sequence preceded by whitespace (CommonMark); `src/io/markdown.test.ts` covers both cases.
- **Keyboard navigation:** intercepting every Enter/Space while an answer was hidden prevented
  navigation through focused links, including "Done". Shortcuts ignore interactive elements and
  stop listening after the session. `src/components/ReviewSession.test.tsx` covers navigation during
  and after review; the two regression tests fail with the fix reverted.
- **Malformed routes:** `#/deck/%` threw `URIError` and blanked the app. Route parsing returns
  "Page not found", and a per-page error boundary handles rendering failures;
  `src/router/routes.test.ts` and the component tests cover these cases.
- **Lost cross-tab reviews:** rebuilding a card from a stale tab's copy overwrote another tab's
  review. Grades and edits use read-modify-write inside the IndexedDB transaction, and
  `BroadcastChannel` refreshes other tabs. Repository contracts, two-provider component tests and
  the two-page Playwright test cover this behavior.
- **Update reloads:** `autoUpdate` force-reloaded open tabs when a new version activated.
  Prompt mode waits for "Reload to update"; `src/components/UpdateBanner.test.tsx` covers the
  registration and banner with the Workbox module mocked. Two-version end-to-end testing is NOT_RUN.
- **Markdown export and empty headings:** answer headings such as `## Notes` and multi-line
  questions lost cards on re-import, and bare `###` became part of the previous answer.
  Export escapes heading-like answer lines and joins multi-line questions; the parser reports
  empty questions. `src/io/markdown.test.ts` covers these cases and export/import properties.
- **CSV formula injection:** exported cells beginning with `=`/`+`/`-`/`@` were unguarded.
  Export prefixes them with `'`; `src/io/csv.test.ts` covers the guard and round-trip behavior.
- **Same-day ease penalties:** repeated failures reduced the ease factor on every answer.
  Same-day repeats of a failed card leave EF unchanged; `src/domain/sm2.test.ts` covers this rule.
- **Partial deck creation:** new-deck imports and sample seeding were not atomic. Decks, cards and
  the seed flag are written together; repository contracts cover the combined operation, and
  `src/state/store.test.tsx` checks that a failed import leaves no empty deck.
- **Invalid backup restore:** empty cards, intervals above the cap and reviews filed under another
  deck were accepted. Backup validation applies editor rules, the interval cap and matching deck
  references; `src/io/backup.test.ts` covers each case.
- **Day rollover:** computing `today` only on provider renders hid newly due cards after midnight
  and could make grade hints disagree with saved intervals. `useToday` stores the day in state,
  with a midnight timer and refreshes on `visibilitychange`, `focus`, `hashchange` and each grade.
  `src/state/useToday.test.ts` and `src/components/DayRollover.test.tsx` cover clock changes.
- **Duplicate cross-tab grading:** a card graded in another tab stayed queued and could grow its
  interval twice with a duplicate log. The review screen drops cards no longer reviewable;
  `gradeCard` checks `isReviewable` inside the transaction and raises `StaleReviewError`.
  `src/state/store.test.tsx` and `src/components/ReviewSession.test.tsx` cover rejection and queue
  removal, including a missed change notification.
- **Unclosed Markdown fences:** the error pointed at the last line, and the card swallowing later
  questions was imported. The parser reports the opening line and skips that card;
  `src/io/markdown.test.ts` covers both behaviors.
- **Session counts:** dropping a failed, re-queued card left it in `answered`, which could exceed
  the remaining total. The drop action adjusts both counts; `src/domain/session.test.ts` covers it.
- **Orphan cards:** `saveCards` accepted cards for a deck deleted in another tab, creating a backup
  that `parseBackup` rejects. It checks the deck inside the transaction; repository contracts
  require rejection without writing any cards.
- **Deck operation errors:** rename and delete failures became unhandled promise rejections.
  Rename failures stay inline with the form open; delete failures appear in the error banner
  without navigating away. `src/components/DeckView.test.tsx` covers both.

## Configuration and data checks

- SM-2 same-day rules are documented as this app's interpretation in
  [DESIGN.md](DESIGN.md#sm-2-deviations).
- Use Node.js 22.20+ (22.x), 24.12+ (24.x) or 26+ to satisfy the locked toolchain's engine requirements;
  helper scripts use `--experimental-strip-types`.
- The smoke test defaults to `/recall/` and accepts `BASE_PATH`; current deployment runs on pushes to `main` and manual runs on `main`, without a repository-variable gate.
- The dynamic-array sample card distinguishes growth factors (×2 as an example, about ×1.5 for
  Java's ArrayList).
- `restart` and `isDue` have callers and tests; the `simulateAvailable` test hook is absent
  from the production bundle.

## Checks not run

| Check                                                             | Result  | Reason / available coverage                                                                                                         |
| ----------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Firefox and Safari behavior, including persistent-storage prompts | NOT_RUN | Only Chromium is run.                                                                                                               |
| "Reload to update" end to end                                     | NOT_RUN | A component test drives the registration code with the Workbox module mocked; a real test needs two deployments served in sequence. |
| Day rollover in a real browser                                    | NOT_RUN | Component tests use an injected clock and fake timers; Playwright does not cover rollover.                                          |
| Manual screen-reader testing (NVDA, VoiceOver)                    | NOT_RUN | Accessibility coverage consists of axe-core scans and keyboard tests.                                                               |
| Mobile installability prompts                                     | NOT_RUN | No mobile-device checks are recorded.                                                                                               |

## Host re-run (2026-10-03, macOS, Node 26.10.0, Playwright 1.56.1 Chromium)

| Check | Result | Evidence |
|---|---|---|
| `CI=true npx playwright test --project=chromium` (production build, retries 0) | PASS | 10 passed (7.8 s), including "works offline after the first load" and both WCAG 2.2 AA scans; before these fixes 8/10 passed on macOS and the offline test failed on Linux CI. |
| `npm run screenshots` | PASS | Wrote `docs/screenshot-light.png` and `docs/screenshot-dark.png` (1280x800). |
