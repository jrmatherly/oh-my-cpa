---
name: release
description: Cut a release of this fork (jrmatherly/oh-my-cpa) end to end, from choosing the version and writing the release note, through the preparation pull request, the signed tag and the release workflow, to verifying the published image, manifest and assets. Use for "release", "cut a release", "ship the next version", "publish v1.x", "tag a release", "bump the version", "is the release out", "verify the release" or "why did the release run fail", and whenever work on main is ready to reach installed consoles.
argument-hint: "[version, for example 1.0.1 | status | verify <tag>]"
---

# Release

A release here is a pushed `vMAJOR.MINOR.PATCH` tag on `main`. The tag starts `.github/workflows/release.yml`, which verifies the source, publishes the image to `ghcr.io/jrmatherly/oh-my-cpa`, signs `release-manifest.json` with the fork's Ed25519 key and attaches the native packages. Installed consoles then see the version through GitHub's release feed and update by digest once the signature verifies.

[`docs/dev/releasing.md`](../../../docs/dev/releasing.md) owns the invariants and the recovery rules. Read it before the first release of a session and whenever a release run fails. This skill is the order of work and the checks that prove each step.

The helper is `.claude/skills/release/scripts/release.sh`. It reads and checks; only `bump` edits files, and it never commits, tags or pushes.

## What cannot be undone

A pushed tag and a published image are public and stay public. Everything before the tag is ordinary, reversible work, so do it without asking. Push the tag only when the owner asked for this release in this conversation; a request to "prepare" a release stops before the tag. Never move or delete a pushed tag, and never rebuild a version that is already public: a problem found after publication is fixed in the next version.

## 1. Read the state

```bash
.claude/skills/release/scripts/release.sh status
```

It prints the branch and tree state, the package version, the last fork tag, the commits since it, the migrations added, whether a release note exists and how far upstream has moved. Stop and settle these first:

- **Dirty tree or not on `main`.** Finish or set aside that work. A release is cut from a clean `main`.
- **Upstream has commits to review.** Decide with the owner whether to sync first (the `upstream-review` skill). A release that an upstream fix lands right after helps no one.
- **Nothing since the last tag.** There is nothing to release.

## 2. Choose the version

The fork runs its own `v1.x` line, so its numbers never collide with upstream's `v0.x`. Read the commits since the last tag and pick:

| The change since the last tag | Version |
| --- | --- |
| Fixes, docs, tooling, an upstream sync with no new capability | patch |
| A new capability, setting, migration or upstream feature release | minor |
| An operator must act for an upgrade to work, or stored data changes meaning | major, and ask the owner first |

When the owner names a version, use it. Say which version you chose and why in one line.

## 3. Prepare on a branch

```bash
git switch -c chore/release-v<version>
.claude/skills/release/scripts/release.sh bump <version>
```

`bump` sets the version in `package.json`, `web/package.json` and `deploy/site/docs/package.json`, then confirms `scripts/release-plan.mjs` accepts the tag. The lockfile records no workspace version, so it does not change.

Write `docs/releases/v<version>.md`, modelled on the newest note in that directory:

- Open with one paragraph that says what the release is and what it builds on.
- Group changes under headings by what a reader notices, with a bold lead phrase per item. Write for an operator who runs the console, not for a contributor. Leave out refactors, tests and tooling unless they change what an operator sees or does.
- End with **Upgrade notes**: the backup reminder, every new migration, environment variable or Compose change (or a sentence saying there is none), and the image tags `ghcr.io/jrmatherly/oh-my-cpa:v<version>` and `:<version>`.
- Every claim comes from the diff since the last tag. A release note that promises something the code does not do is worse than a short one.

Add the note first in the "Latest release notes" list in `docs/releases/README.md`.

An upstream sync brings upstream's own `docs/releases/v0.*.md`. Keep those as upstream wrote them and describe what they carry in the fork's note.

## 4. Check, then land the preparation

Run what a version bump can break:

```bash
pnpm check:english && pnpm check-docs && pnpm test:fast && pnpm check:demo && pnpm verify:docs
```

`pnpm test:self` also belongs here. On macOS three native-release tests fail for want of GNU tar and pass in CI, so read its failures before treating them as real.

Commit as `chore(release): prepare v<version>`, push the branch and open a pull request with that title and the repository's template. Merge it at the head sha once its CI is green (`gh pr merge <n> --merge --match-head-commit <40-character sha>`), then delete the branch.

Wait for the push run on the merge commit itself, because the tag must sit on a commit whose own CI passed:

```bash
git switch main && git pull --ff-only
gh run list --branch main --limit 1 --json databaseId,headSha,status,conclusion
gh run watch <id> --exit-status
```

## 5. Tag

From the clean, verified `main`:

```bash
test -z "$(git status --porcelain)"
TAG="v$(node -p 'require("./package.json").version')"
git tag -a "$TAG" -m "Oh My CPA $TAG"
git push origin "$TAG"
```

Confirm `git rev-parse HEAD` is the commit whose main CI you just watched before you push.

## 6. Follow the release run

```bash
gh run list --workflow release.yml --limit 1 --json databaseId,status,headBranch
gh run watch <id> --exit-status
```

Run the watch in the background; the workflow takes many minutes. Its order is verification of the source, image publication, the signed draft release with every attachment, publication of the release, then promotion of `latest`.

When a job fails, read its log, then follow "Recovery and observation" in `docs/dev/releasing.md`. The short form: re-run the failed jobs on the same run and do not dispatch a new one, because a new dispatch rebuilds the image under a different digest. `TestProxyDownloadsRejectCorruptContent` has failed once in CI and passed 1,100 local runs, so re-run before treating that one as real.

## 7. Verify what was published

```bash
.claude/skills/release/scripts/release.sh verify v<version>
```

It checks that the release is public with 14 assets, that the manifest's signature verifies against `internal/updater/release_public_key.txt` and names this tag and image, and that the `v<version>`, `<version>` and `latest` tags all resolve without credentials to the signed digest. All of it must pass before you call the release done. `latest` exists only after the promote job, so a failure on that line alone means promotion has not finished.

An installed console is the last proof and is outside this repository. Name the digest in your report so the owner can roll it out, and say plainly that no running installation was checked unless one was.

## 8. Report and hand off

Tell the owner the version, the release URL, the image digest, what `verify` printed and what was not checked. Update the session handoff with the new tag and digest.
