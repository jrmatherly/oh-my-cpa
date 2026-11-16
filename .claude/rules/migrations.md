---
paths:
  - "migrations/**"
---

# SQLite migrations (migrations/)

- Forward-only. A tracked migration file is applied somewhere and is never edited; add the next `NNN_snake_case.sql` instead. The PreToolUse hook enforces this.
- The schema version is the highest file number (`BackupSchemaVersion` in `internal/repository/database_backup.go`). Numbers are zero-padded to three digits because files are applied in file-name order; gaps are fine and upstream's sequence already has some.
- Audit logs and price versions are append-only tables; a migration may add to them but never rewrites or deletes rows.
- Check with `go test -short ./internal/repository/...`, which opens a fresh database through the full migration chain.

## A fork migration

The fork has added none; upstream owns every file through 066. No numbering is safe as the engine stands, so before adding the first, stop and settle it with the owner. What the code does:

- **`Migrate` applies by set, not by height** (`internal/repository/db.go`). A file runs when its number is missing from `schema_migrations`, whatever higher numbers are already there. An upstream migration that arrives after a fork one still runs on an upgraded install.
- **Two files with one number stop the console at start-up** (`duplicate migration version`). A fork file at upstream's next number breaks on the merge that brings upstream's own file with that number. It fails loudly, in `go test` too.
- **Renumbering never settles that collision.** Renumber the fork's file and installed consoles, which recorded the number as applied, skip upstream's file and run the fork's a second time. Renumber upstream's file and it has to be done for every later upstream migration, and a Go hook keyed to its number (`migrationHook`) is detached.
- **A reserved range (900 to 999) avoids the collision and breaks restore.** A backup's version is its highest applied number, and `ValidateDatabaseBackup` requires every shipped file at or below it (`internal/repository/database_backup.go`). A backup taken with 900 applied is refused once the build also ships upstream's 067: `missing required version 067`. In the other direction, `ErrBackupSchemaNewer` can no longer tell that a backup carries an upstream migration this build lacks. So the range is usable only together with a change to that validation, which is upstream's code.
- **Order differs by history under any scheme.** A fresh install runs files in name order; an upgraded install runs a later upstream file after the fork's. A fork migration must not depend on an upstream migration numbered after 066.
- **Adding a column to an upstream table is fragile.** Upstream rebuilds tables with an explicit column list (`..._next` then `RENAME TO`, as in 028, 036 and 046), which silently drops a column the fork added. A sync that brings a rebuild of a table the fork touched is ADAPT.
- **A new table has its own cost.** `TestEveryTableDeclaresItsLifecycle` and `TestEveryTableIsClassifiedForOperatorQueries` fail until the table is listed in `internal/repository/lifecycle.go` and `internal/repository/readonly_query.go`, both upstream files, so each fork table adds merge surface.
- **Seed rows need care.** The fresh-database snapshot (`buildFreshBootstrapSQL`) replays schema plus two hard-coded seed rows, so rows a fork migration inserts are missing from later fresh test databases in the same process.
- **The edit hook's hint is wrong for a split range.** When it refuses an edit to a tracked migration, `.claude/hooks/protect-paths.sh` suggests the highest number plus one, which would be 901 for an upstream-sequence file once a 900 file exists.

The cheapest path that avoids all of this is to keep fork state out of the schema: a setting, a row in the existing key-value table `ui_preferences`, or a file under the data directory. A file is not in the `.omcbackup` snapshot, which holds the database only, so use one only for state that may be lost or rebuilt on restore.
