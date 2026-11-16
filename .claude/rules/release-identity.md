---
paths:
  - ".github/workflows/release.yml"
  - "Dockerfile"
  - "deploy/compose.*.yml"
  - "internal/updater/**"
  - "internal/release/**"
  - "internal/config/config.go"
  - "internal/demo/release.go"
  - "scripts/deployment.test.mjs"
  - "scripts/release-*.mjs"
  - "scripts/native-release*.mjs"
  - "scripts/sign-release-manifest*.mjs"
---

# Release identity

This fork publishes its own builds, decoupled from upstream (owner's decision, 2026-11-16). These files carry the fork's release identity: the image `ghcr.io/jrmatherly/oh-my-cpa`, the fork's embedded Ed25519 release public key, the repository `jrmatherly/oh-my-cpa` that the updater and release scripts resolve, and the fork's own version line. Each is a deviation recorded in `.claude/skills/upstream-review/SKILL.md` under "Release identity" and conflicts on purpose at an upstream merge: take upstream's logic, keep the fork's identity. Never restore `wiziscool/oh-my-cpa`, `WizisCool/oh-my-cpa`, a Docker Hub login or upstream's public key. Change identity values together, in one deliberate change, never one file at a time.
