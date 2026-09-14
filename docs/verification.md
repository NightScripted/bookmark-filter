# Verification matrix

Verification date: 2026-09-12 (America/Denver). This document separates evidence types; one column never substitutes for another.

The live-layout notes are local Chrome DOM observations recorded for this verification pass. Pornhub capture evidence is saved HTML inspected as an inert DOM sample; it is not live or native verification. Harness fixtures are synthetic or derived from those observed shapes. Local automated connected tests are Node/jsdom/VM tests that bridge production messages through mocked Chrome APIs; they are separate from the browser harness. Browser-harness checks use the loopback server for simulated UI behavior. Native verification means a manual unpacked-extension run in Chrome; it is not established by either automated category. Creator highlighting is first-phase URL matching only: profile bookmarks must be direct supported creator URLs, and cards must expose explicit same-site creator anchors. No name matching, history, metadata persistence, or extra permissions are used.

| Surface | DOM inspected | Local automated tests | Browser harness | Native verified |
| --- | --- | --- | --- | --- |
| Literotica search (observed at `https://search.literotica.com/?query=journey`) | Yes - 50 observed `div.panel.ai_gJ` cards with `div.ai_iG > a.ai_ii > h4` | Adapter/runtime and connected bridge coverage passed | Local loopback creator flow passed: badge/outline, dynamic insertion, creator toggle, saved precedence, reveal, recycling, disable/re-enable, failure/retry; simulated only | No |
| Literotica tags (observed at `https://tags.literotica.com/adventure/`, 2026-09-12) | Yes - newly verified `article._card_1epno_16 > div._content_1epno_58 > h3._title_1epno_54 > a._title_link_1epno_69`; `_ohlxb_` is historical | Adapter fixture tests passed; no separate connected bridge claim | Local loopback synthetic creator-card smoke passed; simulated only | No |
| Literotica top stories (`https://www.literotica.com/top/stories`, 2026-09-12) | Yes - newly verified `_1epno_` article/content/title shape with `_most_read_1epno_670`; `_ohlxb_` is historical | Adapter fixture tests passed; no separate connected bridge claim | Local loopback synthetic creator-card smoke passed; simulated only | No |
| Literotica similar stories (`https://www.literotica.com/s/[sample]`) | Current `_item_1m9b4_7` shape not observed in 2026-09-12 pass; legacy behavior retained experimentally | Detail adapter fixture tests passed; no separate connected bridge claim | Not run in this pass | No |
| Literotica header/navigation/story-body/series negatives | Negative structures are intentionally unfiltered | Header, navigation, story-body, and series negative fixtures passed | Not exercised; harness has no negative navigation path | No |
| Literotica homepage, news, and promotions | Ambiguous/unverified; no safe positive claim | Not treated as a positive fixture | Not claimed | No |
| Pornhub `/`, `/video/search`, and `/model/<handle>` capture surfaces | Yes - saved HTML inspected 2026-09-12; 65/61 homepage, 38/31 search, 29/25 creator card counts | Sanitized capture fixtures plus adapter and connected production tests passed | Not rerun for these captures | No; live/native behavior remains unverified |
| XVideos | Live layout blocked and unverified | Existing synthetic legacy fixture | Local loopback synthetic creator-card smoke passed; not live-site evidence | No |
| xHamster | Live layout blocked and unverified | Existing synthetic legacy fixture | Local loopback synthetic creator-card smoke passed; not live-site evidence | No |

## Harness boundaries

The browser harness is a loopback page with mocked Chrome APIs. Its cards and bookmark membership are synthetic; "bookmarked" means only that the mock set contains the normalized URL. It makes no claim about a user's real bookmarks, native extension installation, or native Chrome behavior. The test-only `Function(location, contentSource)` loading pattern supplies the synthetic page location to the production content script; it is not a production permission or host override.

The creator controls (**Add creator card** and **Toggle creator bookmark**) exercise synthetic same-site profile URLs through the production normalizer. Their creator counts and badge/outline behavior are simulated harness evidence until manually exercised in a native extension tab.

Literotica creator identity is verified for `/authors/<handle>`, `/authors/<handle>/works`, and `/authors/<handle>/works/stories`; the legacy fixture-only `/author/<handle>` route is intentionally not classified as a creator. Pornhub MODEL tabs `/videos`, `/clips`, `/photos`, `/gifs`, `/stream`, `/playlists`, and `/about` normalize to the direct model identity, while each eligible card still requires an explicit creator anchor; homepage context is never inherited.

The harness exposes the current popup surface, including `#surface-status`, `#settings-status`, and `#retry`. It models index responses as `building`, `ready`, or `error` with the stable `index_unavailable` code and sends `RETRY_FILTER` through the simulated tab path. These are browser-harness UI checks, not the Node/jsdom/VM production-message bridge tests. The server is loopback-only, allowlisted, and has no proxy.

Local loopback interaction passed for Literotica search, tags/top synthetic creator cards, and Pornhub, XVideos, and xHamster synthetic creator cards; console warning/error logs were empty in those checks. The related-story legacy surface was not rerun this pass. No native or real-site success claim is made here; all loopback results are simulated evidence only.

## Static adapter benchmark

The main static benchmark recognized 1,000 of 1,000 cards and 10,000 of 10,000 cards, with zero `Node.contains` calls in both runs. The 1,000-card comparison previously incurred 999,000 `Node.contains` calls. These are Node benchmark results only; they make no real-browser timing claim.

Focused scanner validation passed 6/6: 1,000- and 10,000-card discovery, late insertion, bookmark changes during a scan, a 10,000-node root storm, removals, and status handling. The scanner also passed the 10,000-card stress test and the `Node.contains` call-count guard of fewer than 1,000 calls.

The final local full suite passed 76/76 tests with 0 skipped and 0 failed. Production syntax checks also passed. Local implementation verification is complete; all-site verification is not complete because native Chrome behavior is unverified, the three legacy sites remain live-unverified, and homepage/news/promotion surfaces remain ambiguous.

## Native verification status

Native `chrome://extensions` automation was previously blocked. Native extension load, service-worker sleep/wake, incognito execution, and live-tab behavior remain unverified until a manual Chrome run is available. Do not describe the connected harness or local DOM observations as native verification.

## Privacy and rollback

Diagnostics should use synthetic URLs and disposable test profiles. Do not import personal bookmark exports or send raw Chrome errors to the UI. The extension stores only per-site settings; this harness stores only its local session preferences. There is no bookmark migration. Existing settings remain available after rollback, with the usual caveat that an older build may not understand newer per-site keys.
