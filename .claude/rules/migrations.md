---
paths:
  - "migrations/**"
---

# SQLite migrations (migrations/)

- Forward-only. A tracked migration file is applied somewhere and is never edited; add the next `NNN_snake_case.sql` instead. The PreToolUse hook enforces this.
- The schema version is derived from the highest file number (`internal/repository/database_backup.go`), so numbering must stay contiguous and zero-padded to three digits.
- Audit logs and price versions are append-only tables; a migration may add to them but never rewrites or deletes rows.
- Check with `go test -short ./internal/repository/...`, which opens a fresh database through the full migration chain.
