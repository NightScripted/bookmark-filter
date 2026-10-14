# xHamster saved-capture evidence

Inspection date: 2026-10-13 (America/Denver). This evidence comes from four local saved HTML captures inspected as inert DOM samples, with scripts stripped. It describes structural samples and does not establish live or native extension support. The captures were saved with the extension running: 15 `bookmark-filter-hidden` classes plus one creator badge/highlight were present and were ignored.

| Capture route | Observed `.video-thumb` | Eligible cards | Shorts | With creator | Structural notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` | 62 | 59 | 5 | 36 | One xhamsterlive cam tile, one `/ff/out` native ad, and one empty moment placeholder stay visible. Creators: 25 channels, 7 creators, 3 pornstars, 1 user. |
| `/search/<term>` | 58 | 51 | 5 | 21 | Four `/fh/out?url=/videos/...` Gold promotions, one cam tile, one native ad, and one placeholder stay visible. Creators: 11 channels, 7 creators, 3 `/users/profiles/`. |
| `/channels/<handle>` | 54 | 54 | 6 | 0 | Cards on the owner's page have no uploader link; the owner is never inherited. |
| `/pornstars/<handle>` | 54 | 52 | 6 | 0 | Same as the channel page; two cam tiles stay visible. |

Card shape: `div.thumb-list__item.video-thumb.video-thumb--type-video` containing `a.video-thumb__image-container` and `a.video-thumb-info__name`, both pointing at the same `/videos/<slug>-<id>`, plus `div.video-thumb-uploader` with logo and name links to the same creator. Short ("moment") cards are `div.video-thumb.video-thumb__moment` linking to `/shorts/<slug>-<id>`. The existing `.video-thumb` selector already matched both; no selector change was needed.

Video IDs are case-sensitive base-62 tokens (`xhl9PLr` and `xhKfaFC` are different videos). Shorts use the same shape under `/shorts/` and get a separate `xhamster:short:<id>` key, because whether a short and a `/videos/` page with the same token are the same content is unverified.

Creator links on cards use these routes, which now normalize as follows:

- `/channels/<h>`, `/channels/<h>/shorts`, `/channels/<h>/<n>` → `xhamster:creator:channels:<h>`
- `/pornstars/<h>`, `/pornstars/<h>/shorts`, `/pornstars/<h>/<n>` → `xhamster:creator:pornstars:<h>`
- `/creators/<h>`, `/creators/<h>/shorts`, `/creators/<h>/<n>` → `xhamster:creator:creators:<h>`
- `/users/<h>`, `/users/<h>/videos` → `xhamster:creator:users:<h>`
- `/users/profiles/<h>`, `/users/profiles/<h>/videos` → `xhamster:creator:user-profiles:<h>`

`/users/<h>` and `/users/profiles/<h>` stay distinct identities. The listing routes `/creators/all/countries`, `/creators/contest/<region>`, `/creators/videos/<region>`, and `/pornstars/all/countries` share these namespaces, so `all`, `contest`, `videos`, `countries`, and `profiles` are rejected as handles. Other tabs (`/recommended`, `/full-length`, `/blog`) are not treated as creator identities.

## Fixtures

`test/fixtures/xhamster/{homepage,search,creator}.html` are small sanitized derivatives: they keep the card wrappers, duplicate thumbnail/title anchors, uploader blocks, short cards, cam tiles, native ads, Gold promotions, and the empty moment placeholder, plus synthetic negatives (listing-route links inside a card, an ambiguous two-video card). Scripts, media, absolute URLs, and real names are removed. `test/xhamster-captures.test.js` reads only these fixtures, never the raw `xhamster-*.html` captures.
