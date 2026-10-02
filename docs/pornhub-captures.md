# Pornhub saved-capture evidence

Inspection date: 2026-09-12 (America/Denver). This evidence comes from three local saved HTML captures inspected as inert DOM samples. It describes structural samples and does not establish live or native extension support.

| Capture route | Observed cards | Eligible cards | Structural notes |
| --- | ---: | ---: | --- |
| `/` | 65 `.pcVideoListItem` | 61 | Four header/navigation cards are excluded. Promotions use `li.tjListItem.js_promoItem` outside the eligible card shape. |
| `/video/search?search=<term>` | 38 `.pcVideoListItem` | 31 | Four header/navigation cards are excluded. Three ordinary `#bottomVideos` cards expose only `javascript:void(0)` media links and remain visible. The search promotion is `li.videoSearchTjAd1.js_promoItem`. |
| `/model/<handle>` | 29 `.pcVideoListItem` | 25 total (24 in `#modelMostRecentVideosSection`, one in `#videosUploadedSection`) | Four header/navigation cards are excluded. Twenty-four eligible cards expose explicit creator anchors; one own card has no creator anchor. |

The ordinary card shape is `li.pcVideoListItem.js-pop.videoblock`, with a `div.wrap.flexibleHeight`, `div.phimage` thumbnail link, and `div.thumbnail-info-wrapper.clearfix`. Its direct children include `div.videoUploaderBlock > div.usernameWrapper > div.usernameWrap`, followed by `div.vidTitleWrapper > span.title`; the title is duplicated `view_video.php?viewkey=...` anchors. Search cards may also carry `videoBox.videoBoxesSearch`, and creator cards are grouped under `#modelMostRecentVideosSection` or `#videosUploadedSection`. The single uploaded-section exception has `div.thumbnail-info-wrapper > div.thumbnail-info > span.title` with a sibling `div.videoDetailsBlock` inside that same `thumbnail-info`, and no uploader or `vidTitleWrapper`.

The homepage and search counts include distinct eligible media identities: 61 homepage cards and 31 search cards map to distinct media keys. The creator capture has 25 eligible cards but 24 distinct videos because one video is repeated across two sections; a saved video can therefore hide two cards.

The MODEL creator identity accepts `/model/<handle>` and these exact single tab suffixes: `/videos`, `/clips`, `/photos`, `/gifs`, `/stream`, `/playlists`, and `/about`, with query, fragment, and one trailing slash tolerated. The suffix is an alias for the same model identity. Unknown or deeper paths, including `/stream/<activity>`, remain unsupported. Other Pornhub creator families (`/users`, `/channels`, and `/pornstar`) remain separate identities and are unchanged.

Filtering fails open when a card has no single recognized media identity, including multiple different recognized media links or JavaScript placeholders. Creator matching also fails open: a valid media card may have no creator key, and a profile page URL never supplies a missing per-card creator link. This keeps promotions, navigation, ambiguous wrappers, and incomplete cards visible.

The original captures contain extension-injected classes and badges in places where filtering had already run. Those injected states are not expected outcomes or proof of native behavior. The test fixtures in `test/fixtures/pornhub/{homepage,search,creator}.html` are small sanitized derivatives: they retain the card wrappers, duplicate media/title anchors, creator/uploaded-section structure, menus, promotions, JavaScript placeholders, and a synthetic ambiguous two-video negative, while removing scripts, media resources, images, inline handlers, raw personal values, and extension state. Automated tests read only these fixtures; they never read the raw `pornhub-*.html` captures.
