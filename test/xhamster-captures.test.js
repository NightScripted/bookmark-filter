const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const adapters = require("../content/adapters.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "xhamster", name), "utf8");
const adapter = adapters.byId.xhamster;

function scan(name, contextUrl) {
  const document = new JSDOM(fixture(name), { url: "https://127.0.0.1:4177/" }).window.document;
  const candidates = adapter.findCandidateContainers(document, contextUrl);
  return { document, candidates, identities: candidates.map((element) => adapter.identifyCandidate(element, contextUrl)) };
}

test("2026-10-13 xHamster fixtures are small sanitized saved-html evidence", () => {
  for (const name of ["homepage.html", "search.html", "creator.html"]) {
    const html = fixture(name);
    assert.doesNotMatch(html, /<script\b|<img\b|<video\b|<source\b|\bon[a-z]+\s*=/i, name);
    assert.doesNotMatch(html, /bookmark-filter|xhcdn|data:(?:image|video)|https?:\/\//i, name);
  }
});

test("xHamster homepage fixture accepts video and short cards with uploader creators", () => {
  const contextUrl = "https://xhamster.com/";
  const { identities, candidates, document } = scan("homepage.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["xh-home-channel", "xh-home-plain", "xh-home-user", "xh-home-listing-links", "xh-home-pornstar", "xh-home-short"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls.map((url) => adapters.normalizeCreatorUrl(url))]), [
    ["xhamster:id:xhHome01", ["xhamster:creator:channels:synthetic-channel"]],
    ["xhamster:id:xhHome02", []],
    ["xhamster:id:xhHome03", ["xhamster:creator:users:synthetic-user"]],
    // /creators/all, /creators/contest, and /pornstars/all are listing routes.
    ["xhamster:id:xhHome04", []],
    ["xhamster:id:xhHome07", ["xhamster:creator:pornstars:synthetic-star"]],
    ["xhamster:short:xhShort1", ["xhamster:creator:creators:synthetic-creator"]]
  ]);
  for (const id of ["xh-home-cam", "xh-home-native-ad", "xh-home-ambiguous", "xh-home-short-placeholder"]) {
    assert.equal(adapter.identifyCandidate(document.querySelector(`#${id}`), contextUrl), null, id);
  }
});

test("xHamster search fixture keeps gold promotions and native ads visible", () => {
  const contextUrl = "https://xhamster.com/search/synthetic";
  const { identities, candidates, document } = scan("search.html", contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["xh-search-profile", "xh-search-creator", "xh-search-plain", "xh-search-short"]);
  assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls.map((url) => adapters.normalizeCreatorUrl(url))]), [
    ["xhamster:id:xhSrch01", ["xhamster:creator:user-profiles:synthetic-profile"]],
    ["xhamster:id:xhSrch02", ["xhamster:creator:creators:synthetic-creator"]],
    ["xhamster:id:xhSrch03", []],
    ["xhamster:short:xhShort2", ["xhamster:creator:channels:synthetic-channel"]]
  ]);
  // /fh/out wraps a /videos/ path in its query; the redirect is never content.
  for (const id of ["xh-search-gold", "xh-search-native-ad"]) assert.equal(adapter.identifyCandidate(document.querySelector(`#${id}`), contextUrl), null, id);
});

test("xHamster channel and pornstar pages never inherit the page owner", () => {
  for (const contextUrl of ["https://xhamster.com/channels/synthetic-channel", "https://xhamster.com/pornstars/synthetic-star"]) {
    const { identities, candidates, document } = scan("creator.html", contextUrl);
    assert.deepEqual(candidates.map((element) => element.id), ["xh-owner-short", "xh-owner-one", "xh-owner-two"], contextUrl);
    assert.deepEqual(identities.map(({ key, creatorUrls }) => [key, creatorUrls]), [
      ["xhamster:short:xhShort3", []],
      ["xhamster:id:xhOwn001", []],
      ["xhamster:id:xhOwn002", []]
    ], contextUrl);
    assert.equal(adapter.identifyCandidate(document.querySelector("#xh-owner-cam"), contextUrl), null);
  }
});

test("xHamster video, short, and creator URLs normalize consistently", () => {
  assert.equal(adapters.normalizeBookmarkUrl("https://xhamster.com/videos/synthetic-title-xhAbC12"), "xhamster:id:xhAbC12");
  assert.equal(adapters.normalizeBookmarkUrl("https://de.xhamster.com/videos/synthetic-title-xhAbC12/?utm_source=test#x"), "xhamster:id:xhAbC12");
  // IDs are case-sensitive base-62 tokens.
  assert.notEqual(adapters.normalizeBookmarkUrl("https://xhamster.com/videos/t-xhabc12"), adapters.normalizeBookmarkUrl("https://xhamster.com/videos/t-xhAbC12"));
  assert.equal(adapters.normalizeBookmarkUrl("https://xhamster.com/shorts/synthetic-title-xhAbC12"), "xhamster:short:xhAbC12");
  for (const url of [
    "https://xhamster.com/shorts/synthetic/extra",
    "https://xhamster.com/fh/out?url=/videos/synthetic-gold-2L1R40",
    "https://xhamster.com/ff/out?path=/shorts/synthetic-ad-225399",
    "https://xhamsterlive.com/goto/SyntheticCam"
  ]) assert.equal(adapters.normalizeBookmarkUrl(url), null, url);

  const creators = [
    ["https://xhamster.com/channels/synthetic-channel", "xhamster:creator:channels:synthetic-channel"],
    ["https://xhamster.com/channels/synthetic-channel/shorts", "xhamster:creator:channels:synthetic-channel"],
    ["https://xhamster.com/channels/synthetic-channel/2", "xhamster:creator:channels:synthetic-channel"],
    ["https://xhamster.com/pornstars/synthetic-star/", "xhamster:creator:pornstars:synthetic-star"],
    ["https://xhamster.com/pornstars/synthetic-star/shorts", "xhamster:creator:pornstars:synthetic-star"],
    ["https://xhamster.com/creators/synthetic-creator/shorts", "xhamster:creator:creators:synthetic-creator"],
    ["https://xhamster.com/users/synthetic-user/videos", "xhamster:creator:users:synthetic-user"],
    ["https://xhamster.com/users/profiles/synthetic-profile", "xhamster:creator:user-profiles:synthetic-profile"],
    ["https://xhamster.com/users/profiles/synthetic-profile/videos", "xhamster:creator:user-profiles:synthetic-profile"]
  ];
  for (const [url, key] of creators) assert.equal(adapters.normalizeCreatorUrl(url), key, url);
  for (const url of [
    "https://xhamster.com/creators/all/countries",
    "https://xhamster.com/creators/contest/naoc",
    "https://xhamster.com/creators/videos/naoc",
    "https://xhamster.com/pornstars/all/countries",
    "https://xhamster.com/pornstars/all",
    "https://xhamster.com/users/profiles",
    "https://xhamster.com/users/synthetic-user/blog",
    "https://xhamster.com/pornstars/synthetic-star/recommended",
    "https://xhamster.com/creators/synthetic-creator/full-length"
  ]) assert.equal(adapters.normalizeCreatorUrl(url), null, url);
  assert.notEqual(adapters.normalizeCreatorUrl("https://xhamster.com/users/synthetic"), adapters.normalizeCreatorUrl("https://xhamster.com/users/profiles/synthetic"));
  assert.notEqual(adapters.normalizeCreatorUrl("https://xhamster.com/channels/synthetic"), adapters.normalizeCreatorUrl("https://xhamster.com/pornstars/synthetic"));
});

test("xHamster surface verification is route scoped", () => {
  assert.equal(adapter.isListingPage("https://xhamster.com/shorts/synthetic-title-xhAbC12"), false);
  assert.equal(adapter.isListingPage("https://xhamster.com/channels/synthetic-channel"), true);
  for (const url of [
    "https://xhamster.com/",
    "https://www.xhamster.com/search/synthetic",
    "https://xhamster.com/channels/synthetic-channel",
    "https://xhamster.com/channels/synthetic-channel/2",
    "https://xhamster.com/pornstars/synthetic-star/"
  ]) assert.equal(adapter.surfaceVerification(url), "saved-html-inspected", url);
  for (const url of [
    "https://de.xhamster.com/",
    "https://xhamster.com/creators/synthetic-creator",
    "https://xhamster.com/pornstars/all/countries",
    "https://xhamster.com/categories/synthetic",
    "https://xhamster.com/videos/synthetic-title-xhAbC12"
  ]) assert.equal(adapter.surfaceVerification(url), "experimental", url);
});
