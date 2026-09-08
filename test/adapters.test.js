const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

globalThis.BookmarkFilterUrl = require("../shared/url-utils.js");
const adapters = require("../content/adapters.js");
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "literotica", name), "utf8");

test("sanitized fixtures include the observed Literotica positive and negative shapes", () => {
  assert.match(fixture("search.html"), /Synthetic search result/);
  assert.match(fixture("tags.html"), /Synthetic tag result/);
  assert.match(fixture("feed.html"), /Synthetic header submenu/);
  assert.match(fixture("detail.html"), /Read more of this series/);
});

test("adapter metadata distinguishes live-inspected and experimental surfaces", () => {
  assert.match(adapters.byId.literotica.verification, /live-layout-inspected/);
  for (const id of ["pornhub", "xvideos", "xhamster"]) {
    assert.match(adapters.byId[id].verification, /experimental/);
    assert.match(adapters.byId[id].verification, /unverified/);
  }
});

test("legacy fixtures scan only single-key certified cards", () => {
  for (const site of ["pornhub", "xvideos", "xhamster"]) {
    const html = fs.readFileSync(path.join(__dirname, "fixtures", site, "feed.html"), "utf8");
    const document = new JSDOM(html, { url: `https://${site}.com/feed` }).window.document;
    const adapter = adapters.byId[site];
    const candidates = adapter.findCandidateContainers(document);
    assert.equal(candidates.length, 3, site);
    assert.equal(new Set(candidates.map((element) => adapter.identifyCandidate(element).key)).size, 3, site);
    assert.equal(candidates.some((element) => element.tagName.toLowerCase() === "main"), false, site);
  }
});

test("actual Literotica search, tag, top, and detail surfaces use their page context", () => {
  const cases = [
    ["search.html", "https://search.literotica.com/?query=journey", 2],
    ["tags.html", "https://tags.literotica.com/adventure/", 2],
    ["top.html", "https://www.literotica.com/top/stories", 1],
    ["detail.html", "https://www.literotica.com/s/synthetic-story", 2]
  ];
  for (const [name, url, expected] of cases) {
    const document = new JSDOM(fixture(name), { url: "https://localhost.test/harness" }).window.document;
    const adapter = adapters.byId.literotica;
    const candidates = adapter.findCandidateContainers(document, url);
    assert.equal(candidates.length, expected, name);
    assert.equal(new Set(candidates.map((element) => adapter.identifyCandidate(element, url).key)).size, expected, name);
  }
});

test("old submenu, homepage navigation, series navigation, and story body remain visible", () => {
  const adapter = adapters.byId.literotica;
  const headerDocument = new JSDOM(fixture("feed.html"), { url: "https://www.literotica.com/stories" }).window.document;
  assert.equal(adapter.findCandidateContainers(headerDocument).length, 0);
  assert.equal(adapter.identifyCandidate(headerDocument.querySelector("._item_opob8_310")), null);

  const homepage = new JSDOM("<div class='_card_x2ei8_42'><a href='/s/not-a-real-card'>Navigation</a></div>", { url: "https://www.literotica.com/" }).window.document;
  assert.equal(adapter.findCandidateContainers(homepage).length, 0);

  const detail = new JSDOM(fixture("detail.html"), { url: "https://www.literotica.com/s/synthetic-story" }).window.document;
  assert.equal(adapter.findCandidateContainers(detail).some((element) => element.classList.contains("_item_pv6fa_7")), false);
  assert.equal(adapter.findCandidateContainers(detail).some((element) => element.matches("main")), false);
});

test("part-card suffix requires the base article card class", () => {
  const document = new JSDOM(fixture("tags.html"), { url: "https://tags.literotica.com/adventure/" }).window.document;
  const adapter = adapters.byId.literotica;
  assert.equal(document.querySelectorAll("article._card_ohlxb_16").length, 2);
  assert.equal(adapter.findCandidateContainers(document).length, 2);
  assert.equal(adapter.identifyCandidate(document.querySelector("article._part_card_last_ohlxb_448:not(._card_ohlxb_16)")), null);
});

test("generic ancestors, protected marker wrappers, document/body/main, and anchors are never candidates", () => {
  const document = new JSDOM("<header><div class='pcVideoListItem'><a href='https://www.pornhub.com/video/synthetic-id-abc123'>header</a></div></header><main><div class='player'><a href='https://www.pornhub.com/video/synthetic-id-abc123'>player</a></div><div id='generic'><a href='https://www.pornhub.com/video/synthetic-id-abc123'>link</a></div></main>", { url: "https://www.pornhub.com/feed" }).window.document;
  const adapter = adapters.byId.pornhub;
  for (const element of [document, document.documentElement, document.body, document.querySelector("main"), document.querySelector("header div"), document.querySelector(".player"), document.querySelector("#generic"), document.querySelector("a")]) {
    assert.equal(adapter.identifyCandidate(element), null);
  }
});

test("nested eligible cards retain only the innermost card without pairwise filtering", () => {
  const document = new JSDOM("<div class='pcVideoListItem'><div class='pcVideoListItem'><a href='https://www.pornhub.com/video/synthetic-id-abc123'>link</a></div></div>", { url: "https://www.pornhub.com/feed" }).window.document;
  const adapter = adapters.byId.pornhub;
  const outer = document.querySelector(".pcVideoListItem");
  const inner = outer.querySelector(".pcVideoListItem");
  assert.equal(adapter.identifyCandidate(outer), null);
  assert.deepEqual(adapter.findCandidateContainers(document), [inner]);
});

test("different recognized links, huge ambiguous containers, and missing links remain visible", () => {
  const huge = "<a href='https://example.test/not-content'>noise</a>".repeat(300);
  const document = new JSDOM("<div class='pcVideoListItem' id='different'><a href='https://www.pornhub.com/video/synthetic-one-one111'>one</a><a href='https://www.pornhub.com/video/synthetic-two-two222'>two</a></div><div class='pcVideoListItem' id='missing'><a href='https://example.test/not-content'>missing</a></div><div class='pcVideoListItem' id='huge'>" + huge + "</div>", { url: "https://www.pornhub.com/feed" }).window.document;
  const adapter = adapters.byId.pornhub;
  assert.equal(adapter.identifyCandidate(document.querySelector("#different")), null);
  assert.equal(adapter.identifyCandidate(document.querySelector("#missing")), null);
  assert.equal(adapter.identifyCandidate(document.querySelector("#huge")), null);
  assert.equal(adapter.findCandidateContainers(document).length, 0);
});
