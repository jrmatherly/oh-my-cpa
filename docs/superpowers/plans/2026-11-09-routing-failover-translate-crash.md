# Routing Failover Translate Crash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening the Routing page's Failover disclosure never crashes the console, even in a browser whose translator has rewritten the page's text nodes, and the document declares the reader's own language before React mounts.

**Architecture:** Two independent changes in `web/`. The toggle in `PolicyStrip` stops placing a bare text node directly after a conditionally rendered icon, so React's `insertBefore` always has an element it owns as its reference. The entry document gains a boot script, beside the existing theme boot, that reads the stored language preference and sets `document.documentElement.lang` while the HTML parses, so Chrome's translate detection sees the right language instead of the shipped `zh-CN` default.

**Tech Stack:** React 18.3, Ant Design 6, Vitest (`components` project, jsdom), Vite entry `web/index.html`.

**Spec:** The Findings section below. There is no separate design document; this plan argues from the reproduction recorded there.

## Findings

Reported on the deployed console (upstream image v0.3.24, English reading language): clicking **Failover** under Routing replaces the page with "This page couldn't load", error type `NotFoundError`, message `Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.`

Evidence gathered on 2026-11-09:

- `web/src/pages/routing/PolicyStrip.tsx:104-116` renders the toggle as `{isFailoverOpen ? <DownOutlined /> : <RightOutlined />}{t('orch.failover')}<span …>`. Opening swaps the icon element, which React commits as `removeChild(oldIcon)` then `insertBefore(newIcon, textNode)`.
- Chrome Translate (and similar extensions) replace each text node with a `<font>` element holding the translation. React keeps its reference to the original text node, which is no longer a child of the button, so `insertBefore` throws. This is the documented failure mode of browser translation against React trees.
- Reproduced in jsdom: rendering `RoutingPage`, wrapping the "Failover" text node in `<font>`, and clicking the toggle throws `NotFoundError: The child can not be found in the parent` (jsdom's wording of the same DOM exception) and the router's error element renders.
- Reproduced on upstream's public demo `https://omc-demo.junze.dev/routing` (built SPA, current release): the same DOM mutation plus one click produced the identical error page (the Chinese "This page couldn't load" heading, `NotFoundError`, `Failed to execute 'insertBefore'`). The bug exists at upstream's tip, not only in v0.3.24.
- Wrapping the label in `<span>` makes the jsdom repro pass; stashing that change makes it fail again.
- Why the translator ran at all (inferred, not measured): `web/index.html` ships `<html lang="zh-CN">` (the deployed console serves the same), `DEFAULT_LANG` is `zh`, and the app only writes the reader's language to `document.documentElement.lang` in a `useEffect` after mount (`web/src/i18n/index.tsx:167`). A browser reading an English console labelled Chinese is invited to translate it. The reporter's screenshot shows Chrome's translate icon active in the address bar.
- A scan of `web/src` for the same "conditional icon followed by bare text" shape found one more, the dashboard's provider list toggle in `web/src/components/dashboard/DashboardProviders.tsx`, which gets the same `<span>` wrap (no separate test; the mechanism is the one the routing test pins).
- The console's Content-Security-Policy (`internal/api/handler.go:1114`) is report-only and allows `'unsafe-inline'` scripts, so a second inline boot script in `index.html` needs no hash or nonce.
- The reporter's cluster runs upstream's published image, and this fork publishes no builds yet. A fix reaches that console either through an upstream release or through the fork's first build, so Task 3 opens the upstream PR as well as the fork's.

## Global Constraints

- User-visible copy stays in the four locale catalogs; neither task adds copy.
- Tier 2 jsdom tests exercise stateful interaction only (AGENTS.md testing governance); the boot script is held by a Tier 1 logic test, the toggle by the existing routing component test file.
- No new dependency, config knob or abstraction. No `translate="no"` on the document: translation is a reader's right, the console must survive it.
- Prove the regression test fails without the fix before the fix lands (`docs/testing.md`, "Deterministic assertions"). The j-mode Bug fix playbook (step 5) additionally lands the failing test as its own commit ahead of the fix, so git history shows the reproduction. Trade-off accepted: that one commit is red for `git bisect run`, so bisect on `main` should treat it with `git bisect skip`.

## Review Focus

- A translator that also rewrites the hint text (`{rounds} retry rounds`) inside the trailing `<span>`: React updates that text node in place when `request_retry` changes, which cannot throw, so the translated hint goes stale until the next full render. That is the translator's own behaviour on every site and is not a crash; no test is added for it.
- Other disclosures built on `Fold` (`EditorSection`, `ProviderEditorDrawer`, `Locations`, `Schedule`): the scan found no bare text after a conditional element, but a reviewer should eyeball each toggle's JSX once.
- A stored language id that is no longer registered (`omc-lang` holding junk): the boot script must leave `lang` untouched rather than write an invalid tag. Covered by Task 2's test.
- `localStorage` that throws (private mode, blocked storage): the boot script must swallow it the way the theme boot does. Covered by Task 2's test.
- The language picked by the boot script and the one React later applies must agree, or a page flips language tags mid-load. Task 2's test holds the script's mapping to `LANGUAGES`.

---

### Task 1: Keep the Failover toggle's label inside an element React owns

**Files:**
- Modify: `web/src/pages/routing/PolicyStrip.tsx:111-112`
- Test: `web/tests/routing-page.component.test.tsx` (append)

**Interfaces:**
- Consumes: `renderRoutingPage`, `installOmcApi`, `board` already defined in the test file.
- Produces: nothing used by Task 2.

Both the test and the fix exist uncommitted in the working tree as of 2026-11-09; the steps below commit them in the required order.

- [ ] **Step 1: Confirm the failing test is present**

The test file ends with:

```tsx
it('opens the failover disclosure after a translator rewrote the toggle text', async () => {
  const api = installOmcApi();
  api.on('GET', '/management/routing', () => board);
  renderRoutingPage();

  const toggle = await screen.findByRole('button', { name: /Failover/ });
  // Chrome Translate replaces each text node with a <font> that holds the translation, while React
  // still refers to the original node when it swaps the chevron icon in front of it.
  const walker = document.createTreeWalker(toggle, NodeFilter.SHOW_TEXT);
  let text: Node | null = null;
  while (walker.nextNode()) if (walker.currentNode.textContent === 'Failover') text = walker.currentNode;
  expect(text).toBeTruthy();
  const font = document.createElement('font');
  text!.parentNode!.replaceChild(font, text!);
  font.appendChild(text!);

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(await screen.findByLabelText('Request Retries')).toBeTruthy();
});
```

- [ ] **Step 2: Run it against the unfixed component and verify it fails**

Run: `git stash push web/src/pages/routing/PolicyStrip.tsx && pnpm exec vitest run --config web/vitest.config.ts web/tests/routing-page.component.test.tsx -t translator; git stash pop`
Expected: FAIL, stderr shows `NotFoundError: The child can not be found in the parent`.

- [ ] **Step 3: Commit the failing test**

```bash
git add web/tests/routing-page.component.test.tsx
git commit -m "test(routing): reproduce the failover toggle crash under a page translator"
```

- [ ] **Step 4: Confirm the fix in `PolicyStrip.tsx`**

Line 112 reads `<span>{t('orch.failover')}</span>` instead of the bare `{t('orch.failover')}`. No other change.

- [ ] **Step 5: Run the routing component tests and verify they pass**

Run: `pnpm exec vitest run --config web/vitest.config.ts web/tests/routing-page.component.test.tsx`
Expected: 5 passed.

- [ ] **Step 6: Run the gates the changed files reach**

Run: `.claude/skills/verify-change/scripts/pick-checks.sh HEAD~1 --run`
Expected: every command it prints exits 0. The set includes `type-check`, `test:logic`, `test:components`, `check-css-modules`, `check:feedback` and `lint:antd` for the two web files, and `check-docs` while this plan is untracked.

- [ ] **Step 7: Commit the fix**

```bash
git add web/src/pages/routing/PolicyStrip.tsx
git commit -m "fix(routing): keep the failover label inside an element React owns"
```

### Task 2: Declare the reader's language before the bundle mounts

**Files:**
- Modify: `web/index.html` (add `<script id="omc-lang-boot">` beside `omc-theme-boot`)
- Test: `web/tests/logic/theme-boot.test.ts` (append; the file already holds the document's boot scripts to their modules)

**Interfaces:**
- Consumes: `LANGUAGES` from `web/src/i18n/language.ts`; the storage key `'omc-lang'`, until this change the module-private `LANG_KEY` in `web/src/i18n/index.tsx`. It moves to `language.ts` as `export const LANG_KEY = 'omc-lang'`, the module whose header already names the HTML `lang` attribute among its non-React readers, and `index.tsx` imports it. A Node logic test then holds the script to it without importing the React provider.
- Produces: `document.documentElement.lang` set to the stored language's `locale` before any stylesheet or bundle loads, or left as the shipped `zh-CN` when nothing valid is stored.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/logic/theme-boot.test.ts`, mirroring `bootScript()` for the id `omc-lang-boot` and a runner shaped like `groundedMode`: `new Function('window', 'document', langBootScript())(window, { documentElement })` with a fake `localStorage.getItem` that asserts the key is `LANG_KEY` and a `documentElement` object whose `lang` starts as `'zh-CN'`:

```ts
test('the lang boot sets the document language from the stored preference', () => {
  for (const language of LANGUAGES) {
    assert.equal(bootedLang(language.id), language.locale);
  }
});

test('the lang boot leaves the shipped language alone for an unknown or unreadable preference', () => {
  assert.equal(bootedLang(null), 'zh-CN');
  assert.equal(bootedLang('klingon'), 'zh-CN');
  // An inherited object key must not read as a language: a plain `map[stored]` would answer with a function.
  assert.equal(bootedLang('toString'), 'zh-CN');
  assert.equal(bootedLang('en', { storageThrows: true }), 'zh-CN');
});

test('the lang boot reads the same storage key the i18n provider writes', () => {
  assert.match(langBootScript(), new RegExp(`getItem\\('${LANG_KEY}'\\)`));
});
```

`bootedLang(stored: string | null, options?: { storageThrows?: boolean }): string` runs the script against a `documentElement` whose `lang` starts as `'zh-CN'` and returns its `lang` afterwards.

- [ ] **Step 2: Run them and verify they fail**

Run: `pnpm exec vitest run --config web/vitest.config.ts web/tests/logic/theme-boot.test.ts`
Expected: the first two tests FAIL with `index.html carries no omc-lang-boot script`; the third FAILS because the imported `LANG_KEY` is `undefined` under Vitest (a missing named export does not throw there) and the regex `getItem('undefined')` matches nothing. The existing theme tests still pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add web/tests/logic/theme-boot.test.ts
git commit -m "test(web): hold the entry document to a language boot"
```

- [ ] **Step 4: Move `LANG_KEY` to `web/src/i18n/language.ts`**

Add `export const LANG_KEY = 'omc-lang';` to `language.ts` beside `DEFAULT_LANG`, delete the private constant at `index.tsx:74`, and import it there. No behaviour change; `pnpm type-check` proves the move.

- [ ] **Step 5: Add the boot script to `web/index.html`**

Immediately after the `omc-theme-boot` script, a `<script id="omc-lang-boot">` that reads `window.localStorage.getItem('omc-lang')` inside `try`, maps the id through a literal `{ zh: 'zh-CN', 'zh-Hant': 'zh-HK', en: 'en', ms: 'ms-MY' }` (the four `locale` values of `LANGUAGES`; the test holds the literal to the registry), and sets `document.documentElement.lang` only when `Object.prototype.hasOwnProperty.call(map, stored)` is true (never `in` or a bare index, which would accept `toString`). A comment of one or two sentences says why: the document ships Chinese, a reader's own language is applied by the bundle after mount, and the browser's translate detection has already run by then.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm exec vitest run --config web/vitest.config.ts web/tests/logic/theme-boot.test.ts`
Expected: all tests in the file pass, including the existing theme tests.

- [ ] **Step 7: Run the gates the changed files reach**

Run: `.claude/skills/verify-change/scripts/pick-checks.sh HEAD~1 --run`
Expected: every command it prints exits 0. The i18n source edit selects `type-check`, `test:logic`, `check-css-modules`, `check:feedback`, `lint:antd` and `check-i18n`; the untracked plan adds `check-docs`.

- [ ] **Step 8: Verify on the built artifact**

Run: `pnpm build && pnpm verify:browser:smoke` (the smoke compiles the Go binary but embeds whatever `pnpm build` last wrote to `internal/web/dist`; an empty dist serves the "built without the console" placeholder)
Expected: smoke passes. Then open the built console in Chrome with English stored as the reading language. React's `useEffect` also writes `lang="en"` after mount, so the Elements panel alone cannot tell the two apart: in DevTools Network, add a request-blocking pattern for `*/assets/*.js`, reload, and read `<html lang>` while the bundle is blocked. It must already be `en`. Remove the block, reload, and confirm Chrome offers no translation of the page. This step is the only evidence for the inferred trigger in Findings; if Chrome still offers translation, record that in the PR and keep the task anyway, since a document that names the wrong language is wrong for screen readers too.

- [ ] **Step 9: Commit**

```bash
git add web/index.html web/src/i18n/index.tsx web/src/i18n/language.ts
git commit -m "fix(web): declare the stored reading language before the bundle mounts"
```

### Task 3: Record the deviations and open the PRs

**Files:**
- Modify: `.claude/skills/upstream-review/SKILL.md` (Deviations decided table)

- [ ] **Step 0: Open the Task 1 fix upstream (deferred; needs Jason's go, an upstream PR is outward-facing)**

From a branch cut at `upstream/main` carrying only Task 1's two commits, open a PR to `WizisCool/oh-my-cpa` with the demo reproduction from Findings (the JavaScript that wraps the label's text node in `<font>` and clicks the toggle) as the "how to reproduce". Upstream's release is the route to the reporter's cluster today; when it merges, the fork's next upstream review tags Task 1 `[picked]` and the deviation row can go. Task 2 stays fork-only until the inferred trigger is confirmed in Task 2 Step 8.

- [ ] **Step 1: Add two rows to the deviations table**

One for `PolicyStrip.tsx` (ours wraps the label in `<span>`; an upstream hunk elsewhere in the file is ADOPT, one rewriting the toggle is ADAPT, pinned by the routing component test) and one for `web/index.html` (ours adds `omc-lang-boot`; upstream hunks to the theme boot are ADOPT, pinned by `theme-boot.test.ts`).

- [ ] **Step 2: Run the docs check, commit, and open the PR against `jrmatherly/oh-my-cpa` main**

Run: `pnpm check-docs`
Expected: `0 Errors`.

```bash
git add .claude/skills/upstream-review/SKILL.md
git commit -m "docs(agents): record the routing toggle and language boot deviations"
```

The PR's `## Why` opens with the reporter's goal: the Routing page's Failover disclosure must open without crashing the console. It links the two reproductions from Findings. Consider offering the Task 1 change upstream as well, since it reproduces on upstream's demo.
