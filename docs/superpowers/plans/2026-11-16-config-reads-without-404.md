# Config Reads Without a 404 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The console never asks CPA for one configuration path to learn whether it is set, so an ordinary load logs no 404 on the gateway and reads the configuration once.

**Architecture:** Every read of stored key groups and plugin settings takes its value from the whole v8 view (`GET /v8/management/config`) through the existing `configViewValueAt`, the reader PR 18 introduced. The per-path reader `configValueAt` then has no caller and is deleted. The two read-only loaders that fan out many readers share one view fetch through a request-scoped memo on the context; writes never opt in, so their reads stay fresh.

**Tech Stack:** Go (`internal/cpa/management`, `internal/api`), `net/http/httptest` fake gateways, `scripts/fake-cpa.mjs` (Node) for browser acceptance.

**Spec:** None. The findings below are the specification; they were measured on 2026-11-16 against `eceasy/cli-proxy-api:v8.0.76` (digest `sha256:d205abff…`, the image home-cluster runs) and read in CPA's source at tag `v8.0.76`.

## Findings this plan rests on

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | `GET /v8/management/config/<path>` answers 404 `{"error":"not_found"}` and logs a warning for every unset path. Unset `api-keys/<family>`, `api-keys/openai-compatibility` and `plugins/configs/<id>` all do. | Measured. CPA `internal/api/handlers/management/config_v8.go:68-72`. |
| F2 | A path reply and the same path inside the whole view are byte-equal once keys are sorted, and carry the same `ETag`. Checked for `api-keys/codex` (two keys, one override), `api-keys/claude`, `api-keys/openai-compatibility`, `plugins/configs/usage-exporter`. An unset path is `null` in the view. | Measured. Both come from one handler that parses the file, then walks to the path. |
| F3 | A path read costs CPA exactly what a whole read costs: each takes the handler mutex, reads the file from disk and normalizes the whole document. | CPA `config_v8.go:27-45`. |
| F4 | CPA's rename tables (`v8ClientPaths`, `v8SharedPaths`, `v8SharedStructPaths`) hold only `oauth.providers.*`, `providers.codex.*` and `codex.*`. No `api-keys` or `plugins` path is renamed on a path request. | CPA `internal/config/config_v8.go:27-65` at `v8.0.76`. |
| F5 | Every v8 404 makes the client drop its cached "this gateway serves v8" answer (`sendAccepting`, `internal/cpa/management/client.go:216`), and each request after that probes `config/config-version` again. | Measured: 5 path 404s produced 5 extra probes in one load. |
| F6 | One console state load with a warm cache, three of eight key families set. Today: 16 v8 requests (5 with a 404 and a warning, 5 version probes, 3 whole views, 3 path reads). View reads, not shared: 11 whole views, no 404, no probe. View reads, shared per load: 1 whole view. | Measured with a throwaway prototype of each design, since reverted. |
| F7 | The plugin 404 carries no information the view lacks. "Configured" is whether `plugins.configs.<id>` is present; `plugin_not_found` comes from a separate check against `GET /plugins`. The plugin reads run only when an operator opens or saves a plugin's settings. | `internal/cpa/management/client_plugins.go:276-325`; callers `internal/api/management_plugins.go:309,372`. |
| F8 | Upstream `WizisCool/oh-my-cpa` at `d3ee3b44` still reads key groups by path, so this is a fork deviation to record. v8.0.76 is CPA's newest release. | `gh api` on 2026-11-16. |
| F9 | `scripts/fake-cpa.mjs` answers the whole view with `{...configDoc, oauth}`. It does not carry key groups or plugin settings there; it serves both only by path. | `scripts/fake-cpa.mjs:647-655, 670-712`. |
| F10 | Applying only the two reader changes (Tasks 1 and 2, no fixture work) fails 25 Go tests in `internal/cpa/management` and `internal/api`, and none elsewhere. Three test files serve key groups by path and still pass, which makes them the silent-pass risk. | Measured with `go test -short ./internal/...`, then reverted. Lists in Task 1 and Task 2. |
| F11 | Both loaders that Task 3 opts in make no configuration write. | Read: `loadUpstreamProjectedState` and `readProviderItemsUpstreamWithStatus` call only read methods on the client. |

One accepted difference: a plugin whose settings are an explicit YAML `null` reads as "configured" by path today and as "not configured" from the view. It matters only for a plugin that is also not installed, which then reports `plugin_not_found`. No fixture or real configuration seen has this shape.

Not in scope, by decision: a plugin page's own request to `/v8/management/config/api-keys` through the plugin host proxy (the plugin's code, not the console's), and the fact that concurrent requests each probe after a cache drop (F5). Once this plan lands the console's ordinary reads produce no v8 404, so that second effect has no ordinary trigger.

## Global Constraints

- Go only in `internal/`; no new dependency. `gofmt -l` clean and `golangci-lint run ./internal/cpa/... ./internal/api/...` clean.
- English only in every file. No middle dot between facts in comments or docs.
- No `/api` route, DTO or handler signature changes, so `docs/openapi/swagger.json` must not change (`pnpm check:openapi` passes untouched).
- Comments state a non-obvious why in one or two lines; no history in comments.
- A fake gateway that still serves moved data at the old path makes a read come back empty while a test passes for the wrong reason. After moving each fixture, delete its data once and confirm the test that depends on it fails, then restore it.
- Commit only when Jason asks. The commit steps below are the points at which to ask.
- Branch: `fix/config-reads-without-404` from `main`.

## Review Focus

1. A key family with no stored groups (the ordinary state of most families): the read returns an empty list and the gateway sees no path request. Pinned in Task 1.
2. An installed plugin with no saved settings: `PluginConfig` returns an empty object, not `plugin_not_found`, and no path request is made. Pinned in Task 2.
3. A write that follows a load: a provider or plugin write must read the configuration fresh and never see a view an earlier load fetched. Pinned in Task 3 by asserting a context without the memo fetches every time.
4. A view fetch that fails inside a shared load (gateway down, context cancelled): every reader in that load reports the failure and the families fall back to the runtime list as they do today. Pinned in Task 3.
5. `api-keys` present in the view with a wrong shape (an object where a list belongs): the read fails with a `decode api-keys.<family>` error and does not silently return nothing. Pinned in Task 1.

---

## File Structure

| File | Change |
| --- | --- |
| `internal/cpa/management/provider_groups.go` | `storedKeyGroups` reads the view; `configValueAt` and `isConfigPathMissing` deleted; `configViewValueAt` comment loses "ordinarily empty". |
| `internal/cpa/management/client_plugins.go` | `PluginConfig` and `requireKnownPlugin` read the view. |
| `internal/cpa/management/client_config.go` | `WithSharedConfigView`; `ConfigView` consults it. |
| `internal/api/state_coordinator.go` | `loadUpstreamProjectedState` opts in. |
| `internal/api/management_providers.go` | `readProviderItemsUpstreamWithStatus` opts in. |
| `*_test.go` named per task | Fake gateways serve key groups and plugin settings inside the view. |
| `scripts/fake-cpa.mjs` | Whole view carries `api-keys` and `plugins.configs`. |
| `internal/demo/demo_test.go` | Expected-route list drops the plugin path read. |
| `.claude/skills/upstream-review/SKILL.md` | One deviations row. |

---

### Task 1: Key groups read from the whole view

**Files:**
- Modify: `internal/cpa/management/provider_groups.go:106-113`
- Test: `internal/cpa/management/provider_groups_test.go` (extend)
- Fixtures that fail once the reader moves (measured, F10):

| File | Tests that fail |
| --- | --- |
| `internal/cpa/management/provider_groups_test.go` | `TestEditableOpenAICompatibilityVerifiesIdentityOnCaseFoldFallback`, `TestUpdateConfigAPIKeysEditsOnlyRequestedPoolLayer`, `TestUpdateConfigAPIKeysKeepsAnImplicitDefaultBaseURLImplicit`, `TestUpdateConfigAPIKeysPreservesConnectionPoolInheritance`, `TestUpdateOpenAICompatibilityKeepsUnmodelledSettings` |
| `internal/cpa/management/provider_family_move_test.go` | `TestMoveProviderFamilyBackupFailureAndRevisionConflict`, `TestMoveProviderFamilyKeepsUnrelatedStoredGroupsAndUsesOneGuardedWrite`, `TestMoveProviderFamilyRefusesAHiddenSourceDuplicate` |
| `internal/cpa/management/golden_test.go` | `TestKeyGroupsGolden` |
| `internal/api/management_provider_family_move_test.go` | `TestProviderProtocolChange` and its seven `TestProviderProtocolChange…` siblings, `TestCompatibilityMovePreservesRotatedKeyOverrides` |
| `internal/api/management_provider_policy_test.go` | `TestProviderConnectionPoolGroupAndKeyEdits` |
| `internal/api/management_providers_test.go` | `TestManagementProviderListFallsBackWhenStoredGroupsFail` |
| `internal/api/management_routing_test.go` | `TestRoutingPlanAppliesAsOneConfigWriteAndVerifiedCredentialPatches` |
| `internal/api/state_coordinator_test.go` | `TestStateCoordinatorProviderRecoveryRejectsOlderGeneration`, `TestStateCoordinatorRetriesFailedRuntimeFallback`, `TestStateCoordinatorRetriesRuntimeFallbackMetadata` |

- Fixtures that serve key groups by path and still pass (the silent-pass risk; move them and prove them in step 7): `internal/api/cpa_v8_groups_test.go` (the shared `serveProviderGroups` helper), `internal/api/management_identity_directory_test.go`, `internal/api/management_provider_vertex_openapi_test.go`

**Interfaces:**
- Consumes: `func (c *Client) configViewValueAt(ctx context.Context, path []string, output any) error` (exists).
- Produces: `storedKeyGroups(ctx, path) ([]map[string]any, error)`, signature unchanged, now view-backed. `configValueAt` is still used by Task 2's files until that task.
- Produces, test-only, in `internal/api/cpa_v8_groups_test.go`: `func providerGroupsView(families []string, lists func(family string) *[]map[string]any, stored map[string][]map[string]any) map[string][]map[string]any`. It returns the value a fake puts under `"api-keys"` in its view reply, built the way `serveProviderGroups` builds a path reply (stored groups when present, otherwise `groupFlatList`), and omits a family with no entries. Fakes in `internal/api` call it so the view and the write routes read one state.

- [ ] **Step 1: Write the failing tests** in `provider_groups_test.go`. Add a `pathReads int` counter to `groupsGateway`, incremented in its `GET /v8/management/config/api-keys/<family>` case.

```go
func TestStoredKeyGroupsReadFromTheViewWithoutAskingForThePath(t *testing.T) {
	// stored groups set: EditableConfigAPIKeys matches both keys to their group
	// and gateway.pathReads == 0
}

func TestStoredKeyGroupsOfAnUnsetFamilyAreEmptyWithoutA404(t *testing.T) {
	// g.stored == "": entries equal the runtime list, err == nil, gateway.pathReads == 0
}

func TestStoredKeyGroupsRefuseAFamilyOfTheWrongShape(t *testing.T) {
	// view {"api-keys":{"codex":{"name":"x"}}}: err != nil and
	// strings.Contains(err.Error(), "decode api-keys.codex")
}
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `go test ./internal/cpa/management -run 'TestStoredKeyGroups' -count=1`
Expected: FAIL. The first two fail on `pathReads` (1, want 0); the third fails because the fixture has no view route yet.

- [ ] **Step 3: Serve the groups in the fixture's view.** In `groupsGateway.handler`, add `GET /v8/management/config` answering `{"config-version":8}` when `g.stored == ""` and `{"config-version":8,"api-keys":{"<family>":<g.stored>}}` otherwise. Keep the path case for one more step so the counter can prove it is unused.

- [ ] **Step 4: Change `storedKeyGroups`** to call `c.configViewValueAt(ctx, path, &groups)`. Update the `configViewValueAt` comment: drop the sentence "Use it for a path that is ordinarily empty"; it is now the only config reader.

- [ ] **Step 5: Run the package**

Run: `go test -short ./internal/cpa/management -count=1`
Expected: the three new tests PASS. Other tests in the package that serve groups by path now FAIL; that is the list to fix in step 6.

- [ ] **Step 6: Move every remaining fixture.** For each file in both Fixtures lists, make the fake's `GET /v8/management/config` reply carry `"api-keys": {"<family>": [...]}` with the data its `GET .../config/api-keys/<family>` case served, then delete that GET case (in `serveProviderGroups`, narrow the first case to `DELETE`). Leave `DELETE` and `PATCH` cases alone: writes still address the path. Where a fixture already answers `/v8/management/config` for aliases or scalars, merge the key into that reply. `TestManagementProviderListFallsBackWhenStoredGroupsFail` simulates a failed stored-group read by failing the path; make it fail the view read instead, and keep its assertion that the family stays visible from the runtime list. Do not touch `internal/api/management_plugin_host_test.go` or `client_plugin_host_test.go`: those exercise a plugin page's own proxied request.

- [ ] **Step 7: Prove each moved fixture is load-bearing.** For each fixture, blank the `api-keys` value once, run the tests in that file, confirm at least one fails, restore it. For the three silent-pass files, a blanked value that fails nothing means no test there depends on stored groups: say so in the PR and leave the fixture serving the view, rather than inventing a test.

- [ ] **Step 8: Run both packages**

Run: `go test -short ./internal/cpa/... ./internal/api/... -count=1`
Expected: PASS.

- [ ] **Step 9: Commit** (ask first)

```bash
git add internal/cpa/management internal/api
git commit -m "fix(cpa): read stored key groups without a 404"
```

---

### Task 2: Plugin settings read from the whole view, per-path reader deleted

**Files:**
- Modify: `internal/cpa/management/client_plugins.go:276-325`, `internal/cpa/management/provider_groups.go:58-75,101-104`
- Test: `internal/cpa/management/provider_groups_test.go:291` (`TestPluginConfigTellsAnUnconfiguredPluginFromAnUnknownOne`), `internal/api/management_plugins_test.go`, `internal/demo/demo_test.go:606`

**Interfaces:**
- Consumes: `configViewValueAt` (exists).
- Produces: `PluginConfig`, `SetPluginEnabled`, `SetPluginConfig` with unchanged signatures and unchanged results. `configValueAt` and `isConfigPathMissing` no longer exist.

- [ ] **Step 1: Tighten the existing test and add the write-side one.** In `TestPluginConfigTellsAnUnconfiguredPluginFromAnUnknownOne`, replace the fixture's path case with `/v8/management/config` answering `{"plugins":{"enabled":false,"configs":{"configured":{"level":"info"}}}}`, and assert:

```go
// "installed" (in /plugins, absent from configs): config is empty map, err == nil
// "configured" (absent from /plugins, present in configs): config["level"] == "info"
// "ghost" (in neither): errors.As HTTPError, 404, body contains "plugin_not_found"
// no request in gateway.requests has the prefix "GET /v8/management/config/plugins/configs/"
```

Add `TestPluginWritesAcceptAConfiguredPluginThatIsNotInstalled`: with the same view, `SetPluginEnabled(ctx, "configured", true)` succeeds and `SetPluginEnabled(ctx, "ghost", true)` returns `plugin_not_found`, again with no path GET.

- [ ] **Step 2: Run and confirm failure**

Run: `go test ./internal/cpa/management -run 'TestPlugin' -count=1`
Expected: FAIL on the "no path GET" assertion.

- [ ] **Step 3: Change the two readers.** In both `requireKnownPlugin` and `PluginConfig`, decode through `configViewValueAt` into a `map[string]any` and take `configured := config != nil`. A plugin whose stored settings are the empty object `{}` decodes to a non-nil map and stays "configured", as today.

- [ ] **Step 4: Delete `configValueAt` and `isConfigPathMissing`** from `provider_groups.go` and drop the imports they alone used (`net/http` if nothing else in the file needs it). Confirm: `grep -rn "configValueAt\|isConfigPathMissing" internal` prints nothing.

- [ ] **Step 5: Move the plugin fixtures.** In `internal/api/management_plugins_test.go`, serve the settings the `pluginConfigsPath` GET case served inside the `/v8/management/config` reply under `plugins.configs`, and delete that GET case (keep `PUT`). `TestPluginsLifecycle` is the test that fails until this is done (F10). In `internal/demo/demo_test.go`, remove `managementPrefix + "/config/plugins/configs/usage-exporter"` from the list of endpoints the console reads. That test does not fail either way; the entry is removed because the console no longer makes that request. `internal/demo/upstream.go` serves a path by walking the whole view, so the demo needs no other change.

- [ ] **Step 6: Prove the fixtures are load-bearing**, as in Task 1 step 7, by blanking `plugins.configs` once per fixture.

- [ ] **Step 7: Run**

Run: `go test -short ./internal/cpa/... ./internal/api/... ./internal/demo/... -count=1`
Expected: PASS.

- [ ] **Step 8: Commit** (ask first)

```bash
git add internal/cpa/management internal/api internal/demo
git commit -m "fix(cpa): read plugin settings without a 404 and drop the per-path reader"
```

---

### Task 3: One view fetch per load

**Files:**
- Modify: `internal/cpa/management/client_config.go:178-195`, `internal/api/state_coordinator.go:853`, `internal/api/management_providers.go:436`
- Test: `internal/cpa/management/client_config_test.go` (extend), `internal/api/state_coordinator_test.go` (extend)

**Interfaces:**
- Produces:

```go
// WithSharedConfigView makes every ConfigView call on the returned context
// share one fetch. It is for a read-only load that fans out many readers; a
// write must not use it, because a write reads the configuration it is about
// to change and needs it fresh.
func WithSharedConfigView(ctx context.Context) context.Context
```

`ConfigView(ctx)` keeps its signature. On a context from `WithSharedConfigView` it fetches once (`sync.Once`) and returns the same view, `ResponseMeta` and error to every caller; on any other context it fetches every time. The memo lives on the context, in the style of `WithBackupReason` (`config_backup.go:60`). Every existing caller treats the view as read-only (`ValueAt`, or a JSON round trip in `configViewValueAt`), which is what makes sharing the map safe; say so in the comment.

- [ ] **Step 1: Write the failing tests** in `client_config_test.go`, using `configGateway.requests` to count `GET /v8/management/config`:

```go
func TestSharedConfigViewFetchesOncePerContext(t *testing.T) {
	// ctx := WithSharedConfigView(context.Background())
	// 8 goroutines call ConfigView(ctx): exactly 1 view request, all get the same content
}

func TestConfigViewFetchesEveryTimeWithoutTheSharedContext(t *testing.T) {
	// 3 sequential ConfigView(context.Background()) calls: 3 view requests
}

func TestSharedConfigViewHandsItsFailureToEveryReader(t *testing.T) {
	// gateway answers the view with 500: every one of 4 callers gets a non-nil
	// error, and there is exactly 1 view request
}

func TestSharedConfigViewsDoNotLeakBetweenContexts(t *testing.T) {
	// two WithSharedConfigView contexts, the gateway's view changes between
	// them: the second context sees the new content
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `go test ./internal/cpa/management -run 'ConfigView' -count=1`
Expected: FAIL to compile, `undefined: WithSharedConfigView`.

- [ ] **Step 3: Implement** `WithSharedConfigView` and the memo check at the top of `ConfigView`.

- [ ] **Step 4: Run**

Run: `go test ./internal/cpa/management -run 'ConfigView' -count=1 -race`
Expected: PASS, no race.

- [ ] **Step 5: Write the loader test** in `state_coordinator_test.go`: `TestProjectedStateLoadReadsTheConfigViewOnce` builds a handler over a fake gateway that counts `GET /v8/management/config`, runs `loadUpstreamProjectedState`, and asserts the count is 1 and that no request path has the prefix `/v8/management/config/api-keys/` or `/v8/management/config/oauth/`.

Run: `go test ./internal/api -run TestProjectedStateLoadReadsTheConfigViewOnce -count=1`
Expected: FAIL, the count is greater than 1 (11 against a real gateway, F6).

- [ ] **Step 6: Opt the two loaders in.** First statement after the client is resolved in `loadUpstreamProjectedState` and in `readProviderItemsUpstreamWithStatus`: `ctx = management.WithSharedConfigView(ctx)`. Nowhere else. In particular not in any `Flush` in `registerCoordinatorDomains`, `management_provider_list_mutation.go`, `provider_family_move.go` or `management_plugins.go`: those write.

- [ ] **Step 7: Run**

Run: `go test -short ./internal/cpa/... ./internal/api/... -count=1 -race`
Expected: PASS.

- [ ] **Step 8: Commit** (ask first)

```bash
git add internal/cpa/management internal/api
git commit -m "perf(cpa): share one config view across a state load"
```

---

### Task 4: Acceptance gateway, deviations row, and proof on a real CPA

**Files:**
- Modify: `scripts/fake-cpa.mjs:647-712`, `.claude/skills/upstream-review/SKILL.md` (deviations table, after the PR 18 row)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Make the fake's whole view carry what the console now reads there.** In the `GET /v8/management/config` case, add `'api-keys'` built the way the `api-keys` path case builds it (`groupEntries(family, list.get())` per family in `providerLists`), omitting a family whose list is empty and omitting the key when none is set, and add `plugins: {...configDoc.plugins, configs: Object.fromEntries(pluginConfigs)}`, omitting `configs` when the map is empty. Delete the two `GET` branches for `api-keys/<family>` and `plugins/configs/<id>`; keep their `DELETE` and `PUT` branches and the bare `api-keys` GET that the plugin host test page calls.

- [ ] **Step 2: Add the deviations row** in `.claude/skills/upstream-review/SKILL.md`, same four columns as the row above it: what upstream does (`storedKeyGroups`, `PluginConfig` and `requireKnownPlugin` fetch one path each, 404 while unset, the 404 drops the cached v8 answer), what the fork does (all read the view through `configViewValueAt`; `configValueAt` is deleted; `WithSharedConfigView` gives a state load one fetch), `landed <date>`, and the merge rule (ADAPT: keep the view read; an upstream test that adds a per-path GET case needs its data moved into the view reply; an upstream call to `configValueAt` will not compile, which is the prompt to move it). Also edit the PR 18 row's last sentence, which says `PluginConfig` and `storedKeyGroups` "still read by path".

- [ ] **Step 3: Static and fast checks**

Run: `gofmt -l internal && golangci-lint run ./internal/cpa/... ./internal/api/... && pnpm test:fast && pnpm check:openapi && pnpm check:english`
Expected: no output from `gofmt`, every command exits 0, `swagger.json` unchanged.

- [ ] **Step 4: Browser smoke on the built artifact**

Run: `pnpm build && pnpm verify:browser:smoke`
Expected: PASS. A failure on the providers or plugins page here means step 1 left data out of the view.

- [ ] **Step 5: Prove it on the real gateway.** This repeats the F6 measurement on the finished code.

Start the gateway with the starter configuration, so every key family and every plugin is unset:

```bash
docker run -d --name omc-cpa-probe -e MANAGEMENT_PASSWORD=probe-throwaway -p 127.0.0.1:18317:8317 -v "$PWD/deploy/cpa.config.example.yaml:/CLIProxyAPI/config.yaml:ro" eceasy/cli-proxy-api:v8.0.76
```

Add a throwaway `internal/cpa/management/zz_probe_test.go` (never committed) with one test that builds `NewClient("http://127.0.0.1:18317", "probe-throwaway", 10*time.Second, false)`, calls `ManagementAPI` once to warm the version cache, then, on a `WithSharedConfigView` context and concurrently, calls `EditableConfigAPIKeys` for all seven families, `EditableOpenAICompatibility`, `OAuthModelAliases`, `OAuthExcludedModels` and `ClientAPIKeys`, and after them `PluginConfig(ctx, "usage-exporter")` on a plain context. Run it, then:

Run: `docker logs omc-cpa-probe 2>&1 | grep gin_logger | grep '/v8/management/' | grep -c ' 404 '`
Expected: `0`. (`PluginConfig` for a plugin that is neither installed nor configured still returns `plugin_not_found` to the caller, with no request the gateway answers 404.)

Run: `docker logs omc-cpa-probe 2>&1 | grep gin_logger | grep -c 'GET *"/v8/management/config"'`
Expected: `2`, one for the shared load and one for the plugin read.

Delete the test file, run `git status --short` to confirm it is gone, and `docker rm -f omc-cpa-probe`.

- [ ] **Step 6: Commit** (ask first)

```bash
git add scripts/fake-cpa.mjs .claude/skills/upstream-review/SKILL.md
git commit -m "test(acceptance): serve key groups and plugin settings in the fake gateway's view"
```

- [ ] **Step 7: Open the PR** with the repo template, `## Why` opening with the goal above, and the F6 table as the evidence. Dispatch `ci.yml` by hand if the `pull_request` trigger stays silent.
