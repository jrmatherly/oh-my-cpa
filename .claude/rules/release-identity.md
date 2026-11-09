---
paths:
  - ".github/workflows/release.yml"
  - "Dockerfile"
  - "deploy/compose.*.yml"
  - "internal/updater/**"
  - "internal/release/**"
  - "scripts/release-*.mjs"
  - "scripts/native-release*.mjs"
  - "scripts/sign-release-manifest*.mjs"
---

# Release identity

This fork will publish its own builds. These files carry upstream's release identity: the Docker Hub owner `wiziscool`, the embedded Ed25519 release public key, the GitHub repository the updater and release scripts resolve, and the signed-manifest layout. Today they still hold upstream's values and sync as ADOPT; once the fork publishes a build they become deviations recorded in `.claude/skills/upstream-review/SKILL.md` and conflict on purpose at every upstream merge. Change them together, in one deliberate release-identity change, never one file at a time.
