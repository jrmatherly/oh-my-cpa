---
paths:
  - "docs/**/*.md"
  - "/*.md"
---

# Documentation

- `CLAUDE.md` is a symlink; edit `AGENTS.md`. Technical prose is English; only `README.zh-CN.md` is Chinese.
- Docs explain boundaries, rationale and operator procedure. Field lists, defaults, schemas and token values belong in code; migration numbers, function names and change logs do not belong in docs.
- Update the one guide a change makes wrong rather than adding a new document.
- `pnpm check-docs` validates links and heading fragments (offline, cached lychee).
