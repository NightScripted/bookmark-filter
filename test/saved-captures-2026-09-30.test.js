const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const adapters = require("../content/adapters.js");

const fixture = (site, name) => fs.readFileSync(path.join(__dirname, "fixtures", site, name), "utf8");

function scan(site, name, contextUrl) {
  const adapter = adapters.byId[site];
  const document = new JSDOM(fixture(site, name), { url: "https://127.0.0.1:4177/" }).window.document;
  const candidates = adapter.findCandidateContainers(document, contextUrl);
  return { adapter, document, candidates, identities: candidates.map((element) => adapter.identifyCandidate(element, contextUrl)) };
}

test("2026-09-30 fixtures are small sanitized saved-html evidence", () => {
  for (const [site, name] of [["xvideos", "homepage.html"], ["xvideos", "search.html"], ["xvideos", "creator.html"], ["literotica", "category.html"], ["literotica", "author.html"]]) {
    const html = fixture(site, name);
    assert.doesNotMatch(html, /<script\b|<img\b|<video\b|<source\b|\bon[a-z]+\s*=/i, name);
    assert.doesNotMatch(html, /bookmark-filter|xvideos-cdn|uploads\.literotica|data:(?:image|video)|https?:\/\//i, name);
  }
});

test("XVideos homepage fixture accepts suggestion and opaque-segment cards", () => {
  const { identities, candidates, document, adapter } = scan("xvideos", "homepage.html", "https://www.xvideos.com/");
  assert.deepEqual(candidates.map((element) => element.id), ["video_xvhome1", "video_xvhome2", "video_xvhomeroot"]);
  assert.deepEqual(identities, [
    { siteId: "xvideos", key: "xvideos:id:xvhome1", url: "https://www.xvideos.com/video.xvhome1/synthetic_suggested", creatorUrls: ["https://www.xvideos.com/synthetic_channel"] },
    { siteId: "xvideos", key: "xvideos:id:xvhome2", url: "https://www.xvideos.com/video.xvhome2/56182174/0/synthetic_opaque_segments", creatorUrls: ["https://www.xvideos.com/profiles/synthetic-profile"] },
    // A root-level link outside p.metadata is never a creator.
    { siteId: "xvideos", key: "xvideos:id:xvhome3", url: "https://www.xvideos.com/video.xvhome3/synthetic_root_outside_metadata", creatorUrls: [] }
  ]);
  assert.equal(adapter.identifyCandidate(document.querySelector("#video_xvhomead"), "https://www.xvideos.com/"), null);
});

test("XVideos search fixture keeps premium promotions and ads visible", () => {
  const contextUrl = "https://www.xvideos.com/?k=synthetic";
  const { identities, candidates, document, adapter } = scan("xvideos", "search.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["video_xvsearch1", "video_xvsearch2", "video_xvsearch3"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls]), [
    ["xvideos:id:xvsearch1", ["https://www.xvideos.com/synthetic_channel"]],
    ["xvideos:id:xvsearch2", ["https://www.xvideos.com/profiles/synthetic-profile"]],
    ["xvideos:id:xvsearch3", []]
  ]);
  for (const id of ["video_xvpremium", "video_xvsearchad"]) assert.equal(adapter.identifyCandidate(document.querySelector(`#${id}`), contextUrl), null, id);
});

test("XVideos creator fixture resolves tracking redirects and thumbnail templates to one video", () => {
  const contextUrl = "https://www.xvideos.com/synthetic_channel#_tabVideos";
  const { identities, candidates, document, adapter } = scan("xvideos", "creator.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["video_xvcreator1", "video_xvcreator2"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls]), [
    ["xvideos:id:xvcreator1", ["https://www.xvideos.com/synthetic_channel"]],
    ["xvideos:id:xvcreator2", ["https://www.xvideos.com/synthetic_channel"]]
  ]);
  assert.equal(adapter.identifyCandidate(document.querySelector("#video_xvcreatorambiguous"), contextUrl), null);
});

test("XVideos watch, redirect, and root creator URLs normalize consistently", () => {
  for (const url of [
    "https://www.xvideos.com/video.abc123/slug",
    "https://www.xvideos.com/video.abc123/56182174/0/slug",
    "https://www.xvideos.com/video.abc123/THUMBNUM/slug",
    "https://www.xvideos.com/prof-video-click/upload/synthetic_channel/abc123/slug"
  ]) assert.equal(adapters.normalizeBookmarkUrl(url), "xvideos:id:abc123", url);
  for (const url of [
    "https://www.xvideos.com/video.abc123/a/b/c/d",
    "https://www.xvideos.com/prof-video-click/upload/synthetic_channel",
    "https://www.xvideos.com/prof-video-click/other/synthetic_channel/abc123/slug"
  ]) assert.equal(adapters.normalizeBookmarkUrl(url), null, url);

  assert.equal(adapters.normalizeCreatorUrl("https://www.xvideos.com/synthetic_channel"), "xvideos:creator:handle:synthetic_channel");
  assert.equal(adapters.normalizeCreatorUrl("https://www.xvideos.com/synthetic_channel/#_tabVideos"), "xvideos:creator:handle:synthetic_channel");
  assert.notEqual(adapters.normalizeCreatorUrl("https://www.xvideos.com/synthetic"), adapters.normalizeCreatorUrl("https://www.xvideos.com/profiles/synthetic"));
  for (const route of ["gay", "trans", "best", "tags", "history", "account", "lang", "Profiles", "pornstars-index", "videos-i-like", "my-feed"]) {
    assert.equal(adapters.normalizeCreatorUrl(`https://www.xvideos.com/${route}`), null, route);
  }
  assert.equal(adapters.normalizeCreatorUrl("https://www.xvideos.com/"), null);

  const adapter = adapters.byId.xvideos;
  assert.equal(adapter.isListingPage("https://www.xvideos.com/prof-video-click/upload/synthetic_channel/abc123/slug"), true);
  assert.equal(adapter.isListingPage("https://www.xvideos.com/video.abc123/56182174/0/slug"), false);
  for (const url of ["https://www.xvideos.com/", "https://xvideos.com/?k=synthetic", "https://www.xvideos.com/synthetic_channel"]) {
    assert.equal(adapter.surfaceVerification(url), "saved-html-inspected", url);
  }
  for (const url of ["https://www.xvideos.com/gay", "https://www.xvideos.com/profiles/synthetic", "https://fr.xvideos.com/"]) {
    assert.equal(adapter.surfaceVerification(url), "experimental", url);
  }
});

test("Literotica category fixture accepts listing cards but not sidebar or news submenu", () => {
  const contextUrl = "https://www.literotica.com/c/synthetic-stories";
  const { identities, candidates, document, adapter } = scan("literotica", "category.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["category-series-latest", "category-standalone"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls]), [
    ["literotica:url:https://www.literotica.com/s/synthetic-category-series-ch-03", ["https://www.literotica.com/authors/SyntheticOne/works/stories"]],
    ["literotica:url:https://www.literotica.com/s/synthetic-category-standalone", ["https://www.literotica.com/authors/SyntheticTwo/works/stories"]]
  ]);
  assert.equal(adapter.identifyCandidate(document.querySelector("#category-sidebar"), contextUrl), null);
  assert.equal(adapter.identifyCandidate(document.querySelector("._item_11pwa_311"), contextUrl), null);
});

test("Literotica author story list accepts part rows and fails open on missing author links", () => {
  const contextUrl = "https://www.literotica.com/authors/SyntheticOwner/works/stories";
  const { identities, candidates } = scan("literotica", "author.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["author-part-one", "author-part-two"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls]), [
    ["literotica:url:https://www.literotica.com/s/synthetic-owner-ch-01", ["https://www.literotica.com/authors/SyntheticOwner/works/stories"]],
    // The page owner is never inherited by a card without its own author link.
    ["literotica:url:https://www.literotica.com/s/synthetic-owner-ch-02", []]
  ]);
});

test("Literotica new surfaces are route scoped", () => {
  const adapter = adapters.byId.literotica;
  for (const url of ["https://www.literotica.com/c/synthetic-stories", "https://literotica.com/c/synthetic-stories/", "https://www.literotica.com/authors/Synthetic/works/stories"]) {
    assert.equal(adapter.surfaceVerification(url), "saved-html-inspected", url);
  }
  for (const url of ["https://www.literotica.com/", "https://www.literotica.com/c/synthetic/extra", "https://www.literotica.com/authors/Synthetic", "https://www.literotica.com/authors/Synthetic/works/poetry"]) {
    assert.equal(adapter.surfaceVerification(url), "unverified", url);
  }
  // The homepage has only news/submenu story links, so nothing is eligible.
  const document = new JSDOM(fixture("literotica", "category.html"), { url: "https://127.0.0.1:4177/" }).window.document;
  assert.deepEqual(adapter.findCandidateContainers(document, "https://www.literotica.com/"), []);
});
