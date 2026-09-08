# Project Analysis

## Executive Summary

Bookmark Filter is a small Manifest V3 Chrome extension that hides recognized cards on four supported site families when their normalized URLs appear in the user's Chrome bookmarks. It has no production backend, telemetry, runtime package dependency, or build step. Its strongest qualities are conservative card classification, bounded message batches, strict service-worker sender checks, fail-open recovery, focused local tests, and unusually candid notes about simulated versus native verification.

The repository is healthy for an early `0.2.0` prototype: the checked-in portable Node path ran all 58 tests successfully, every JavaScript file passed syntax checking, dependency metadata was consistent, and `npm audit` reported no known vulnerabilities. It is not release-ready. The principal risks are one architectural privacy boundary (`SEC-001`), a browser-harness fixture that invalidates the documented Literotica search smoke result (`TEST-001`), no native extension/lifecycle evidence (`TEST-002`), no CI (`DX-001`), and no license (`DOC-001`). Two planned implementation issues were independently confirmed: arbitrary Literotica subdomains are canonicalized to `www` (`BUG-001`), and disabled filtering still performs match work for later DOM mutations (`PERF-001`).

The recommended direction is incremental: first decide and document the privacy contract, correct the invalid verification evidence, tighten URL normalization and disabled-state behavior, then establish native Chrome validation, CI, and allowlisted packaging. Only after that baseline should the project prioritize bookmark-folder filtering and hide/dim/mark display modes. A rewrite or framework migration is not justified.

## Audit Baseline

| Field | Value |
| --- | --- |
| Repository | `NightScripted/bookmark-filter`; local root `C:\Users\zacha\Developer\web\bookmark-filter` |
| Audit type | Initial audit |
| Audit scope | Standard |
| Current branch | `main` |
| Default branch | `main` (public GitHub API) |
| HEAD revision | `265b8a749311e509f970efc00c57f6370eab1d27` |
| Comparison baseline | Initial commit `4f2c760`; two commits exist in total |
| Audit date | 2026-09-08, America/Denver |
| Working tree at start | Clean; `main` and `origin/main` had 0 commits of divergence |
| Worktrees | One: repository root on `main` |
| Tags | None |
| Environment | Windows, PowerShell, Chrome browser automation, Node `v24.20.0`, npm `11.19.0`, Git `2.46.1.windows.1`, GitHub CLI `2.97.0` |
| Available | Read/write repository filesystem, shell, Git, public GitHub API, web research, npm metadata/audit, portable Node, JSDOM tests, browser UI automation, dedicated repository security scan, read-only parallel reviewers |
| Unavailable or restricted | Native unpacked-extension automation, authenticated GitHub administration, repository rulesets/settings, valid `gh` authentication, production/live-site probing, global `node` on the current process PATH |

No root `ANALYSIS.md` or `ROADMAP.md` existed. `docs/roadmap.md` is a feature plan dated by repository history, not a prior audit, so this audit establishes the first stable finding lineage. No repository-owned `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or `SECURITY.md` was present; the task-supplied `AGENTS.md` policy and repository README/build instructions were followed.

## Audit Lineage Summary

This is the initial audit. There are no historical audit findings to mark persistent, resolved, reopened, or regressed. The existing `docs/roadmap.md` was verified item by item under **Existing Issue Verification** rather than treated as authoritative.

## Scope and Coverage

The repository contains 44 first-party paths when `.git`, `.idea`, `.venv`, and `node_modules` are excluded: 38 text/source/configuration paths and six generated PNG assets.

| Surface | Coverage | Notes |
| --- | --- | --- |
| `background/`, `content/`, `popup/`, `shared/` | Fully reviewed | All production JavaScript, HTML, and CSS; security-sensitive data flow received independent review |
| `manifest.json`, package metadata, scripts | Fully reviewed | Permissions, lifecycle scripts, lockfile, harness server, and icon generator |
| `test/` and fixtures | Substantially reviewed | All test modules and helper boundaries reviewed; tests executed; representative fixture/source alignment checked |
| README and `docs/` | Fully reviewed | Claims reconciled with implementation and current validation |
| Git history, branches, worktrees, refs | Fully reviewed for the two-commit history | No tags or additional branches exist |
| Public GitHub repository | Substantially reviewed | Public API metadata, branches, Issues, PRs, workflows, releases, and community profile |
| Generated icons | Sampled/generated | Provenance and generation script reviewed; binary pixels were not exhaustively audited |
| `node_modules/` | External dependency | Excluded from first-party review; manifest, lockfile, installed tree summary, deprecation metadata, and advisory result reviewed |
| `.venv/` | External development environment | Used only to establish scanner capability; not treated as project source |
| `.idea/` | Excluded | Editor metadata |
| Native Chrome extension runtime | Deferred/inaccessible | Unpacked load, real bookmarks, worker suspension/wake, incognito, and live layouts were not tested |
| GitHub administrative settings | Inaccessible | Authentication was invalid; rulesets, required checks, security features, social preview, and private project details could not be verified |

No live adult-content site, production system, third-party host, personal bookmark export, or discovered credential was accessed.

## Project Overview

- **Purpose and users:** A local desktop-Chrome browsing aid for users who want already-bookmarked items hidden from supported feeds and recommendations.
- **Features:** Per-site enablement, temporary reveal, bookmark-index status/retry, live bookmark invalidation, conservative card discovery, and URL identity normalization for Pornhub, XVideos, xHamster, and Literotica.
- **Stack:** Plain JavaScript, HTML, and CSS; Chrome Manifest V3 APIs; Node's built-in test runner; JSDOM as the only development dependency.
- **Platforms:** Desktop Chrome 110+ is declared. Other Chromium browsers and Firefox are not documented or verified.
- **Architecture:** A service worker reads the bookmark tree and keeps in-memory `Set` indexes by site. A content script observes supported pages, recognizes bounded card structures, sends candidate URLs in batches of at most 200, and applies a CSS class to matching containers. The popup reads settings/index/page status and sends controls to the worker or active tab.
- **Primary data flow:** `chrome.bookmarks.getTree()` -> site-specific URL normalization -> in-memory membership sets -> validated content-script candidate messages -> boolean match results -> page-owned DOM class/visibility.
- **Persistence:** Only per-site settings are intentionally persisted in `chrome.storage.local`; bookmark-derived indexes are rebuilt in memory. There is no database or migration that mutates bookmarks.
- **External services:** None in production. The development harness binds only to `127.0.0.1` and uses mocked Chrome APIs.
- **Build, deployment, release:** No compilation/build step, packaging command, CI workflow, tag, or release exists. The extension is loaded unpacked from the repository.
- **Maturity:** Functional early prototype (`0.2.0`) with good simulated coverage, incomplete native and release evidence, and three legacy site adapters explicitly marked live-unverified.

## Repository Structure

- `manifest.json` defines MV3 permissions, four site-family match patterns, popup, service worker, and split-incognito mode.
- `background/service-worker.js` owns settings, bookmark indexing, event invalidation, sender checks, and message dispatch.
- `content/adapters.js` contains URL identity rules, DOM selectors, candidate classification, and verification metadata for all sites.
- `content/content-script.js` contains mutation observation, bounded traversal, batching, retries, status, reveal, and hide behavior.
- `popup/` is the extension-owned control/status UI.
- `shared/` contains protocol limits and general URL normalization.
- `test/` contains unit, integration-style JSDOM/VM tests, production-shaped fixtures, and a synthetic browser harness.
- `scripts/browser-harness-server.js` serves only allowlisted local harness assets; `scripts/build-icons.ps1` deterministically resizes the master icon.
- `docs/verification.md` records evidence categories; `docs/roadmap.md` is the pre-audit feature plan.

The production code is compact and understandable. The main ownership weakness is that site configuration is duplicated between the manifest, adapters, popup labels/tests, and fixture conventions; `ARCH-001` addresses controlled consolidation without introducing an unnecessary framework.

## Validation Results

Dependency manifests, the lockfile, package scripts, the loopback server, and the icon script were inspected before execution. Existing `node_modules` was used; no install, upgrade, lockfile rewrite, deployment, publish, or external side-effect script ran.

| Check | Command or method | Result | Notes |
| --- | --- | --- | --- |
| Working tree baseline | `git status --short --branch` | Passed | Clean `main...origin/main`; Git warned that the sandbox could not read the user's global ignore file, but repository status remained available |
| Git integrity | `git fsck --no-dangling --no-progress` | Passed | No output |
| Documented npm test command | `npm.cmd test` | Blocked | Package script invokes bare `node`; global Node was absent from this process PATH. No tests started |
| Portable full suite | portable `node.exe --test "test/*.test.js"` | Passed | 58 passed, 0 failed, 0 skipped/todo; 13.016 s |
| Integration tests | Included in full suite | Passed | Connected worker/content bridge and UI modules ran under Node/JSDOM/VM |
| JavaScript syntax | portable Node `--check` over 18 `.js` files | Passed | 18/18 parsed |
| Coverage-enabled suite | portable Node `--experimental-test-coverage --test "test/*.test.js"` | Passed | 58 passed; measured files totaled 96.03% lines, 84.85% branches, 86.27% functions |
| Coverage scope | Node built-in coverage report | Partial | `content-script.js` and `popup.js` were omitted because the JSDOM/VM loading path is not instrumented; their tests passed but coverage is not quantitatively reconciled |
| Browser harness | Loopback server plus Chrome UI automation | Partially failed | Pornhub add/hide/reveal/error/retry flow passed. Literotica search add produced index total 1 but recognized/hidden count 0, confirming `TEST-001` |
| Native extension E2E | Unpacked extension with disposable profile/bookmarks | Unavailable | No native load, worker restart, incognito, or live-site run (`TEST-002`) |
| Installed dependency tree | `npm.cmd ls --depth=0` | Passed | `jsdom@26.1.0` matches the lockfile |
| Dependency advisories | `npm.cmd audit --package-lock-only --json` | Passed | 0 known vulnerabilities across the 39-package development tree at audit time |
| Dependency freshness | `npm.cmd outdated --json` | Attention | Exit 1 because `jsdom` 26.1.0 is behind 30.0.1; this is a major-version opportunity, not evidence of a vulnerability |
| Lint | Repository-provided linter | Unavailable | No lint command or configuration exists |
| Formatting | Repository-provided check | Unavailable | No formatter/check configuration exists |
| Type checking | Repository-provided check | Not applicable/unavailable | Plain JavaScript; no TypeScript or static type configuration |
| Dedicated security scan | Standard repository scan `2e7cc644-2902-4638-8c11-902aa4004c96` | Passed with one finding | One validated Medium finding; native-browser surface deferred. Canonical report/findings/coverage/SARIF were created outside the repository; per-finding Markdown was skipped by a workbench directory warning |
| CI alignment | Public workflows API and repository tree | Failed/missing | No workflow or required automated validation (`DX-001`) |
| Setup documentation | README commands versus environment | Partially passed | Absolute portable fallback works; the primary npm command needs Node on PATH, which this process lacked |

The coverage report's measured file details were: service worker 95.77% lines, adapters 95.27%, protocol 100%, and URL utilities 100%. These numbers must not be presented as whole-product coverage because popup/content runtime instrumentation is missing.

The loopback server was manually terminated after UI review. Its interrupt exit status is not a product test failure.

## Existing Issue Verification

| Existing item | Source | Lifecycle | Current status | Verification | Still relevant? | Recommended action |
| --- | --- | --- | --- | --- | --- | --- |
| Committed/published baseline | `docs/roadmap.md` | Already fixed | Confirmed | Two commits; local `main` equals public `origin/main` | Historical only | Keep as history |
| Add CI for tests and syntax | `docs/roadmap.md` | New audit tracking | Confirmed | No `.github/workflows` locally or publicly | Yes (`DX-001`) | Add after harness correction |
| Allowlisted release ZIP | `docs/roadmap.md` | New audit tracking | Confirmed | No release/package script, tags, or releases | Yes (`REL-001`) | Add deterministic package validation |
| Restrict Literotica host aliasing | `docs/roadmap.md` | New audit tracking | Confirmed | `hostname.endsWith(".literotica.com")` contradicts its comment; local reproduction maps `foo` and `www` to the same key | Yes (`BUG-001`) | Explicit equivalence list plus regression tests |
| Stop work while disabled | `docs/roadmap.md` | Partially implemented | Partially confirmed | Immediate restore and rescan-on-enable exist; a late recognized card caused one new match request while disabled | Yes (`PERF-001`) | Guard mutation/bookmark refresh and test re-enable |
| Native Chrome verification | README, verification, roadmap | New audit tracking | Confirmed gap | All documents correctly distinguish simulation; no native evidence | Yes (`TEST-002`) | Disposable-profile manual matrix, then automation |
| Bookmark-folder selection | `docs/roadmap.md` | Missing capability | Confirmed absent | Index stores only deduplicated site keys, not folder lineage | Yes (`FEAT-001`) | Product-design and data-model increment after stabilization |
| Hide/dim/mark modes | `docs/roadmap.md` | Missing capability | Confirmed absent | Runtime supports hide and temporary reveal only | Yes (`FEAT-002`) | Add after native baseline |
| Per-card controls | `docs/roadmap.md` | Missing capability | Confirmed absent | No exception state or per-card UI | Later (`FEAT-003`) | Validate persistence semantics first |
| Improve diagnostics | `docs/roadmap.md` | Improved/partial | Partially confirmed | Popup already distinguishes unsupported/no cards/no matches/index error and reports counts/reason codes; adapter version/exportable local summary are absent | Partly | Narrow scope; do not duplicate existing work |
| Shortcut and badge | `docs/roadmap.md` | Missing optional capability | Confirmed absent | No commands or badge API in manifest/runtime | Low-value now | Defer pending user demand |
| Modular adapters/site registry | `docs/roadmap.md` | New audit tracking | Confirmed debt | One adapter module and duplicated site lists/metadata | Yes (`ARCH-001`) | Consolidate incrementally with manifest validation |
| Optional seen list | `docs/roadmap.md` | Exploratory | Not a defect | No storage model exists; privacy/incognito semantics unresolved | Maybe (`FEAT-004`) | User validation before commitment |
| Optional per-site access | `docs/roadmap.md` | New audit tracking | Confirmed absent | All host permissions/content scripts are installed for all supported sites | Yes (`SEC-002`) | Evaluate as part of `SEC-001` privacy decision |
| All four Literotica browser smokes passed | README and `docs/verification.md` | Regressed evidence | False for current harness | Search generator creates `h4 > a.ai_ii`; production requires `div.ai_iG > a.ai_ii`; runtime smoke recognized zero | No | Correct `TEST-001` and documentation |

The global TODO/FIXME/HACK/BUG/XXX/skip search found no first-party source markers or skipped tests. It found one transitive deprecation notice for `whatwg-encoding@3.1.1`, reached through the development-only JSDOM tree. That notice alone does not justify a risky major upgrade.

## Finding History

Not applicable: this is the first root audit. Stable IDs below establish the lineage for future audits.

## Active Findings

### Medium

#### SEC-001 — Supported-site scripts can infer same-site bookmark membership

- **Category / lifecycle / validation:** Security and privacy; New; Validated finding (CWE-203).
- **Affected components:** `manifest.json:8`, `background/service-worker.js:31`, `background/service-worker.js:72`, `background/service-worker.js:145`, `content/content-script.js:226`, `content/content-script.js:84`, `content/styles.css:1`.
- **Evidence and path:** A supported page controls its DOM and can insert selector-compatible cards for chosen, recognized same-site URLs. The service worker builds membership sets from the full bookmark tree and returns a boolean for each content-script candidate. A positive result adds `bookmark-filter-hidden` to the page-owned container; CSS applies `display: none !important`. Chrome isolates JavaScript variables, but its official content-script model explicitly allows scripts to read and change the page DOM, so the page can observe the class or layout difference.
- **Preconditions and constraints:** The user must install the extension, grant bookmark/host access, enable the site, and visit a supported origin. Sender validation requires the extension's own top frame and matching site. Guesses are limited to recognized same-site content URLs; titles, folders, the full tree, and cross-site bookmark URLs are not returned.
- **Impact:** A supported site's first-party or compromised third-party script can test sensitive-interest membership for guessed content URLs. This is Medium rather than High because reach is constrained and the attacker receives one bit per guess, not a bookmark dump.
- **Verification:** Complete static source-to-sink trace; two independent reviewers; false-positive checks for sender, origin, frame, normalization, and batch limits. No live-site exploit was attempted.
- **Remediation:** Make an explicit product decision. Either accept/disclose the trust boundary and require informed per-site opt-in host access, or move bookmark-derived results to an extension-owned UI that page scripts cannot observe. Secret class names and rate limits do not restore confidentiality.
- **Confidence / disposition:** High; scheduled first in the roadmap.

#### TEST-001 — Literotica search harness does not exercise the production selector

- **Category / lifecycle / validation:** Test quality and documentation evidence; New; Reproduced.
- **Affected components:** `content/adapters.js:248`, `test/browser-harness/index.html:125`, `docs/verification.md:9`, `README.md:35`.
- **Evidence:** Production accepts a search card only when `div.ai_iG > a.ai_ii` exists. The harness constructs `div.ai_iG > h4 > a.ai_ii`. In Chrome against the loopback harness, adding a synthetic bookmarked search card produced an index total of 1 but content status remained `recognized=0`, `hidden=0`, and the card stayed visible. The checked-in fixture and integration test use the production-compatible direct-anchor shape, explaining why the 58-test suite still passes.
- **Expected / actual:** Expected the browser harness's documented search smoke to recognize and hide the bookmarked card; actual behavior recognizes no candidate.
- **Impact:** Browser evidence for the most specifically claimed live-inspected surface is a false positive and cannot detect a production/harness selector regression.
- **Remediation:** Align the generator with the recorded/fixture DOM, automate assertions for recognized and hidden counts in a real browser harness test, and correct verification claims until it passes.
- **Confidence / disposition:** High; scheduled in Phase 0/1 before CI treats the harness as a gate.

#### TEST-002 — Native Chrome lifecycle and live-site behavior remain unverified

- **Category / lifecycle / validation:** Test coverage; New; Confirmed missing capability, not a confirmed runtime bug.
- **Affected components:** Manifest injection/permissions, service-worker wake/rebuild, popup messaging, split incognito, all adapters.
- **Evidence:** README, verification matrix, and adapter metadata explicitly mark native behavior unverified; this audit had no safe native unpacked-extension channel. JSDOM and the loopback harness mock Chrome APIs and cannot establish service-worker suspension, permissions, incognito separation, or current live-site DOM behavior.
- **Impact:** Release-critical behavior can regress despite all local tests passing, particularly worker restart, real bookmark events, injection, and three legacy live-unverified selectors.
- **Remediation:** Use a disposable Chrome profile and synthetic bookmarks for a documented manual matrix, then automate stable synthetic lifecycle cases. Treat live-layout checks as a separate, consented maintenance process.
- **Confidence / disposition:** High; scheduled in Phase 1.

#### DX-001 — No automated validation runs on repository changes

- **Category / lifecycle / validation:** Developer experience/reliability; New; Confirmed.
- **Affected components:** Repository-wide; GitHub Actions/required checks.
- **Evidence:** No local or public workflow exists. The tests and syntax commands are manual, and the default branch has no protection. The current suite passes when invoked through the portable Node fallback.
- **Impact:** A public change can land without any test or syntax evidence, and environment-specific PATH assumptions are easy to miss.
- **Remediation:** Add a minimal pinned Node CI workflow for clean install, tests, and syntax checking after `TEST-001`; later add allowlisted package validation and coverage reporting that accounts for VM-loaded scripts.
- **Confidence / disposition:** High; scheduled in Phase 1/2.

#### DOC-001 — The public repository has no license

- **Category / lifecycle / validation:** Documentation/repository governance; New; Confirmed.
- **Affected components:** Repository root and public GitHub presentation.
- **Evidence:** No `LICENSE`/`COPYING` file exists and the public GitHub API reports no detected license.
- **Impact:** Public visibility does not grant reuse, contribution, or redistribution rights; prospective users and contributors cannot determine permitted use.
- **Remediation:** The owner must choose an appropriate license, add the exact canonical text, and align README/package/release metadata. This is a legal/product choice, not an automated assumption.
- **Confidence / disposition:** High; owner decision scheduled in Phase 0.

### Low

#### BUG-001 — Arbitrary Literotica subdomains collapse to the `www` identity

- **Category / lifecycle / validation:** Correctness; New; Reproduced.
- **Affected components:** `content/adapters.js:187-195`, normalization tests.
- **Evidence:** A comment says not to alias arbitrary subdomains, but the condition uses `hostname.endsWith(".literotica.com")`. A direct reproduction normalized both `https://foo.literotica.com/s/story` and `https://www.literotica.com/s/story` to `literotica:url:https://www.literotica.com/s/story`.
- **Impact:** Distinct or unsupported subdomains can produce false bookmark matches and hide an unrelated card with the same path. Evidence of a current real-world collision was not established, keeping severity Low.
- **Remediation:** Alias only verified equivalent hosts and add positive/negative host regression cases while preserving chapter/query identity.
- **Confidence / disposition:** High; scheduled in Phase 1.

#### PERF-001 — Disabled filtering still scans and sends match requests for later mutations

- **Category / lifecycle / validation:** Performance/privacy minimization; New; Reproduced.
- **Affected components:** `content/content-script.js:262-309`, `content/content-script.js:334-341`, `content/content-script.js:390-418`.
- **Evidence:** Disabling clears current discovery and reveals cards, but the always-active observer scans additions without checking `filterEnabled`; `process()` also has no disabled guard. A JSDOM reproduction added one recognized card after disable and observed match-request count increase from 1 to 2.
- **Impact:** Disabled sites still consume DOM traversal/message/index work and continue transmitting candidate URLs within the local extension boundary. Existing cards are correctly restored, so this is not a functional failure or external disclosure.
- **Remediation:** Short-circuit observation/processing while disabled, clear queued work, rescan once when re-enabled, and add late-mutation/bookmark-change regression tests.
- **Confidence / disposition:** High; scheduled in Phase 1.

#### ARCH-001 — Site rules and verification metadata are spread across coupled surfaces

- **Category / lifecycle / validation:** Architecture/maintainability; New; Confirmed debt.
- **Affected components:** `manifest.json`, `content/adapters.js`, popup labels, fixtures/tests, verification documentation.
- **Evidence:** Host patterns are repeated in the manifest and adapter registry; all adapter URL rules, selectors, and verification notes share one module; harness fixture construction independently reimplements shapes, producing `TEST-001`. Manifest tests mitigate but do not eliminate drift.
- **Impact:** Updating a site requires synchronized edits across multiple representations, making stale verification and permission drift more likely.
- **Remediation:** Establish a small canonical site/adapter contract and test every consumer. If manifest generation is introduced, keep output deterministic and reviewable; do not adopt a framework solely for consolidation.
- **Confidence / disposition:** High; scheduled in Phase 2 after behavior is stable.

#### REL-001 — Releases are not reproducible or allowlisted

- **Category / lifecycle / validation:** Reliability/release engineering; New; Confirmed.
- **Affected components:** Package scripts, GitHub releases/tags, distribution process.
- **Evidence:** No release script, package allowlist, tag, GitHub release, or release workflow exists. `.gitignore` excludes ZIP/CRX artifacts but does not define their contents.
- **Impact:** A manually assembled extension can omit required assets or include tests, local data, or development files.
- **Remediation:** Define a deterministic allowlist, validate manifest-referenced files inside the archive, produce checksums, and document install/rollback. Never package profiles/bookmark exports.
- **Confidence / disposition:** High; scheduled in Phase 1/2.

#### GH-001 — `main` is publicly unprotected and has no required checks

- **Category / lifecycle / validation:** GitHub administration; New; Confirmed from public branch metadata.
- **Affected components:** Default branch governance.
- **Evidence:** Public API reports `main` as the only branch and `protected: false`; no workflow exists to require.
- **Impact:** Accidental direct changes receive no server-side validation or review enforcement. Risk is limited by the repository's early, apparently single-maintainer state.
- **Remediation:** After CI is stable, enable branch protection/rules requiring the essential workflow and preventing force-push/deletion. This requires authenticated administrative access and explicit owner approval.
- **Confidence / disposition:** High; scheduled after `DX-001`.

#### GH-002 — Public metadata and contributor/security entry points are incomplete

- **Category / lifecycle / validation:** GitHub/public experience; New; Confirmed.
- **Affected components:** Repository metadata and community files.
- **Evidence:** Public API reports null description/homepage/license, no topics, no issues/PR templates, no `CONTRIBUTING.md`, `SECURITY.md`, or code of conduct, and a 14% community profile. The README has no screenshot/demo or status badges.
- **Impact:** Users cannot quickly evaluate scope/support, and contributors lack reporting and change guidance. Some omissions may be intentional for a personal prototype.
- **Remediation:** Add concise metadata and minimum governance files first; add templates/code of conduct only if external contribution is invited. Social preview requires manual GitHub review.
- **Confidence / disposition:** High; scheduled in the documentation/GitHub plan.

### Informational

#### SEC-002 — Host access is granted to every supported site family by default

- **Classification:** Defense-in-depth/privacy consent opportunity; not a standalone vulnerability.
- **Evidence:** `manifest.json:8-12` and `:31-40` declare wildcard host access and static content scripts for all four families; default settings enable all adapters. A disabled setting does not revoke host access or stop the script (`PERF-001`). Chrome's permissions documentation recommends optional permissions where functionality permits so users can make an informed, per-feature choice.
- **Recommendation:** Evaluate `optional_host_permissions` plus dynamic content-script registration as part of `SEC-001`. The change has permission-revocation, upgrade, and native-testing complexity and should not be applied as a cosmetic manifest edit.
- **Disposition:** Scheduled with the privacy design; High confidence.

## Security and Privacy Assessment

### Validated Security Findings

`SEC-001` is the sole validated vulnerability: same-site bookmark membership can become observable to the untrusted page through a shared-DOM visibility signal. The dedicated scan assigned Medium severity and High confidence.

### Partially Validated Findings

None. A reviewer proposed treating sustained DOM mutation as resource exhaustion; reconciliation rejected it as a security vulnerability because the page can already consume its own renderer resources and privileged work is sliced/batched. The same evidence supports performance hardening, particularly `PERF-001`, but not a security severity claim.

### Risks Requiring Verification

- Native Chrome enforcement and lifecycle: sender metadata, service-worker suspension/rebuild, permission UX, and split-incognito behavior (`TEST-002`).
- Deep/pathological bookmark trees: recursive index traversal is clear in source, but no realistic Chrome bookmark-depth failure was reproduced.
- Current live selectors on Pornhub, XVideos, and xHamster, plus ambiguous Literotica homepage/news/promotions. These are reliability/accuracy proof gaps, not security findings.

### Defense-in-Depth Opportunities

- `SEC-002`: request site access only when a user enables that site and stop processing when disabled.
- Add adversarial tests proving top-frame, extension ID, claimed-site, URL-length, token-length, and batch-count guards remain intact.
- Keep diagnostics free of raw bookmark URLs, titles, page content, and browser error strings.
- Add a root `SECURITY.md` defining supported versions, private reporting, the page/extension trust boundary, and the no-production-probing rule.

### Security Strengths

- The worker verifies extension identity, top frame, supported sender origin, and claimed site before answering content requests.
- Protocol limits cap candidates at 200 and constrain site, token, and URL lengths.
- Adapter normalization rejects unsupported protocols/routes and avoids sending bookmark trees, titles, folders, or counts per URL.
- The UI writes status through `textContent`; no unsafe HTML sink, `eval`, network fetch, native messaging, externally connectable interface, update URL, or web-accessible resource was found in production.
- Index failures fail open: cards are restored and errors are reduced to stable local codes.
- Production has no telemetry or remote service. Only per-site settings are persisted.
- The test harness is loopback-only, serves a fixed allowlist, accepts only GET/HEAD, and has no proxy.
- The lockfile advisory check found no known vulnerabilities at audit time.

## Reliability Assessment

The index uses generations and a single rebuild promise to avoid publishing a tree invalidated during an asynchronous rebuild. Bookmark events invalidate the index; import events suppress intermediate notification; content tabs receive refresh messages. Content scanning uses node/time budgets, root coalescing, candidate deduplication, bounded batches, generation checks, and three finite retries. Popup mutations use pending states and restore settings after errors. These are strong safeguards for a small extension.

Confirmed weaknesses are the disabled-state work leak (`PERF-001`) and absent native lifecycle evidence (`TEST-002`). There is no rollback-tested release artifact (`REL-001`). Offline behavior is effectively local-only; the relevant failure mode is Chrome API/worker unavailability, which restores content rather than leaving it hidden. No data-loss path was found because bookmarks are read-only and settings writes are narrow.

## Performance Assessment

No real-browser performance bottleneck was measured. The current full test suite exercises large synthetic discovery/root-storm cases, and source bounds traversal to 200 nodes or approximately 8 ms per slice, 200 candidates per batch, and 256 pending roots before document coalescing. Existing verification records a large reduction in `Node.contains` calls, but this audit did not reproduce a production timing benchmark.

Strong evidence of avoidable work exists only for `PERF-001`. Other profiling candidates—not confirmed defects—are full bookmark-tree rebuilding after every relevant bookmark invalidation, persistent per-tab candidate sets on highly dynamic infinite feeds, and aggregate work under sustained mutations. Profile these in native Chrome before optimizing.

## Architecture Assessment

### Strengths

- Small dependency-free production surface and no build-tool coupling.
- Clear privilege split: bookmarks/storage in the worker, page discovery in content scripts, controls in the popup.
- Pure URL/adaptor functions are readily testable.
- Conservative detection favors visible false negatives over destructive false positives.
- Stable local error codes and fail-open behavior reduce accidental content loss.

### Weaknesses

- The core output crosses back into attacker-observable page DOM (`SEC-001`).
- Adapter/site/fixture metadata can drift (`ARCH-001`, demonstrated by `TEST-001`).
- Static wildcard injection couples permission grant to every supported site (`SEC-002`).
- Release and native validation are external/manual rather than part of an executable product boundary (`TEST-002`, `REL-001`).

### Technical Debt

`content/adapters.js` combines four domains' route identities, selectors, and verification metadata. Manifest patterns cannot directly consume that module, so consolidation needs either robust cross-check tests or deterministic manifest generation. The service worker's full-tree index is simple and appropriate now; folder filtering will require retaining folder ancestry and duplicate membership rather than merely adding popup controls.

### Scalability and Future Constraints

Adding sites multiplies host permissions, selector maintenance, live verification cost, and the `SEC-001` privacy surface. Folder filters change data ownership and invalidation semantics. A persistent seen list adds deletion, quota, migration, rollback, and incognito requirements. These are architectural dependencies, not reasons for a rewrite.

### Recommended Architectural Improvements

1. Decide the privacy boundary before extending the supported-site set.
2. Define an adapter contract that co-locates identity rules, selector fixtures, and verification status while testing manifest/popup consistency.
3. Make disabled state an actual processing boundary.
4. Add folder-aware index data only behind regression tests for moves, deletions, descendants, duplicates, and incognito.
5. Keep the current vanilla stack until product scope produces evidence that a build system or UI framework reduces more cost than it adds.

## Test and Quality Assessment

The 58 tests cover URL normalization, adapter fixtures and negatives, manifest invariants, worker sender validation/index invalidation/error recovery, content scan batching/mutations/routes, popup state/error rollback, and an integration-style worker/content bridge. Assertions are generally behavior-oriented. The passing suite plus browser failure is useful evidence that test layers are genuinely distinct.

The largest gaps are native Chrome (`TEST-002`), automated browser-harness assertions (`TEST-001`), and CI (`DX-001`). Built-in coverage excludes VM-loaded popup/content scripts, so the 96.03% line number is not repository-wide. There is no lint/format/type configuration. Security-critical sender and protocol paths are tested, but no test models a malicious supported page observing the hiding signal; add that only after the `SEC-001` product decision defines the expected invariant.

## Accessibility and UX Assessment

Static popup review found good fundamentals: `lang`, a labeled main heading, a fieldset/legend, label-associated checkboxes with accessible names, semantic buttons, polite status regions, and text (not color alone) for state. The Chrome harness showed clear ready, hidden-count, reveal, unavailable, and retry states, and the filter fails open on error.

No confirmed accessibility defect is reported. Keyboard traversal, focus behavior after async updates, screen-reader announcement quality, forced-colors, contrast under browser themes, zoom/scaling, and reduced-motion behavior were not verified in a native popup. The fixed 300 px width and default controls should be checked manually but are not defects on static evidence alone. UX should also explain the permission/privacy choice resulting from `SEC-001`/`SEC-002`.

## Documentation Assessment

| Document | Status | Problems | Recommended action |
| --- | --- | --- | --- |
| `README.md` | Strong but inaccurate in one evidence claim | Says all browser smokes passed; lacks `SEC-001` trust-boundary disclosure, license, release install path, and concise status badge/demo | Update after fixes; keep as primary user/setup entry point |
| `docs/verification.md` | Valuable evidence separation; one false result | Literotica search harness claim conflicts with current generator/runtime | Correct immediately; record command/environment and native proof gaps |
| `docs/roadmap.md` | Useful historical plan, now superseded | Mixes verified work, product ideas, and ordering that predates the privacy finding | Preserve; later mark superseded/link to root `ROADMAP.md` rather than delete silently |
| `assets/icons/README.md` | Accurate provenance | No material issue found | Keep |
| `LICENSE` | Missing | Rights and redistribution undefined (`DOC-001`) | Create after owner chooses license |
| `SECURITY.md` | Missing | No private reporting/support scope or threat-boundary guidance | Create |
| `CONTRIBUTING.md` | Missing | No supported setup, validation, generated-asset, or PR expectations | Create if contributions are accepted |
| `CHANGELOG.md` | Missing | No release history; no releases yet | Create with first distributable release, not retroactive boilerplate |
| Architecture document | Missing | Core data flow/privacy decision currently lives across code and README | Create a concise `docs/architecture.md` after `SEC-001` decision |
| Release guide | Missing | No allowlist, checksum, install, rollback, or verification process | Create with `REL-001` |
| Code of conduct/support policy | Missing/conditional | Value depends on whether external community contribution is invited | Add only when maintainers commit to that process |

Recommended structure: keep README concise and user-facing; use `docs/architecture.md` for trust/data flow, `docs/verification.md` for current evidence, `ROADMAP.md` for planned work, `SECURITY.md` for reporting/security scope, `CONTRIBUTING.md` for development validation, and a release guide/changelog when distribution begins. Preserve `docs/roadmap.md` as linked historical context until an explicit archival change is approved.

## GitHub Repository Assessment

Public GitHub API evidence on 2026-09-08 showed a public repository with `main` as default, no description, homepage, topics, detected license, workflows, releases, tags, Issues, or Pull Requests. Issues/projects/wiki are enabled, Discussions are disabled, and the community profile score is 14%. The sole `main` branch matches local HEAD and is not protected. There is no contributor/security/template surface. The repository is only hours old, so absence of backlog and releases is not evidence of abandonment.

Recommended public improvements are: choose a license; add a concise description and topics; correct the README verification claim; add a small screenshot/GIF only if it can avoid sensitive site/bookmark data; add CI; publish checksummed allowlisted releases; add `SECURITY.md` and contribution guidance; then protect `main`. Issue/PR templates, milestones, Projects, funding, wiki, and Discussions should be enabled only when there is a real maintenance process for them.

`gh auth status` reported invalid configured authentication, so branch rulesets, required checks, security/advisory settings, Dependabot configuration, social preview, private projects, and repository administration were not inspected. No GitHub state was modified. Public evidence sources were the [repository API](https://api.github.com/repos/NightScripted/bookmark-filter) and [community profile API](https://api.github.com/repos/NightScripted/bookmark-filter/community/profile).

## Branch Assessment

The preferred branch name is already in use; no migration is required. `refs/remotes/origin/HEAD` is not configured locally, but the public repository declares `main` as default.

| Branch | Last activity | Merge status | Associated PR | Unique commits | Worktree/active use | Recommended action | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `main` / `origin/main` | 2026-09-08 09:34:53 -0600 | Local and remote aligned | None public | 0 relative to tracking ref | Current/only worktree; default branch | Keep | Sole current branch and audit baseline |

There are no local or remote branches safe to delete, needing review, carrying unique work, requiring preservation/merge, or needing rename. No branch or tag operation was performed.

## Product and Feature Opportunities

### Near-Term Improvements

- **FEAT-001 — Bookmark-folder filtering:** High user value and strong fit with the product's definition of “already saved.” Medium complexity because the index must preserve ancestry, duplicates, moves, and deleted folders. Target after stabilization and native baseline.
- **FEAT-002 — Hide/dim/mark modes:** High discoverability/reversibility value, low-to-medium complexity. Must restore original style exactly and be tested on all adapter surfaces.
- Narrow diagnostics to adapter version/verification status and safe counts. The popup already implements most previously proposed status distinctions.

### Larger Feature Opportunities

- **FEAT-003 — Per-card exceptions:** Useful for selective revisiting, but persistence/session semantics and selector churn increase complexity. Validate user need before storing exceptions.
- A guided permission setup for `SEC-002` could become a user-facing privacy feature rather than only hardening.

### Platform or Integration Opportunities

- **FEAT-005 — Cross-browser packaging:** Edge may be low-cost after Chrome release maturity; Firefox requires API/manifest/incognito validation. Medium strategic fit, but defer until the Chrome lifecycle and privacy contract are stable.

### Experimental Ideas

- **FEAT-004 — Optional seen list:** Could serve users who do not bookmark everything, but creates new personal-data persistence, deletion, quota, rollback, and incognito obligations. Validate demand and define retention before design.
- Local diagnostics export containing only adapter version, counts, reason codes, and environment—not URLs, titles, page text, or raw errors.

### Alternative Product Directions

An extension-owned review panel could display bookmark matches without writing match-dependent state into page DOM. This would materially change the “automatically hide” experience but is the strongest confidentiality-preserving response to `SEC-001`. Prototype only after user research compares privacy value with workflow cost.

### Ideas Not Recommended

- Do not add more sites before native-verifying the current four and deciding `SEC-001`; every site adds permission, privacy, and selector maintenance cost.
- Do not add cloud sync, accounts, telemetry, or server-side bookmark processing; they conflict with the current local-only advantage without evidence of demand.
- Do not adopt fuzzy/ML card detection: false hides and opaque maintenance outweigh value for this conservative filter.
- Do not migrate to a framework or rewrite the extension; present complexity does not justify it.
- Do not commit a persistent seen list or per-card database until deletion, migration, rollback, and incognito behavior are explicit.

## Recommended Priorities

1. Decide the `SEC-001` confidentiality/consent contract and the role of optional host access (`SEC-002`).
2. Correct `TEST-001` and the associated README/verification claims so future automation starts from truthful evidence.
3. Choose a license (`DOC-001`) and document the security/reporting boundary.
4. Fix `BUG-001` and `PERF-001` with focused regression tests.
5. Establish disposable-profile native validation (`TEST-002`) before calling the extension release-ready.
6. Add CI (`DX-001`), deterministic allowlisted packaging (`REL-001`), then branch protection (`GH-001`).
7. Consolidate adapter contracts incrementally (`ARCH-001`) and improve public metadata/governance (`GH-002`).
8. Implement `FEAT-001`, then `FEAT-002`; validate later opportunities before commitment.

## Limitations

- Native unpacked-extension execution, real Chrome bookmarks, service-worker suspension/wake, permission prompts, incognito, and live-site behavior were unavailable.
- The adult-content sites in the manifest were not visited or probed; live selector notes were assessed only as repository evidence.
- GitHub authentication was invalid. Only public APIs/local refs were used; rulesets, required checks, security settings, Dependabot, social preview, administrative metadata, and private project content remain unverified.
- The environment's global PATH did not expose Node. The repository's absolute portable fallback worked; the README's “new terminal” PATH claim was not independently verified.
- No linter, formatter, type checker, CI, or packaging validator exists. Their checks are unavailable rather than passed.
- Coverage instrumentation omitted popup/content VM-loaded sources; no repository-wide percentage is claimed.
- No production telemetry, users, crash data, accessibility technology, browser performance profiler, or long-running mutation profile was available.
- `npm audit` and version status are point-in-time registry evidence, not guarantees of dependency safety.
- The dedicated scan was comprehensive for first-party static surfaces but deferred native Chrome. Its canonical report was generated outside the repository; a workbench warning skipped the separate per-finding Markdown file.
- No secret values were copied or used. No external exploit, production probe, dependency installation, source fix, cleanup, branch mutation, GitHub mutation, or push occurred.
