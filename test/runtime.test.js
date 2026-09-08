const test = require("node:test");
const assert = require("node:assert/strict");
const { contentRuntime, wait } = require("./helpers/runtime.js");

function card(id) {
  return `<article class="pcVideoListItem" data-video-id="${id}"><a href="https://www.pornhub.com/video/title-${id}">${id}</a></article>`;
}

function matcher(bookmarked) {
  return (message) => ({
    indexReady: true,
    enabled: true,
    revision: 1,
    matches: message.candidates.map((candidate) => ({ token: candidate.token, matched: bookmarked.has(candidate.url) }))
  });
}

test("content hides certified cards, handles insertion, recycling, removal, and live count", async () => {
  const bookmarked = new Set(["https://www.pornhub.com/video/title-saved"]);
  const runtime = await contentRuntime({ html: `${card("saved")}<div id="root"></div>`, response: matcher(bookmarked) });
  const saved = runtime.dom.window.document.querySelector("article");
  assert.equal(saved.classList.contains("bookmark-filter-hidden"), true);

  const root = runtime.dom.window.document.querySelector("#root");
  root.insertAdjacentHTML("beforeend", card("saved"));
  await runtime.settle();
  assert.equal(root.querySelector("article").classList.contains("bookmark-filter-hidden"), true);

  const anchor = saved.querySelector("a");
  anchor.href = "https://www.pornhub.com/video/title-new";
  await runtime.settle();
  assert.equal(saved.classList.contains("bookmark-filter-hidden"), false);

  saved.remove();
  await wait(20);
  const status = await runtime.message({ type: "GET_PAGE_STATUS" });
  assert.equal(status.hiddenCount, 1);
  runtime.dom.window.close();
});

test("temporary reveal applies to later cards and failures fail open", async () => {
  let unavailable = false;
  const bookmarked = new Set(["https://www.pornhub.com/video/title-saved"]);
  const runtime = await contentRuntime({
    html: card("saved"),
    response: (message) => unavailable ? { error: "unavailable" } : matcher(bookmarked)(message)
  });
  const saved = runtime.dom.window.document.querySelector("article");
  const revealed = await runtime.message({ type: "SET_SHOW_HIDDEN", enabled: true });
  assert.equal(revealed.showHidden, true);
  assert.equal(saved.classList.contains("bookmark-filter-hidden"), false);
  runtime.dom.window.document.body.insertAdjacentHTML("beforeend", card("saved"));
  await runtime.settle();
  assert.equal(runtime.dom.window.document.querySelectorAll(".bookmark-filter-hidden").length, 0);

  unavailable = true;
  await runtime.message({ type: "BOOKMARKS_CHANGED" });
  await runtime.settle();
  const status = await runtime.message({ type: "GET_PAGE_STATUS" });
  assert.equal(status.status, "error");
  assert.equal(runtime.dom.window.document.querySelectorAll(".bookmark-filter-hidden").length, 0);
  runtime.dom.window.close();
});

test("empty pages reach ready state and large scans use bounded batches", async () => {
  const runtime = await contentRuntime({ html: "<p>No recommendations</p>", response: matcher(new Set()) });
  const status = await runtime.message({ type: "GET_PAGE_STATUS" });
  assert.equal(status.status, "ready");
  assert.equal(runtime.calls.some((message) => message.candidates.length === 0), true);
  runtime.dom.window.close();

  const large = await contentRuntime({ html: Array.from({ length: 205 }, (_, index) => card(`bulk${index}`)).join(""), response: matcher(new Set()) });
  await large.settle();
  const batches = large.calls.filter((message) => message.type === "GET_PAGE_MATCHES").map((message) => message.candidates.length);
  assert.equal(batches.every((size) => size <= 200), true);
  assert.equal(batches.reduce((sum, size) => sum + size, 0), 205);
  large.dom.window.close();
});

test("all supported adapter shapes hide and immediately restore through the content controls", async () => {
  const cases = [
    ["https://www.pornhub.com/videos", `<article class="pcVideoListItem"><a href="https://www.pornhub.com/video/title-abc123">saved</a></article>`, "https://www.pornhub.com/video/title-abc123"],
    ["https://www.xvideos.com", `<div class="thumb-block"><a href="https://www.xvideos.com/video-abc123/title">saved</a></div>`, "https://www.xvideos.com/video-abc123/title"],
    ["https://xhamster.com", `<div class="video-card"><a href="https://xhamster.com/videos/title-abc123.html">saved</a></div>`, "https://xhamster.com/videos/title-abc123.html"],
    ["https://tags.literotica.com/adventure/", `<article class="_card_ohlxb_16"><div class="_content_ohlxb_56"><h3 class="_title_ohlxb_52"><a href="https://www.literotica.com/s/example-story/chapter-1">saved</a></h3></div></article>`, "https://www.literotica.com/s/example-story/chapter-1"]
  ];
  for (const [url, html, savedUrl] of cases) {
    const runtime = await contentRuntime({ url, html, response: matcher(new Set([savedUrl])) });
    const element = runtime.dom.window.document.querySelector("article, .thumb-block, .video-card, li");
    assert.equal(element.classList.contains("bookmark-filter-hidden"), true, url);
    await runtime.message({ type: "SET_SITE_ENABLED", siteId: require("../content/adapters.js").forUrl(url).id, enabled: false });
    assert.equal(element.classList.contains("bookmark-filter-hidden"), false, url);
    runtime.dom.window.close();
  }
});

test("forced empty rescans survive async settings/route changes and selector removal restores cards", async () => {
  const runtime = await contentRuntime({ html: "<p id='empty'>No cards</p>", response: matcher(new Set()) });
  assert.equal((await runtime.message({ type: "GET_PAGE_STATUS" })).status, "ready");
  await runtime.message({ type: "SETTINGS_CHANGED", enabledBySite: { pornhub: false } });
  await runtime.message({ type: "SETTINGS_CHANGED", enabledBySite: { pornhub: true } });
  await runtime.settle();
  assert.equal((await runtime.message({ type: "GET_PAGE_STATUS" })).status, "ready");
  runtime.dom.window.close();

  const saved = await contentRuntime({ html: card("saved"), response: matcher(new Set(["https://www.pornhub.com/video/title-saved"])) });
  const element = saved.dom.window.document.querySelector("article");
  assert.equal(element.classList.contains("bookmark-filter-hidden"), true);
  element.className = "not-a-card";
  await saved.settle();
  assert.equal(element.classList.contains("bookmark-filter-hidden"), false);
  saved.dom.window.history.pushState({}, "", "/video/title-route");
  await saved.message({ type: "SET_SHOW_HIDDEN", enabled: true });
  await saved.message({ type: "GET_PAGE_STATUS" });
  assert.equal((await saved.message({ type: "GET_PAGE_STATUS" })).showHidden, false);
  saved.dom.window.close();
});

test("a forced empty request queued during an in-flight response is not lost", async () => {
  let first = true;
  const runtime = await contentRuntime({
    html: card("saved"),
    response: async (message) => {
      if (first) { first = false; await wait(140); }
      return matcher(new Set())(message);
    }
  });
  runtime.dom.window.document.querySelector("article").remove();
  await runtime.message({ type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: true });
  await runtime.settle();
  assert.equal((await runtime.message({ type: "GET_PAGE_STATUS" })).status, "ready");
  assert.equal(runtime.calls.filter((message) => message.candidates.length === 0).length >= 1, true);
  runtime.dom.window.close();
});

test("extension visibility changes preserve native hidden and inline style state", async () => {
  const runtime = await contentRuntime({ html: card("saved"), response: matcher(new Set(["https://www.pornhub.com/video/title-saved"])) });
  const element = runtime.dom.window.document.querySelector("article");
  element.hidden = true;
  element.style.display = "block";
  await runtime.message({ type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: false });
  assert.equal(element.hidden, true);
  assert.equal(element.style.display, "block");
  assert.equal(element.classList.contains("bookmark-filter-hidden"), false);
  runtime.dom.window.close();
});
