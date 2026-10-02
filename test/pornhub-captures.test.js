const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const adapters = require("../content/adapters.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "pornhub", name), "utf8");

test("Pornhub fixtures are small sanitized saved-html evidence", () => {
  for (const name of ["homepage.html", "search.html", "creator.html"]) {
    const html = fixture(name);
    assert.doesNotMatch(html, /<script\b|<img\b|<video\b|<source\b|\bon[a-z]+\s*=/i, name);
    assert.doesNotMatch(html, /bookmark-filter|phncdn|data:(?:image|video)|https?:\/\//i, name);
  }
});

test("Pornhub homepage fixture recognizes only eligible cards and preserves negatives", () => {
  const adapter = adapters.byId.pornhub;
  const document = new JSDOM(fixture("homepage.html"), { url: "https://127.0.0.1:4177/" }).window.document;
  const contextUrl = "https://www.pornhub.com/";
  const candidates = adapter.findCandidateContainers(document, contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["synthetic-home-saved", "synthetic-home-new"]);
  assert.deepEqual(candidates.map((element) => adapter.identifyCandidate(element, contextUrl)), [
    { siteId: "pornhub", key: "pornhub:id:phhome1", url: "https://www.pornhub.com/view_video.php?viewkey=phhome1", creatorUrls: ["https://www.pornhub.com/model/synthetic-home-owner"] },
    { siteId: "pornhub", key: "pornhub:id:phhome2", url: "https://www.pornhub.com/view_video.php?viewkey=phhome2", creatorUrls: ["https://www.pornhub.com/model/synthetic-home-owner"] }
  ]);
  for (const element of candidates) {
    assert.equal(element.querySelector(".thumbnail-info-wrapper > .videoUploaderBlock")?.classList.contains("videoUploaderBlock"), true);
    assert.equal(element.querySelector(".thumbnail-info-wrapper > .vidTitleWrapper")?.classList.contains("vidTitleWrapper"), true);
  }
  assert.equal(adapter.identifyCandidate(document.querySelector("#synthetic-home-ambiguous"), contextUrl), null);
  assert.equal(adapter.identifyCandidate(document.querySelector("#synthetic-home-nav-card"), contextUrl), null);
});

test("Pornhub search fixture ignores promo and JavaScript placeholder cards", () => {
  const adapter = adapters.byId.pornhub;
  const document = new JSDOM(fixture("search.html"), { url: "https://127.0.0.1:4177/search" }).window.document;
  const contextUrl = "https://www.pornhub.com/video/search?search=synthetic";
  const candidates = adapter.findCandidateContainers(document, contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["synthetic-search-one", "synthetic-search-two"]);
  assert.deepEqual(candidates.map((element) => adapter.identifyCandidate(element, contextUrl)), [
    { siteId: "pornhub", key: "pornhub:id:phsearch1", url: "https://www.pornhub.com/view_video.php?viewkey=phsearch1", creatorUrls: ["https://www.pornhub.com/channels/synthetic-search-channel"] },
    { siteId: "pornhub", key: "pornhub:id:phsearch2", url: "https://www.pornhub.com/view_video.php?viewkey=phsearch2", creatorUrls: ["https://www.pornhub.com/model/synthetic-search-owner"] }
  ]);
  for (const element of candidates) {
    assert.equal(element.querySelector(".thumbnail-info-wrapper > .videoUploaderBlock")?.classList.contains("videoUploaderBlock"), true);
    assert.equal(element.querySelector(".thumbnail-info-wrapper > .vidTitleWrapper")?.classList.contains("vidTitleWrapper"), true);
  }
  for (const element of document.querySelectorAll("#bottomVideos .pcVideoListItem")) assert.equal(adapter.identifyCandidate(element, contextUrl), null);
  assert.equal(adapter.identifyCandidate(document.querySelector("#synthetic-search-nav-card"), contextUrl), null);
});

test("Pornhub creator fixture keeps explicit creators and does not inherit profile identity", () => {
  const adapter = adapters.byId.pornhub;
  const document = new JSDOM(fixture("creator.html"), { url: "https://127.0.0.1:4177/profile" }).window.document;
  const contextUrl = "https://www.pornhub.com/model/synthetic-owner/videos?o=mr";
  const candidates = adapter.findCandidateContainers(document, contextUrl);
  assert.deepEqual(candidates.map((element) => element.id), ["synthetic-creator-one", "synthetic-creator-two", "synthetic-creator-own"]);
  assert.deepEqual(candidates.map((element) => adapter.identifyCandidate(element, contextUrl)), [
    { siteId: "pornhub", key: "pornhub:id:phcreator1", url: "https://www.pornhub.com/view_video.php?viewkey=phcreator1", creatorUrls: ["https://www.pornhub.com/model/synthetic-owner"] },
    { siteId: "pornhub", key: "pornhub:id:phcreator2", url: "https://www.pornhub.com/view_video.php?viewkey=phcreator2", creatorUrls: ["https://www.pornhub.com/model/synthetic-other"] },
    { siteId: "pornhub", key: "pornhub:id:phcreator3", url: "https://www.pornhub.com/view_video.php?viewkey=phcreator3", creatorUrls: [] }
  ]);
  for (const id of ["synthetic-creator-one", "synthetic-creator-two"]) {
    const wrapper = document.querySelector(`#${id} .thumbnail-info-wrapper`);
    assert.equal(wrapper?.children[0]?.classList.contains("videoUploaderBlock"), true);
    assert.equal(wrapper?.children[1]?.classList.contains("vidTitleWrapper"), true);
  }
  const uploadedInfo = document.querySelector("#synthetic-creator-own .thumbnail-info-wrapper");
  assert.equal(uploadedInfo?.children[0]?.matches(".thumbnail-info"), true);
  assert.equal(uploadedInfo?.children[0]?.querySelector(":scope > span.title") != null, true);
  assert.equal(uploadedInfo?.children[0]?.querySelector(":scope > .videoDetailsBlock") != null, true);
  assert.equal(uploadedInfo?.querySelector(".videoUploaderBlock, .vidTitleWrapper"), null);
  assert.deepEqual([...document.querySelectorAll(".mainMenu a")].map((anchor) => anchor.getAttribute("href")), [
    "/model/synthetic-owner", "/model/synthetic-owner/videos", "/model/synthetic-owner/clips", "/model/synthetic-owner/photos",
    "/model/synthetic-owner/gifs", "/model/synthetic-owner/stream", "/model/synthetic-owner/playlists", "/model/synthetic-owner/about"
  ]);
  assert.equal(adapter.identifyCandidate(document.querySelector("#synthetic-creator-nav-card"), contextUrl), null);
});

test("Pornhub saved-html surface metadata is route and host scoped", () => {
  const adapter = adapters.byId.pornhub;
  for (const url of [
    "https://pornhub.com/", "https://www.pornhub.com/", "https://www.pornhub.com/video/search", "https://www.pornhub.com/video/search/",
    "https://www.pornhub.com/model/synthetic-owner", "https://www.pornhub.com/model/synthetic-owner/"
  ]) assert.equal(adapter.surfaceVerification(url), "saved-html-inspected", url);
  for (const url of [
    "https://www.pornhub.com/video/search/results", "https://www.pornhub.com/model/synthetic-owner/videos", "https://foo.pornhub.com/",
    "https://example.com/model/synthetic-owner", "https://www.pornhub.com/users/synthetic-owner"
  ]) assert.equal(adapter.surfaceVerification(url), "experimental", url);
});
