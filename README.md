# Bookmark Filter

Bookmark Filter is a plain-JavaScript Manifest V3 extension. It hides already-bookmarked, recognized result cards from supported pages; it never changes bookmarks.

First-phase creator highlighting also marks eligible cards that contain an explicit supported same-site creator/profile link for a bookmarked creator. The card receives a modest accent outline and a real `Bookmarked creator` badge; saved media still takes precedence for hiding, and reveal mode may show `Saved · Bookmarked creator`. Creator matching is URL-derived and does not use names, history, timestamps, or persistent creator data.

Creator route families are intentionally narrow. Pornhub MODEL bookmarks support the direct `/model/<handle>` route and its `/videos`, `/clips`, `/photos`, `/gifs`, `/stream`, `/playlists`, and `/about` tabs as one identity; each card still needs an explicit creator link. XVideos and xHamster creator routes remain experimental. Literotica supports `/authors/<handle>` plus its `/works` and `/works/stories` variants as one identity; the legacy synthetic-only `/author/<handle>` form is intentionally omitted.

The target is desktop Chrome. “New” means unbookmarked; reposts or copies with different identifiers remain visible. Cards may briefly appear before filtering completes.

The extension runtime has no network requests, server, or telemetry, and never writes bookmarks. The loopback harness server is development-only and is not part of the extension runtime.

There is no extension build step and no runtime package dependency. The test-only development dependency is `jsdom`. Package metadata is version `0.2.0`. A portable Node.js 24.20.0 installation is available at `C:\Users\zacha\Developer\tools\node\node-v24.20.0-win-x64`; it is also available on the user PATH in a new terminal.

## Install and develop

1. Open `chrome://extensions`.
2. Enable Developer mode and choose **Load unpacked**.
3. Select this repository folder.
4. Leave all four site settings enabled (all are true by default).

After source changes, reload the extension and reload already-open supported website tabs. The extension uses Chrome's bookmarks API read-only; the required `bookmarks` permission is unavoidable for that API. Preferences are shared across normal and incognito contexts, while split-incognito execution keeps each context's runtime state separate. To test incognito, open the extension details page, enable **Allow in incognito**, and use a separate incognito window.

From a new terminal, use the absolute project path:

```text
cd C:\Users\zacha\Developer\web\bookmark-filter
npm.cmd ci
npm.cmd test
npm.cmd run harness
```

The portable Node path is for direct test invocation when `node` is not on PATH: `& 'C:\Users\zacha\Developer\tools\node\node-v24.20.0-win-x64\node.exe' --test "test/*.test.js"` in PowerShell. The `npm.cmd` commands above assume npm is available on PATH. Rebuild derived icons only when their source artwork changes: `powershell -ExecutionPolicy Bypass -File scripts/build-icons.ps1`.

Run the harness only after its loopback server is ready, then open `http://127.0.0.1:4177/?site=pornhub`; changing the site selector reloads the page with a clean production content-script instance. For the Literotica-derived surfaces use `?site=literotica&surface=search`, `tags`, `top`, or `similar`; use `&index=error` to exercise the popup retry state. The harness includes synthetic creator-profile bookmarks and explicit creator links; use **Add creator card** and **Toggle creator bookmark** to exercise creator-only matching. The harness uses mocked Chrome APIs, synthetic or live-derived adapter markup, production content CSS, the actual `content-script.js`, and the actual `popup.js`. Its bookmark matching calls the production normalizer, and its visible status comes from actual runtime message handlers. The local automated connected tests are a separate Node/jsdom/VM production-message bridge; browser-harness loopback checks are a separate simulated UI category. Neither category is native verification; keep their results separate from native claims. Native extension loading, service-worker sleep/wake, and incognito behavior require manual verification because `chrome://extensions` automation is blocked.

## Verification status

Saved Pornhub HTML captures were inspected on 2026-09-12 and reduced to sanitized fixtures with adapter and connected production coverage. The local suite and production syntax checks are reported in [the verification matrix](docs/verification.md); live/native Pornhub behavior remains unverified. The capture counts and fail-open boundaries are documented in [the Pornhub capture evidence](docs/pornhub-captures.md).

## What is stored

The extension stores per-site enabled/disabled preferences only. Temporary reveal is limited to the current page/route. It does not store bookmarks, bookmark counts, tab history, telemetry, or remote data. Existing legacy `enabledBySite` preferences are read as a fallback for newer per-site keys. A rollback to an older build does not read newer per-site-only changes, so verify settings after rollback; no destructive preference migration is performed.

## Support status

| Site | Status | Boundary |
| --- | --- | --- |
| Literotica search | 2026-09-12 live author evidence; harness fixture added | `div.panel.ai_gJ` with `div.ai_iG > a.ai_ii > h4`; creator authors use `/authors/<handle>/works`. Only recognized `/s/` links are eligible. |
| Literotica tags | 2026-09-12 live `_1epno_` evidence; `_ohlxb_` is historical | `article._card_1epno_16` with `_content_1epno_58`, `_title_1epno_54`, and `_title_link_1epno_69`. |
| Literotica top stories | 2026-09-12 live `_1epno_` evidence; `_ohlxb_` is historical | Same `_1epno_` article/content/title shape plus `_most_read_1epno_670`. |
| Literotica similar stories | Historical detail evidence only; current `_item_1m9b4_7` not observed in this pass | Legacy `div._widget_list_1m9b4_1 > div._item_1m9b4_7 > a._widget_link_1m9b4_62` remains experimental. |
| Literotica series navigation | Intentionally unfiltered | `div._data_list_pv6fa_1 > div._item_pv6fa_7` is navigation, not a content-card target. |
| Literotica homepage/news/promotions | Unverified | Ambiguous structures remain visible; no verified claim is made. |
| Pornhub | Saved HTML inspected; live/native unverified | `/`, `/video/search`, and `/model/<handle>` captures support the existing narrow card selector. MODEL tab aliases normalize to the same creator; cards require explicit creator anchors and homepage context is never inherited. |
| XVideos | Experimental legacy | Narrow legacy selectors and synthetic URL fixtures only; live layout safety was previously blocked. |
| xHamster | Experimental legacy | Narrow legacy selectors and synthetic URL fixtures only; live layout safety was previously blocked. |

No mirror domains are supported. Synthetic fixtures, connected mocks, and DOM inspection do not establish native support. Unknown, ambiguous, multi-content, unsafe, and unsupported structures are left visible. Identity is URL-derived; data attributes are ignored for bookmark identity and cannot create or alter a bookmark key. See [the verification matrix](docs/verification.md) for separate DOM, fixture, connected-mock, and native evidence columns.

## Manual verification checklist

Use a separate Chrome profile and disposable, user-selected synthetic bookmarks. Do not use personal bookmark exports or generated archives.

- Bookmark one synthetic result, then verify the same recognized ID is hidden while a distinct ID remains visible.
- Verify title/tracking variations of the same ID match, while Literotica chapters and meaningful page/variant parameters remain distinct.
- Toggle each site and the temporary reveal control; check hidden counts and restoration after disabling/re-enabling.
- Add and remove synthetic cards dynamically, including recycled hrefs and direct-page recommendations; confirm uncertain or multi-content containers remain visible.
- Change a bookmark and confirm the page updates after the bookmark event; reload the extension and an already-open tab.
- Repeat the settings, reveal, dynamic insertion, and restart checks in incognito after enabling **Allow in incognito** for the unpacked extension.
- Verify recovery by reloading or disabling the extension and confirm existing preferences still load.
- In the popup, confirm index states are reported as building/ready/error without raw Chrome diagnostics; use **Retry** only for an error state.
- Add a synthetic creator card, bookmark and unbookmark its creator, and verify the badge/outline, creator count, saved-card precedence, dynamic insertion, recycling, and disable/re-enable cleanup.
- After source changes, reload the unpacked extension in `chrome://extensions` and reload already-open supported tabs. Rebuild icons only with the build script when artwork changes.

This checklist is not an end-to-end automation claim, and it does not claim that all four sites have native live support. See [docs/verification.md](docs/verification.md) for the current evidence and provenance matrix.

## Roadmap

Development priorities and follow-up work are tracked in [the improvement roadmap](docs/roadmap.md). The recommended next release focuses on native verification, URL normalization, disabled-state efficiency, bookmark-folder selection, and hide/dim modes.

## References

- [Chrome extensions: Hello World](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Chrome manifest file format](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)
- [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome manifest incognito modes](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)
- [Literotica search surface observed for DOM evidence](https://search.literotica.com/?query=journey)
- [Literotica tags surface observed for DOM evidence](https://tags.literotica.com/adventure/)
- [Literotica top stories surface observed for DOM evidence](https://www.literotica.com/top/stories)
