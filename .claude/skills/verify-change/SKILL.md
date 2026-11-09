---
name: verify-change
description: Choose and run the verification checks that cover the files changed in this repo, following the test pyramid in docs/testing.md. Use before declaring any code change in oh-my-cpa complete, when asked to "verify", "run the checks", "what tests should I run", or after editing Go, web/src, migrations, scripts or docs.
argument-hint: "[base-ref] [--run]"
---

# Verify a change

Run the lowest layer that can detect the real failure, and only the layers the changed files reach. `pnpm verify:full` exists for releases, not for every edit.

```
!`.claude/skills/verify-change/scripts/pick-checks.sh $ARGUMENTS`
```

The script lists the commands that cover the diff against the base ref (default `HEAD`, including untracked files). With `--run` it executes them in order and reports each failure.

How the mapping follows docs/testing.md:

| Changed | Checks |
| --- | --- |
| `*.go` | `gofmt -l`, `go test -short` on the touched packages, `golangci-lint run` on them |
| `migrations/` | repository tests, which open a fresh database through the whole chain |
| `web/src`, `web/tests` | `type-check`, `test:logic`; `test:components` for components; `check-css-modules`, `check:feedback`, `lint:antd` for TSX; `check-i18n` for catalogs |
| `scripts/` | `type-check:tooling`, `test:self` |
| `*.md` | `check-docs` |
| `internal/api`, `internal/demo` | `check:demo` (the Cloudflare demo dataset is generated from these handlers) |

After the listed checks pass, state which ran. If a check could not run, say which and why rather than substituting a dev-server pass. A browser run (`pnpm verify:browser:smoke`) is warranted only when the embedded SPA, auth flow, or Go/SPA integration changed.
