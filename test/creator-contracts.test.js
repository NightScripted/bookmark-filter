const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { worker } = require("./helpers/worker.js");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const adapters = require("../content/adapters.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "literotica", name), "utf8");
const contentSender = { id: "ext", frameId: 0, url: "https://www.pornhub.com/videos" };

test("verified Literotica creator fixtures classify only supported cards in page context", () => {
  const cases = [
    ["creators-search.html", "https://search.literotica.com/?query=synthetic", 3, "search-positive", "/s/synthetic-search-story/chapter-1"],
    ["creators-tags.html", "https://tags.literotica.com/synthetic/", 3, "tags-positive", "/s/synthetic-tag-story/chapter-1"],
    ["creators-top.html", "https://www.literotica.com/top/stories", 3, "top-positive", "/s/synthetic-top-story"]
  ];
  for (const [name, pageUrl, expected, positiveId, mediaPath] of cases) {
    const document = new JSDOM(fixture(name), { url: pageUrl }).window.document;
    const adapter = adapters.byId.literotica;
    const candidates = adapter.findCandidateContainers(document, pageUrl);
    assert.equal(candidates.length, expected, name);
    const positive = adapter.identifyCandidate(document.querySelector(`#${positiveId}`), pageUrl);
    assert.equal(positive.url, new URL(mediaPath, pageUrl).href, name);
    assert.deepEqual(positive.creatorUrls.map((url) => adapters.normalizeCreatorUrl(url)), ["literotica:creator:authors:Synthetic"], name);
    for (const id of ["search-missing-creator", "tags-missing-creator", "top-missing-creator", "search-cross-site-creator", "tags-cross-site-creator", "top-cross-site-creator"]) {
      const element = document.querySelector(`#${id}`);
      if (!element) continue;
      const candidate = adapter.identifyCandidate(element, pageUrl);
      assert.ok(candidate, `${name} should recognize ${id} as media`);
      assert.deepEqual(candidate.creatorUrls, [], `${name} should reject missing/cross-site creator ${id}`);
    }
    const ambiguous = document.querySelector("#search-ambiguous");
    if (ambiguous) assert.equal(adapter.identifyCandidate(ambiguous, pageUrl), null);
    const wrapperOnly = document.querySelector("#tags-wrapper-only");
    if (wrapperOnly) assert.equal(adapter.identifyCandidate(wrapperOnly, pageUrl), null);
  }
  assert.equal(adapters.byId.literotica.normalizeCreatorUrl("https://www.literotica.com/author/Synthetic"), null);
});

test("creator route families remain distinct while aliases normalize safely", () => {
  const cases = [
    ["pornhub", ["users", "channels", "model", "pornstar"]],
    ["xvideos", ["profiles", "amateur-channels", "channels"]],
    ["xhamster", ["users", "creators"]]
  ];
  for (const [site, routes] of cases) {
    const host = site === "xhamster" ? "xhamster.com" : `www.${site}.com`;
    const keys = routes.map((route) => adapters.normalizeCreatorUrl(`https://${host}/${route}/Casey/?tab=videos#bio`));
    assert.equal(new Set(keys).size, routes.length, site);
    routes.forEach((route, index) => assert.equal(keys[index], `${site}:creator:${route}:Casey`));
    assert.equal(adapters.normalizeCreatorUrl(`https://${host}/${routes[0]}/Casey`), `${site}:creator:${routes[0]}:Casey`);
    assert.equal(adapters.normalizeCreatorUrl(`https://${host}/${routes[0]}/Casey`), adapters.normalizeCreatorUrl(`https://${host}/${routes[0]}/Casey/?utm_source=test#bio`));
    assert.notEqual(adapters.normalizeCreatorUrl(`https://${host}/${routes[0]}/Casey`), adapters.normalizeCreatorUrl(`https://${host}/${routes[0]}/casey`));
  }
  const lit = adapters.byId.literotica;
  for (const url of [
    "https://literotica.com/authors/Casey",
    "https://www.literotica.com/authors/Casey/works",
    "https://www.literotica.com/authors/Casey/works/stories/"
  ]) assert.equal(lit.normalizeCreatorUrl(url), "literotica:creator:authors:Casey");
  assert.equal(lit.normalizeCreatorUrl("https://www.literotica.com/authors/Casey/works/stories?tab=stories#bio"), "literotica:creator:authors:Casey");
  for (const url of [
    "https://user:pass@www.pornhub.com/users/Casey",
    "https://www.pornhub.com.evil.test/users/Casey",
    "https://evilpornhub.com/users/Casey",
    "https://www.pornhub.com/users/Casey/bio",
    "https://www.xvideos.com/profiles/Casey/extra",
    "https://www.literotica.com/author/Casey",
    "javascript:alert(1)"
  ]) assert.equal(adapters.normalizeCreatorUrl(url), null, url);
});

test("creatorUrls protocol validation rejects malformed payloads before reading bookmarks", async () => {
  const requests = [
    { creatorUrls: "https://www.pornhub.com/users/Casey" },
    { creatorUrls: Array.from({ length: 17 }, () => "https://www.pornhub.com/users/Casey") },
    { creatorUrls: ["x".repeat(4097)] }
  ];
  for (const extra of requests) {
    const instance = worker([{ children: [] }]);
    const response = await instance.context.BookmarkFilterBackground.pageMatches({
      type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "bad", url: "https://www.pornhub.com/video/title-new", ...extra }]
    }, contentSender);
    assert.equal(response.error, "invalid_candidate");
    assert.equal(instance.treeReads, 0);
  }
});

test("worker matches only valid same-site media and any same-site bookmarked creator", async () => {
  const instance = worker([{ children: [
    { id: "media", url: "https://www.pornhub.com/video/title-saved" },
    { id: "creator", url: "https://www.pornhub.com/users/Casey" }
  ] }]);
  const api = instance.context.BookmarkFilterBackground;
  const response = await api.pageMatches({ type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [
    { token: "saved", key: "forged", url: "https://www.pornhub.com/video/title-saved", creatorUrls: ["https://www.pornhub.com/users/Other", "https://www.pornhub.com/users/Casey"] },
    { token: "creator-only", url: "https://www.pornhub.com/video/title-new", creatorUrls: ["https://www.xvideos.com/profiles/Casey", "https://www.pornhub.com/users/Casey"] },
    { token: "cross-site-media", url: "https://www.xvideos.com/video12345/title", creatorUrls: ["https://www.pornhub.com/users/Casey"] },
    { token: "invalid-media", url: "https://www.pornhub.com/users/Casey", creatorUrls: ["https://www.pornhub.com/users/Casey"] },
    { token: "cross-site-creator", url: "https://www.pornhub.com/video/title-new", creatorUrls: ["https://www.xvideos.com/profiles/Casey"] }
  ] }, contentSender);
  assert.equal(instance.treeReads, 1);
  const byToken = Object.fromEntries(response.matches.map((match) => [match.token, match]));
  assert.equal(byToken.saved.mediaBookmarked, true);
  assert.equal(byToken.saved.creatorBookmarked, true);
  assert.equal(byToken["creator-only"].mediaBookmarked, false);
  assert.equal(byToken["creator-only"].creatorBookmarked, true);
  for (const token of ["cross-site-media", "invalid-media", "cross-site-creator"]) {
    assert.equal(byToken[token].mediaBookmarked, false, token);
    assert.equal(byToken[token].creatorBookmarked, false, token);
  }
});
