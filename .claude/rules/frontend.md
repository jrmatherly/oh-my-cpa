---
paths:
  - "web/src/**"
---

# Editing the console (web/src)

- Reuse a shared primitive from `web/src/components/common/` or `components/feedback/` before writing a page-local control; `ls` those directories first.
- Action outcomes are toasts through `useToast`; region conditions (failed read, stale data, disabled feature) are inline through `Notice` or `LoadFailure`. `pnpm check:feedback` refuses raw Ant Design message/notification/Modal.* outside `components/feedback/`.
- CSS module classes are kebab-case and read as `styles['class-name']`; `pnpm check-css-modules` fails on a class the module does not export, which `tsc` cannot catch.
- User-visible copy goes in all four catalogs under `web/src/i18n/locales/`, never inline.
- Finishing a UI change: light and dark mode, narrow viewport, keyboard flow, loading/error/empty states (docs/design.md, "Finishing a UI change").
- Checks: `pnpm type-check`, `pnpm exec vitest run --config web/vitest.config.ts <file>`, then the three gates above. Logic goes in `web/tests/logic/*.test.ts`; jsdom only for stateful interaction (docs/testing.md).
