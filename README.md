# Bookmark Filter

Bookmark Filter is a plain-JavaScript Manifest V3 extension. It hides already-bookmarked, recognized result cards from supported pages; it never changes bookmarks.

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

Run the harness only after its loopback server is ready, then open `http://127.0.0.1:4177/?site=pornhub`; changing the site selector reloads the page with a clean production content-script instance. For the Literotica-derived surfaces use `?site=literotica&surface=search`, `tags`, `top`, or `similar`; use `&index=error` to exercise the popup retry state. The harness uses mocked Chrome APIs, synthetic or live-derived adapter markup, production content CSS, the actual `content-script.js`, and the actual `popup.js`. Its bookmark matching calls the production normalizer, and its visible status comes from actual runtime message handlers. The local automated connected tests are a separate Node/jsdom/VM production-message bridge; browser-harness loopback checks are a separate simulated UI category. Neither category is native verification; keep their results separate from native claims. Native extension loading, service-worker sleep/wake, and incognito behavior require manual verification because `chrome://extensions` automation is blocked.

## Verification status

As of 2026-09-08, the final local suite passed 58/58 tests with 0 skipped and 0 failed in 14.17 seconds. Production and harness syntax checks passed. Focused scanner validation passed 6/6, including the 10,000-card stress case and the fewer-than-1,000 `Node.contains` guard. Chrome loopback smoke checks passed for all four Literotica surfaces and the three legacy synthetic surfaces; search control failure/recovery also passed. These are local or simulated results, not native live-site verification. Native Chrome behavior remains unverified, the three legacy sites remain live-unverified, and homepage/news/promotion surfaces remain ambiguous.

## What is stored

The extension stores per-site enabled/disabled preferences only. Temporary reveal is limited to the current page/route. It does not store bookmarks, bookmark counts, tab history, telemetry, or remote data. Existing legacy `enabledBySite` preferences are read as a fallback for newer per-site keys. A rollback to an older build does not read newer per-site-only changes, so verify settings after rollback; no destructive preference migration is performed.

## Support status

| Site | Status | Boundary |
| --- | --- | --- |
| Literotica search | DOM inspected; harness fixture added | `div.panel.ai_gJ` cards with `a.ai_ii > h4`; only recognized `/s/` links are eligible. |
| Literotica tags | DOM inspected; harness fixture added | `article._card_ohlxb_16` content cards with `_content_ohlxb_56`, `_title_ohlxb_52`, and `_title_link_ohlxb_67`. |
| Literotica top stories | DOM inspected; harness fixture added | Same article card shape with the additional `_most_read` class. |
| Literotica similar stories | DOM inspected; harness fixture added | `div._widget_list_1m9b4_1 > div._item_1m9b4_7 > a._widget_link_1m9b4_62`. |
| Literotica series navigation | Intentionally unfiltered | `div._data_list_pv6fa_1 > div._item_pv6fa_7` is navigation, not a content-card target. |
| Literotica homepage/news/promotions | Unverified | Ambiguous structures remain visible; no verified claim is made. |
| Pornhub | Experimental legacy | Narrow legacy selectors and synthetic URL fixtures only; live layout safety was previously blocked. |
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
- After source changes, reload the unpacked extension in `chrome://extensions` and reload already-open supported tabs. Rebuild icons only with the build script when artwork changes.

This checklist is not an end-to-end automation claim, and it does not claim that all four sites have native live support. See [docs/verification.md](docs/verification.md) for the current evidence and provenance matrix.

## References

- [Chrome extensions: Hello World](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Chrome manifest file format](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)
- [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome manifest incognito modes](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)
- [Literotica search surface observed for DOM evidence](https://search.literotica.com/?query=journey)
- [Literotica tags surface observed for DOM evidence](https://tags.literotica.com/adventure/)
- [Literotica top stories surface observed for DOM evidence](https://www.literotica.com/top/stories)
