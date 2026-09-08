const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const urlUtils = globalThis.BookmarkFilterUrl;
const adapters = require("../content/adapters.js");

test("URL parsing accepts only safe HTTP(S) URLs", () => {
  assert.ok(urlUtils.safeUrl("https://www.pornhub.com/video/title-id"));
  for (const value of [
    "ftp://www.pornhub.com/video/title-id",
    "https://user:pass@www.pornhub.com/video/title-id",
    "https://www.pornhub.com:8443/video/title-id",
    "not a URL",
    ""
  ]) assert.equal(urlUtils.safeUrl(value), null);
});

test("generic normalization preserves path/query identity and only removes tracking", () => {
  const input = "https://Example.com//Path/Case?foo=1&foo=2&utm_source=synthetic#fragment";
  assert.equal(
    urlUtils.normalizedUrl(input),
    "https://example.com//Path/Case?foo=1&foo=2#fragment"
  );
  assert.equal(
    urlUtils.normalizedUrl(input, { stripFragment: true }),
    "https://example.com//Path/Case?foo=1&foo=2"
  );
});

test("Pornhub viewkey is query identity and different viewkeys stay distinct", () => {
  assert.equal(
    adapters.normalizeBookmarkUrl("https://www.pornhub.com/view_video.php?viewkey=ph111"),
    "pornhub:id:ph111"
  );
  assert.equal(
    adapters.normalizeBookmarkUrl("https://www.pornhub.com/view_video.php?viewkey=ph222"),
    "pornhub:id:ph222"
  );
  assert.equal(
    adapters.normalizeBookmarkUrl("https://www.pornhub.com/view_video.php?name=viewkey=wrong"),
    null
  );
  assert.equal(
    adapters.normalizeBookmarkUrl("https://www.pornhub.com/view_video.php?viewkey=ph111&chapter=2"),
    "pornhub:id:ph111?chapter=2"
  );
  assert.equal(
    adapters.normalizeBookmarkUrl("https://www.pornhub.com/view_video.php?viewkey=ph111&utm_source=synthetic"),
    "pornhub:id:ph111"
  );
});

test("synthetic legacy video conventions normalize to stable site-prefixed IDs", () => {
  assert.equal(adapters.normalizeBookmarkUrl("https://www.pornhub.com/video/title-abc123"), "pornhub:id:abc123");
  assert.equal(adapters.normalizeBookmarkUrl("https://www.xvideos.com/video12345/slug"), "xvideos:id:12345");
  assert.equal(adapters.normalizeBookmarkUrl("https://www.xvideos.com/video.ID/slug"), "xvideos:id:ID");
  assert.equal(adapters.normalizeBookmarkUrl("https://www.xvideos.com/video-ID/slug"), "xvideos:id:ID");
  assert.equal(adapters.normalizeBookmarkUrl("https://xhamster.com/videos/title-abc123.html"), "xhamster:id:abc123");
  assert.equal(adapters.normalizeBookmarkUrl("https://xhamster.com/videos/title-new456"), "xhamster:id:new456");
});

test("Literotica preserves full /s/ paths and meaningful chapter/page parameters", () => {
  const adapter = adapters.byId.literotica;
  const chapterOne = adapter.normalizeBookmarkUrl("https://www.literotica.com/s/synthetic-story/chapter-1");
  const chapterTwo = adapter.normalizeBookmarkUrl("https://www.literotica.com/s/synthetic-story/chapter-2");
  assert.notEqual(chapterOne, chapterTwo);
  assert.equal(
    adapter.normalizeBookmarkUrl("https://www.literotica.com/s/synthetic-story?page=2&page=3&utm_campaign=x#section"),
    "literotica:url:https://www.literotica.com/s/synthetic-story?page=2&page=3"
  );
  assert.equal(
    adapter.normalizeBookmarkUrl("https://literotica.com/s/synthetic-story"),
    adapter.normalizeBookmarkUrl("https://www.literotica.com/s/synthetic-story")
  );
  assert.equal(adapter.normalizeBookmarkUrl("https://www.literotica.com/stories/contest.php/synthetic-story"), null);
  assert.equal(adapter.normalizeBookmarkUrl("https://www.literotica.com/tags/synthetic"), null);
});

test("supported subdomains work but mirrors, lookalikes, and invalid content do not", () => {
  assert.equal(adapters.forUrl("https://sub.xvideos.com/video123/slug")?.id, "xvideos");
  for (const value of [
    "https://xvideos.com.evil.test/video123/slug",
    "https://mirror.example/video123/slug",
    "https://www.xvideos.com/feed",
    "https://www.xvideos.com/video/unsupported-surface",
    "https://www.xvideos.com:444/video123/slug"
  ]) assert.equal(adapters.normalizeBookmarkUrl(value), null);
});
