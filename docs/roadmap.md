# Bookmark Filter - improvement roadmap

## Goal

Develop the extension into a local browsing filter with better control over what
“already saved” means. Preserve conservative card detection, local processing, and
read-only bookmark access.

## Current baseline

- 58/58 automated tests passed.
- The initial repository baseline is committed and published at
  [NightScripted/bookmark-filter](https://github.com/NightScripted/bookmark-filter).
- Native Chrome behavior, service-worker sleep/wake, incognito, and live layouts remain
  unverified.
- Three supported sites still use experimental selectors.

## Phase 1: Reliability and release readiness

### 1. Establish version control and reproducible releases

- [x] Create a committed baseline.
- [ ] Add CI for tests and JavaScript syntax checks.
- [ ] Add an allowlisted release ZIP containing only extension assets.

### 2. Tighten Literotica URL normalization

- [ ] Replace blanket subdomain aliasing with an explicit list of equivalent hosts.
- [ ] Add regression tests proving unsupported subdomains do not create false matches.
- [ ] Preserve distinct chapters and meaningful URL parameters.

### 3. Stop unnecessary work while filtering is disabled

- [ ] Prevent DOM mutations from triggering scanning and bookmark-match requests.
- [ ] Restore hidden cards immediately when disabled.
- [ ] Perform a fresh scan when enabled again.
- [ ] Test disabled-state mutations and re-enabling.

### 4. Add native Chrome verification

- [ ] Evaluate Puppeteer extension testing with disposable profiles and synthetic
  bookmarks.
- [ ] Cover installation, reload, worker restart, bookmark changes, popup controls, and
  content-script injection.
- [ ] Verify incognito and supported live layouts separately.
- [ ] Keep simulated tests, native tests, and live-site verification clearly
  distinguished.

## Phase 2: Highest-value features

### 5. Filter by bookmark folder

- [ ] Allow selecting folders and whether descendants are included.
- [ ] Support workflows such as hiding “Finished” while keeping “To read” visible.
- [ ] Extend the index to retain the folder information needed for matching.
- [ ] Handle folder moves, deletion, and duplicate bookmarks correctly.

### 6. Add display modes

- [ ] Hide saved cards.
- [ ] Dim saved cards.
- [ ] Mark saved cards without hiding them.
- [ ] Preserve the site’s original styling and visibility when filtering is disabled.

### 7. Add per-card controls

- [ ] Reveal one hidden result.
- [ ] Keep an individual item visible.
- [ ] Clearly define whether exceptions last for the page, session, or persist.

### 8. Improve diagnostics

- [ ] Distinguish unsupported layouts, no recognized cards, and no bookmark matches.
- [ ] Provide a local diagnostic summary with counts, adapter version, and reason codes.
- [ ] Exclude bookmark URLs, titles, page contents, and raw browser errors.

### 9. Add convenience controls

- [ ] Add a keyboard shortcut for temporary reveal.
- [ ] Add a toolbar badge showing the current hidden count.

## Phase 3: Expansion

### 10. Make adapters easier to maintain

- [ ] Group each adapter’s URL rules, selectors, fixtures, and verification metadata.
- [ ] Centralize shared site configuration.
- [ ] Expand verified surfaces on existing sites before adding more sites.

### 11. Explore an optional “seen” list

- [ ] Add explicit “mark seen” and undo.
- [ ] Keep it separate from browser bookmarks.
- [ ] Make storage opt-in, provide deletion controls, and define incognito behavior.

### 12. Add optional per-site access

- [ ] Request access when users enable a site.
- [ ] Update content-script registration and permission-revocation handling accordingly.

## Recommended next release

Complete native verification, URL normalization fixes, disabled-state efficiency,
bookmark-folder selection, and hide/dim modes.
