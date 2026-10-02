# XVideos and Literotica saved-capture evidence

Inspection date: 2026-09-30 (America/Denver). This evidence comes from seven local saved HTML captures inspected as inert DOM samples, with scripts stripped. It describes structural samples and does not establish live or native extension support. None of the captures contained extension-injected classes or badges.

## XVideos

| Capture route | Observed `.thumb-block` | Eligible cards | With creator | Structural notes |
| --- | ---: | ---: | ---: | --- |
| `/` | 17 | 16 | 16 | 6 `thumb-block.video-suggest` and 10 `frame-block.thumb-block`. One `thumb-ad.thumb-nat-ad` has no links and stays visible. |
| `/?k=<term>` | 31 | 27 | 25 | Three `thumb-block.premium-search-on-free` promotions link to `/?k=...&premium=1` and stay visible, as does one native ad. Two cards have no uploader link. |
| `/<handle>` (creator) | 24 | 24 | 24 | 9 `thumb-block.post-elem` activity cards and 15 upload-grid cards. A video can appear in both, so a saved video can hide two cards. |

Card shape: `div.thumb-block` (id `video_<id>`, `data-eid=<id>`) containing `div.thumb-inside > div.thumb > a` and `div.thumb-under > p.title > a`, both pointing at the same video, plus `p.metadata` with the uploader link.

Video identity is the opaque ID after `/video.`. Before this pass the adapter only accepted one segment after the ID, which rejected 11 of 17 homepage cards. Observed forms that now share one key:

- `/video.<id>/<slug>` (search, most homepage cards)
- `/video.<id>/<n>/<n>/<slug>` (homepage frame-block cards, e.g. `/56182174/0/`)
- `/video.<id>/<n>/<slug>` and `/video.<id>/THUMBNUM/<slug>` (creator activity cards; the second is an unfilled template)
- `/prof-video-click/upload/<handle>/<id>/<slug>` (creator upload grid; a click-tracking redirect carrying the same ID)

At most three segments may follow the ID; deeper paths stay unsupported.

Creator links on cards are mostly root-level channel handles (`/<handle>`), with some `/profiles/<handle>`. Root-level handles share a namespace with site routes (`/gay`, `/best`, `/tags`, `/history`, ...). In all three captures every site route appeared outside `p.metadata` and every uploader link appeared inside it, with no overlap. The adapter therefore:

- normalizes a bookmarked `https://www.xvideos.com/<handle>` to `xvideos:creator:handle:<handle>`, rejecting a fixed list of reserved roots;
- on cards, counts a root-level handle as a creator only when the anchor is inside `p.metadata`.

`/profiles/<handle>` and `/<handle>` remain distinct identities.

## Literotica

| Capture route | Eligible cards | With author link | Structural notes |
| --- | ---: | ---: | --- |
| `/` | 0 | - | No story listing. The 12 `/s/` links are the news submenu (`li._item_11pwa_311`) and announcement paragraphs; all stay visible. |
| `/c/<category>` | 20 | 20 | `article._card_1epno_16` (9 also `_part_card_last_1epno_506`) under `div._list_1epno_6`. The sidebar `div._data_list_1rmtm_91 > div._item_1rmtm_97` contest list is not eligible. |
| `/authors/<handle>/works/stories` | 16 | 16 | `article._card_1epno_16._part_card_1epno_495` under `div._part_row_1epno_512`, one per series part. |
| `search.literotica.com/?query=<term>` | 50 | 50 | Unchanged from the 2026-09-12 search evidence. |

Category and author cards reuse the tag-page work card already verified on 2026-09-12 (`div._content_1epno_58 > h3._title_1epno_54 > a._title_link_1epno_69`). They also contain a `_bookmark_1epno_654` login-modal link to the listing page; it is not a `/s/` link and does not affect identity.

## Fixtures

`test/fixtures/xvideos/{homepage,search,creator}.html` and `test/fixtures/literotica/{category,author}.html` are small sanitized derivatives: they keep the card wrappers, duplicate thumbnail/title anchors, uploader placement, opaque-segment and redirect URLs, ads and premium promotions, sidebars, and the news submenu, plus synthetic negatives (a root link outside `p.metadata`, an ambiguous two-video card, a card without an author link). Scripts, media, absolute URLs, and real names are removed. `test/saved-captures-2026-09-30.test.js` reads only these fixtures, never the raw `xvideos-*.html` or `literotica-*.html` captures.
