# Project Roadmap

## Roadmap Principles

This roadmap is derived from the evidence and stable IDs in `ANALYSIS.md`. Work is ordered by privacy and user risk, truthfulness of validation, correctness, release confidence, maintainability, then product value. Each increment should be small enough to revert and must include evidence that tests the behavior, not merely the implementation. Product ideas remain exploratory until user value and data/privacy semantics are defined.

No Critical or High finding requires an emergency patch. Phase 0 therefore focuses on the Medium privacy decision, invalid verification evidence, and licensing rather than implying an active compromise or broken primary workflow.

## Roadmap Lineage

This is the first root roadmap tied to stable audit IDs. The prior `docs/roadmap.md` is preserved as historical planning input.

- **Completed:** The repository baseline is committed/published; immediate reveal on disable and rescan on enable are already implemented; much of the proposed safe diagnostics UI already exists.
- **Persistent and verified:** CI, allowlisted releases, Literotica normalization, disabled-state efficiency, native verification, folder filtering, display modes, adapter maintainability, and optional site access remain relevant.
- **Reprioritized:** `SEC-001`/`SEC-002` and the false browser-harness result (`TEST-001`) precede feature work. Folder filtering and display modes move behind release validation.
- **Deferred:** Shortcut/badge, per-card exceptions, seen-list storage, and cross-browser expansion need demand or design evidence.
- **Removed from active scope:** A generic “improve diagnostics” initiative is not carried over wholesale because the popup already distinguishes unsupported/no-card/no-match/index-error states and exposes safe counts/reason codes. Only narrowly defined remaining diagnostics work may be added.
- **Newly added:** License/governance (`DOC-001`, `GH-002`), branch protection (`GH-001`), and the shared-DOM privacy boundary (`SEC-001`).

No previously planned item was silently deleted. `docs/roadmap.md` should be marked historical only in a later approved documentation change.

## Phase 0: Immediate Safety and Repository Health

### SEC-001 / SEC-002 — Decide the bookmark-membership privacy contract

The owner must choose between two explicit contracts before expanding the extension:

1. Preserve automatic page hiding, acknowledge that an enabled supported site can potentially observe guessed same-site membership, disclose it clearly, and require informed per-site host opt-in; or
2. Preserve bookmark-membership confidentiality by moving bookmark-derived results to extension-owned UI that the page cannot observe, accepting a larger product interaction change.

Deliver a short threat/data-flow decision record, user-facing disclosure, and adversarial validation criteria. Optional permissions alone reduce exposure and improve consent; they do not eliminate the shared-DOM signal after access is granted.

### TEST-001 — Restore truthful browser-harness evidence

Make the Literotica search generator use the production-compatible `div.ai_iG > a.ai_ii > h4` shape, add an automated real-browser assertion for recognized/hidden counts, and correct README/verification claims until it passes. This is the best first code change because it is bounded, low risk, and prevents CI from institutionalizing a false smoke result.

### DOC-001 — Choose and add a license

The owner—not an automated tool—must select a license. Add the canonical text and align README/release/package metadata only after that decision. Do not infer a license from public visibility.

## Phase 1: Stabilization

### BUG-001 — Restrict Literotica host equivalence

Replace blanket `.literotica.com` aliasing with an explicit verified-host set. Add positive tests for intended aliases and negative tests for unknown subdomains, chapters, and meaningful parameters.

### PERF-001 — Make disabled state a processing boundary

When a site is disabled, stop new mutation/bookmark refresh scans, clear queued candidate work, reveal existing cards, and perform one fresh scan after re-enable. Test late DOM insertion, bookmark change, disable during an in-flight batch, and re-enable.

### TEST-002 — Establish a native Chrome release matrix

Use a disposable profile and synthetic bookmarks. Verify unpacked install/reload, initial injection, bookmark create/change/remove/import, service-worker suspension/wake, popup controls, permissions, navigation, error recovery, and split incognito. Keep native synthetic cases separate from consented live-layout observations. Automate only stable cases after the manual matrix is reproducible.

### DX-001 — Add the first CI gate

Pin a supported Node version; perform a lockfile-preserving clean install; run the 58-test suite and syntax checks; and upload concise failure output. Add the corrected browser harness only when it can run deterministically. Do not claim whole-repository coverage until popup/content VM instrumentation is solved.

### REL-001 — Define a deterministic allowlisted release

Create a packaging command that includes only runtime files referenced by the manifest, validates archive contents and manifest references, rejects profiles/bookmark exports/dev files, and emits a checksum. Document unpacked install, release verification, rollback, and settings compatibility.

## Phase 2: Maintainability and Developer Experience

### ARCH-001 — Consolidate the adapter contract incrementally

Co-locate each site's identity rules, selector contract, fixtures, and verification metadata. Add cross-checks for manifest patterns and popup labels. Prefer tests over adding a build generator; if generation is necessary, make output deterministic and reviewable. Preserve the current pure adapter API while migrating one site at a time.

### GH-001 — Protect `main` after CI is trustworthy

Require the essential CI workflow, disallow force-push and branch deletion, and choose review requirements appropriate to the maintainer count. Do not enable a required check before it is stable and documented.

### GH-002 — Improve contributor and public repository entry points

Add concise `SECURITY.md` and contribution/setup guidance, a repository description and topics, and a privacy-safe screenshot or short demo if useful. Add issue/PR templates and a code of conduct only when external contribution is actively supported.

### Dependency maintenance

Track JSDOM deliberately. The current `26.1.0` development tree has no known advisory but is behind major version 30 and contains one deprecated transitive package. Test a major upgrade in a separate branch only when its Node requirements and JSDOM behavior provide a concrete benefit; do not mix it with runtime fixes.

## Phase 3: Product Improvements

### FEAT-001 — Bookmark-folder filtering

Extend the index to represent folder ancestry and duplicate bookmark membership. Let users choose folders and whether descendants count. Define behavior for folder moves/deletion, duplicates across selected/unselected folders, imports, incognito, rollback, and missing folders before implementation.

### FEAT-002 — Hide, dim, and mark display modes

Add a per-site or global mode while preserving the host page's original classes/styles on disable, reveal, navigation, error, and extension removal. Start with hide versus dim; add mark only if it remains visually reliable across supported layouts.

### Safe diagnostic refinement

Expose adapter verification status/version and safe reason codes only if they shorten support work. Never include bookmark URLs, titles, page text, raw Chrome errors, or a membership list.

## Phase 4: Strategic Expansion

### FEAT-005 — Cross-browser packaging

After Chrome release evidence is stable, assess Edge with the existing MV3 package and Firefox with a documented API/manifest compatibility matrix. Treat each browser as a separate supported platform with its own lifecycle, permissions, incognito/private-mode, and release validation—not as a README claim.

Do not add more content-site adapters before the current four have native evidence and the privacy contract is settled.

## Exploratory Ideas

### FEAT-003 — Per-card exceptions

Learn whether users need “show once,” “keep visible for this session,” or persistent exceptions. Before promotion, determine expected discoverability, storage lifetime, URL normalization, deletion, sync, and incognito semantics.

### FEAT-004 — Optional seen list

Validate whether bookmark-independent history solves a common problem. Before promotion, define opt-in, retention, quota, deletion/export, migration/rollback, duplicate identity, and incognito behavior. A prototype must use synthetic data.

### Extension-owned match panel

Prototype only if users value confidentiality over automatic in-page hiding. Compare workflow cost with the `SEC-001` privacy benefit and establish that no bookmark-dependent signal remains in page-owned DOM.

### Shortcut and badge

Validate demand and distraction/privacy tradeoffs before adding manifest commands or a visible count. The popup already provides reveal and count controls.

## Deferred or Rejected Ideas

- **More supported sites:** Deferred until `SEC-001`, `TEST-002`, and adapter maintenance are resolved; otherwise permission and verification debt multiply.
- **Cloud sync, accounts, server processing, or telemetry:** Rejected for the current product direction because they weaken the local-only differentiator and create disproportionate privacy/security operations.
- **Fuzzy or ML-driven card detection:** Rejected; false hides, opacity, and ongoing model/site maintenance conflict with conservative filtering.
- **Framework migration or rewrite:** Rejected; the production surface is small, testable vanilla JavaScript, and incremental fixes are sufficient.
- **Persistent exception/seen storage immediately:** Deferred until `FEAT-003`/`FEAT-004` data-lifecycle questions are answered.
- **Blind JSDOM major upgrade:** Deferred until compatibility is tested and a concrete benefit is identified; “latest” is not a requirement.

## Documentation Plan

1. Correct `README.md` and `docs/verification.md` for `TEST-001`; record exact test commands and preserve simulated/native distinctions.
2. Add the owner-selected `LICENSE` (`DOC-001`).
3. Add `SECURITY.md` with supported versions, private reporting, threat boundary, sensitive-data rules, and response expectations (`SEC-001`, `GH-002`).
4. Add concise `CONTRIBUTING.md` with portable Node setup, lockfile-preserving install, tests, syntax, browser/native evidence categories, generated icon workflow, and no-personal-bookmark rule (`DX-001`, `GH-002`).
5. Add `docs/architecture.md` after the privacy decision; document data flow, trust boundaries, index ownership, fail-open semantics, and adapter contract (`SEC-001`, `ARCH-001`).
6. Add a release guide and `CHANGELOG.md` with the first packaged release (`REL-001`).
7. Mark `docs/roadmap.md` as historical and point to root `ROADMAP.md`; preserve its content rather than deleting it.
8. Add a screenshot/demo only with synthetic, non-sensitive content. Add troubleshooting/support instructions based on actual native failures, not speculative boilerplate.

## GitHub Improvement Plan

- **Manual owner choice:** License (`DOC-001`).
- **Repository files:** CI workflow (`DX-001`), `SECURITY.md`, `CONTRIBUTING.md`, optional templates, release guide, changelog, and privacy-safe README media (`GH-002`, `REL-001`).
- **Manual GitHub administration:** Set description, topics, optional homepage/social preview; review security/Dependabot settings; configure branch rules only after CI; publish signed/checksummed releases; decide whether Issues, wiki, Projects, and Discussions have maintainers (`GH-001`, `GH-002`).
- **Do not enable by default:** Funding, wiki content, Discussions, milestones, Projects, or templates without a real process to maintain them.
- **Verification:** Re-query public metadata/community profile, inspect the repository logged out, open a test issue/PR only in an authorized disposable context, and confirm required checks on a non-destructive test branch.

## Branch Cleanup and Migration Plan

### Keep

- `main` / `origin/main`: sole current/default branch; local and remote were aligned at the audit baseline.

### Safe to Delete After Approval

- None. No additional local or remote branch exists.

### Review Before Deletion

- None.

### Preserve or Merge Unique Work

- None outside `main`; no branch with unique commits was found.

### Rename or Migrate

- None. The default branch is already `main`.

### Manual GitHub Action Required

- After `DX-001` is stable, an administrator should configure `GH-001` branch protection/rules and confirm the repository default remains `main`.
- Optionally configure local `origin/HEAD` to track `origin/main`; this is local convenience, not a repository defect or required migration.

## Milestone Table

| ID | Initiative | Source findings/need | Priority | Effort | Dependencies | Target phase | Success criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | Choose and implement privacy contract | SEC-001 | P0 | High | Owner/product decision | 0 | Threat model and UI/permission behavior match; adversarial DOM test meets chosen contract |
| SEC-002 | Add informed per-site access if chosen | SEC-001, SEC-002 | P0 | Medium-High | SEC-001 decision, native permission plan | 0/1 | Disabled/ungranted sites have no content-script access; revocation/re-enable tested |
| TEST-001 | Repair Literotica browser harness | TEST-001 | P0 | Small | None | 0 | Search card recognized and hidden in automated browser smoke; docs corrected |
| DOC-001 | Add owner-selected license | DOC-001 | P0 | Small | Owner legal/product choice | 0 | Canonical license present and metadata consistent |
| BUG-001 | Limit Literotica host aliases | BUG-001 | P1 | Small | Verified equivalent-host list | 1 | Unknown subdomain stays distinct; intended aliases/chapters/params pass |
| PERF-001 | Stop work while disabled | PERF-001 | P1 | Small-Medium | Defined re-enable semantics | 1 | Zero match requests for disabled mutations; one correct re-enable rescan |
| TEST-002 | Native Chrome validation | TEST-002 | P1 | Medium | Correct harness, synthetic profile | 1 | Documented native matrix passes or records reproducible failures |
| DX-001 | CI test/syntax gate | DX-001, TEST-001 | P1 | Small-Medium | TEST-001 | Clean install, tests, syntax run on PR/push with reproducible output |
| REL-001 | Allowlisted release pipeline | REL-001, TEST-002 | P1 | Medium | Native matrix, CI | 1/2 | Deterministic archive, exact allowlist, checksum, manifest validation, rollback guide |
| ARCH-001 | Consolidate adapter contract | ARCH-001, TEST-001 | P2 | Medium | Behavior regression suite | 2 | One source of adapter truth or enforced cross-checks; no fixture/manifest drift |
| GH-001 | Protect `main` | GH-001, DX-001 | P2 | Small/admin | Stable CI | 2 | Required checks enforced; force-push/deletion blocked; documented bypass policy |
| GH-002 | Complete public/contributor surface | GH-002, DOC-001 | P2 | Small-Medium | License/security decisions | 2 | Accurate metadata, security/contribution paths, improved public profile |
| FEAT-001 | Folder-aware filtering | Documented user need | P3 | High | Stable index/native tests | 3 | Selected-folder/descendant/move/delete/duplicate behaviors pass |
| FEAT-002 | Hide/dim/mark modes | Documented user need | P3 | Medium | Native layout baseline | 3 | Modes restore site state correctly across errors/navigation/disable |
| FEAT-003 | Per-card exception discovery | Exploratory opportunity | Explore | Unknown | User research, data semantics | Exploratory | Dominant exception model and retention expectation established |
| FEAT-004 | Seen-list discovery | Exploratory opportunity | Explore | High | User research, privacy/storage model | Exploratory | Demand and complete data lifecycle validated before code |
| FEAT-005 | Cross-browser assessment | Strategic opportunity | P4 | Medium-High | Chrome release maturity | 4 | Per-browser compatibility matrix and repeatable package validation |

## Change Control, Validation, and Recovery

Every row below describes a future mutation outside this audit's two documents. All require separate explicit human approval before implementation.

| IDs | Exact proposed action and reason | Preconditions | Main risk / expected effect | Validation | Rollback or recovery | Admin access |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-001, SEC-002 | Implement the selected privacy contract; if consent-based, move hosts to optional access and dynamic registration; if confidential, remove bookmark-dependent page-DOM output | Written owner decision, UX text, threat-model invariant, native permission plan | Permission churn or loss of automatic hiding / explicit, understood boundary and reduced exposure | Adversarial DOM, permission grant/revoke, upgrade, incognito, sender-regression tests | Revert the isolated change; restore prior manifest/registration from last release; disclose any behavior rollback | GitHub/Chrome-store admin only for published metadata/release; code itself no |
| TEST-001 | Correct search fixture generator and add browser assertions because current smoke is false | Freeze expected production selector shape | Harness may overfit another stale fixture / truthful regression evidence | Real-browser recognized/hidden/error/reveal assertions plus existing suite | Revert fixture/test commit and mark smoke blocked; never restore false pass claim | No |
| DOC-001 | Add exact owner-selected license and metadata | Owner choice and, if needed, legal review | Wrong license can be difficult to unwind / clear use and contribution rights | Exact canonical text and GitHub detection review | Revert before accepting external contributions/releases; seek legal guidance for already distributed versions | No for file; owner approval mandatory |
| BUG-001 | Replace suffix aliasing with verified host set | Confirm intended Literotica aliases | Intended old bookmark may stop matching / eliminate unknown-host collisions | Positive/negative normalization and integration tests | Revert isolated rule; document affected aliases | No |
| PERF-001 | Guard observer/bookmark refresh/process paths while disabled and rescan on enable | Define in-flight cancellation/status semantics | Missed updates after re-enable / lower idle work and data minimization | Request-count, in-flight disable, bookmark-change, re-enable tests; native smoke | Revert guard commit; disable optimization if stale visibility appears | No |
| TEST-002 | Add disposable-profile manual scripts/tests and evidence docs | Synthetic data/profile, no live credentials, stable Chrome version | Flakiness or profile leakage / release-relevant native evidence | Repeat from clean profile; inspect worker logs, permissions, incognito, bookmarks | Delete disposable profile through approved tooling; revert test automation; retain failure evidence | Native browser permission; no GitHub admin |
| DX-001 | Add pinned workflow for clean install, tests, syntax, later browser smoke | TEST-001 fixed; choose supported Node policy | Flaky/overly strict gate / automatic regression signal | Pass on clean branch; intentional failing test proves gate; dependency cache does not bypass lockfile | Revert workflow or temporarily make check non-required with documented incident | Admin only when making check required |
| REL-001 | Add deterministic allowlist packager, checksum, and release docs/workflow | Native baseline, CI, approved runtime file list | Missing runtime file or accidental sensitive inclusion / reproducible minimal archive | Inspect archive list/digest, unpack/load in disposable profile, rollback test | Withdraw draft release, revoke artifact, revert release commit; never overwrite published version | Yes for GitHub/Chrome-store release |
| ARCH-001 | Split/co-locate adapter contracts and enforce manifest/popup/fixture consistency | Green tests, frozen public adapter behavior | Broad refactor regression / lower drift cost | Migrate one adapter at a time; full tests, browser/native smoke, manifest diff | Revert each adapter increment independently | No |
| GH-001 | Configure rules for stable required checks and block force-push/deletion | DX-001 reliable, recovery/bypass owner named | Lockout from broken checks / protected default branch | Test a PR and authorized bypass/recovery procedure | Administrator relaxes/disables the specific rule; preserve audit log | Yes; explicit owner approval |
| GH-002 | Add metadata/security/contribution files and only supported templates/features | License/reporting owners and maintenance commitments | Stale promises/process burden / clearer public experience | Logged-out review, link/template test, community profile recheck | Revert files/settings individually; archive unsupported features | Metadata/settings require admin |
| FEAT-001 | Extend index/settings/popup for selected folder ancestry | Product spec, migration/rollback design, native baseline | False hides, lost preference compatibility, index cost / user-defined “saved” meaning | Unit/integration/native tests for descendants, duplicates, moves, deletes, imports, rollback | Feature flag/default-off, preserve old keys, revert code without deleting data | No; release admin when publishing |
| FEAT-002 | Add tested hide/dim/mark mode and restoration logic | UX spec and adapter visual baselines | Site-style corruption/inaccessible contrast / flexible visibility | DOM restoration, route/error/disable, keyboard/contrast/native visual checks | Default to existing hide mode; revert style/runtime increment | No; release admin when publishing |
| FEAT-005 | Add separately validated browser manifests/packages | Chrome release maturity and compatibility matrix | Multiplied support/security drift / broader distribution | Browser-specific lifecycle, permissions, private-mode, package tests | Stop publishing affected package; revert browser-specific adapter layer | Store/release admin |

Exploratory `FEAT-003` and `FEAT-004` authorize no repository mutation. Promotion requires a new reviewed specification containing the same precondition, risk, validation, rollback, and approval fields.

## Success Metrics

- All repository tests and 18 JavaScript syntax checks pass in clean local and CI environments.
- Literotica search browser smoke asserts nonzero recognition and the correct hidden/reveal/error behavior; documentation matches the observed result.
- The chosen `SEC-001` invariant has an adversarial regression test and a clear user disclosure/permission flow.
- A disposable-profile native matrix passes install, restart, bookmark events, popup, navigation, error recovery, and incognito cases.
- Disabled sites generate zero candidate-match requests for later DOM/bookmark changes until re-enabled.
- Unknown Literotica subdomains remain distinct; verified aliases, chapters, and meaningful parameters behave as specified.
- Release archives are deterministic, allowlisted, checksumed, loadable, and free of tests, profiles, exports, logs, and development dependencies.
- `main` has stable required checks and protected history after CI adoption.
- License, security, contribution, architecture, verification, and release documentation have named owners and no contradictory claims.
- Feature phases add measurable user value without expanding permissions, persistent personal data, or supported platforms implicitly.

## Recommended Execution Order

1. **SEC-001 / SEC-002 — Privacy decision.** It constrains permission, UI, architecture, documentation, and expansion. Complete when the owner approves one explicit invariant and its validation plan.
2. **TEST-001 — Correct harness evidence.** It is the smallest implementation increment and must precede CI. Complete after real-browser assertions and corrected docs pass alongside all 58 existing tests.
3. **DOC-001 — Add the selected license.** Public/release/contribution work depends on clear rights. Complete after owner review and GitHub detection.
4. **BUG-001 — Fix host normalization.** Bounded correctness change with direct regression tests; validate intended aliases and unknown hosts.
5. **PERF-001 — Stop disabled work.** Depends only on defined enable/disable semantics; validate zero requests while disabled and correct re-enable recovery.
6. **TEST-002 — Run the native matrix.** The stabilized behavior becomes the release baseline; record failures before fixing them.
7. **DX-001 — Add CI.** Gate clean install, tests, and syntax; deliberately verify that a failure blocks.
8. **REL-001 — Build allowlisted packaging.** Depend on CI/native evidence; verify archive contents, checksum, clean-profile load, and rollback.
9. **GH-001 / GH-002 — Harden and present the repository.** Protect `main` only after CI; add only governance features that will be maintained.
10. **ARCH-001 — Consolidate adapters.** Migrate one adapter at a time behind the now-automated behavior matrix.
11. **FEAT-001 — Add folder filters.** Validate data model and lifecycle edge cases before UI polish.
12. **FEAT-002 — Add display modes.** Validate style restoration and accessibility across native layouts.
13. **FEAT-003 / FEAT-004 / FEAT-005 — Reassess exploration.** Promote only with user evidence and complete privacy/maintenance costs.
