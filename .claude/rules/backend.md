---
paths:
  - "internal/**/*.go"
  - "cmd/**/*.go"
---

# Editing the Go backend

- A business mutation lives once in `internal/operations/` and is called from both the HTTP handler (`internal/api/`) and the capability registry (`internal/capability/`); do not add validation or write gates in a handler.
- DTOs in `internal/api/` are handwritten projections. Before adding a field, check it is not a raw key, OAuth token or auth file (docs/architecture.md, "Security boundaries").
- CPA configuration writes go through `internal/cpa` with revision checks and a pre-write backup; never write the YAML directly.
- Tests sit beside the package as `*_test.go`. Fresh SQLite databases come from the cached bootstrap snapshot; do not seed demo fixtures outside `internal/demo`. Golden files regenerate with `UPDATE_GOLDEN=1 go test ./<pkg>`.
- Checks: `gofmt -l`, `go test -short ./<pkg>/...`, then `golangci-lint run ./<pkg>/...` (config in `.golangci.yml`; CI runs both).
