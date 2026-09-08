# Verification matrix

Verification date: 2026-09-08 (America/Denver). This document separates evidence types; one column never substitutes for another.

The live-layout notes are local Chrome DOM observations recorded for this verification pass. Harness fixtures are synthetic or derived from those observed shapes. Local automated connected tests are Node/jsdom/VM tests that bridge production messages through mocked Chrome APIs (including the new `integration.test.js`); they are separate from the browser harness. Browser-harness checks use the loopback server for simulated UI behavior. Native verification means a manual unpacked-extension run in Chrome; it is not established by either automated category.

| Surface | DOM inspected | Local automated tests | Browser harness | Native verified |
| --- | --- | --- | --- | --- |
| Literotica search (observed at `https://search.literotica.com/?query=journey`) | Yes - 50 observed `div.panel.ai_gJ` cards with `a.ai_ii > h4` | Adapter/runtime and connected bridge coverage passed | Synthetic UI passed in actual Chrome loopback, including search control failure/reveal recovery | No |
| Literotica tags (observed at `https://tags.literotica.com/adventure/`) | Yes - 100 observed `article._card_ohlxb_16 > div._content_ohlxb_56 > h3._title_ohlxb_52 > a._title_link_ohlxb_67` | Adapter fixture tests passed; no separate connected bridge claim | Synthetic UI passed in actual Chrome loopback | No |
| Literotica top stories (`https://www.literotica.com/top/stories`) | Yes - 20 observed cards using the same article shape with extra `_most_read` class | Adapter fixture tests passed; no separate connected bridge claim | Synthetic UI passed in actual Chrome loopback | No |
| Literotica similar stories (`https://www.literotica.com/s/[sample]`) | Yes - `div._widget_list_1m9b4_1 > div._item_1m9b4_7 > a._widget_link_1m9b4_62` | Detail adapter fixture tests passed; no separate connected bridge claim | Synthetic UI passed in actual Chrome loopback | No |
| Literotica header/navigation/story-body/series negatives | Negative structures are intentionally unfiltered | Header, navigation, story-body, and series negative fixtures passed | Not exercised; harness has no negative navigation path | No |
| Literotica homepage, news, and promotions | Ambiguous/unverified; no safe positive claim | Not treated as a positive fixture | Not claimed | No |
| Pornhub | Live layout blocked and unverified | Existing synthetic legacy fixture | Synthetic Chrome smoke passed: 2 cards, 1 saved hidden and 1 unsaved visible; not live-site evidence | No |
| XVideos | Live layout blocked and unverified | Existing synthetic legacy fixture | Synthetic Chrome smoke passed: 2 cards, 1 saved hidden and 1 unsaved visible; not live-site evidence | No |
| xHamster | Live layout blocked and unverified | Existing synthetic legacy fixture | Synthetic Chrome smoke passed: 2 cards, 1 saved hidden and 1 unsaved visible; not live-site evidence | No |

## Harness boundaries

The browser harness is a loopback page with mocked Chrome APIs. Its cards and bookmark membership are synthetic; "bookmarked" means only that the mock set contains the normalized URL. It makes no claim about a user's real bookmarks, native extension installation, or native Chrome behavior. The test-only `Function(location, contentSource)` loading pattern supplies the synthetic page location to the production content script; it is not a production permission or host override.

The harness exposes the current popup surface, including `#surface-status`, `#settings-status`, and `#retry`. It models index responses as `building`, `ready`, or `error` with the stable `index_unavailable` code and sends `RETRY_FILTER` through the simulated tab path. These are browser-harness UI checks, not the Node/jsdom/VM production-message bridge tests. The server is loopback-only, allowlisted, and has no proxy.

The four Literotica surface smoke checks passed in the browser harness. Search also passed the control-failure, later-insert reveal, hide-again, disable/re-enable, and recovery checks. These remain simulated loopback evidence, not native live-site verification.

## Static adapter benchmark

The main static benchmark recognized 1,000 of 1,000 cards and 10,000 of 10,000 cards, with zero `Node.contains` calls in both runs. The 1,000-card comparison previously incurred 999,000 `Node.contains` calls. These are Node benchmark results only; they make no real-browser timing claim.

Focused scanner validation passed 6/6: 1,000- and 10,000-card discovery, late insertion, bookmark changes during a scan, a 10,000-node root storm, removals, and status handling. The scanner also passed the 10,000-card stress test and the `Node.contains` call-count guard of fewer than 1,000 calls.

The final local full suite passed 58/58 tests with 0 skipped and 0 failed in 14.17 seconds. Production and harness syntax checks also passed. Local implementation verification is complete; all-site verification is not complete because native Chrome behavior is unverified, the three legacy sites remain live-unverified, and homepage/news/promotion surfaces remain ambiguous.

## Native verification status

Native `chrome://extensions` automation was previously blocked. Native extension load, service-worker sleep/wake, incognito execution, and live-tab behavior remain unverified until a manual Chrome run is available. Do not describe the connected harness or local DOM observations as native verification.

## Privacy and rollback

Diagnostics should use synthetic URLs and disposable test profiles. Do not import personal bookmark exports or send raw Chrome errors to the UI. The extension stores only per-site settings; this harness stores only its local session preferences. There is no bookmark migration. Existing settings remain available after rollback, with the usual caveat that an older build may not understand newer per-site keys.
