const test = require("node:test");
const assert = require("node:assert/strict");
const { contentRuntime, waitFor } = require("./helpers/runtime.js");

function card(id) {
  return `<article class="pcVideoListItem" data-video-id="${id}"><a href="https://www.pornhub.com/video/title-${id}">${id}</a></article>`;
}

function matcher(bookmarked = new Set()) {
  return (message) => ({
    indexReady: true,
    enabled: true,
    revision: 1,
    matches: message.candidates.map((candidate) => ({ token: candidate.token, matched: bookmarked.has(candidate.url) }))
  });
}

test("large discovery uses bounded batches and yields across 1000 and 10000 cards", async () => {
  for (const size of [1000, 10000]) {
    const runtime = await contentRuntime({
      html: Array.from({ length: size }, (_, index) => card(`bulk-${size}-${index}`)).join(""),
      response: matcher(),
      waitTimeout: size > 5000 ? 10000 : 2000
    });
    await runtime.settle();
    const batches = runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").map((message) => message.candidates.length);
    assert.equal(batches.every((batch) => batch > 0 && batch <= 200), true, `batch bound ${size}`);
    assert.equal(batches.reduce((total, batch) => total + batch, 0), size, `card coverage ${size}`);
    runtime.dom.window.close();
  }
});

test("an insertion after an active traversal point is discovered while a request is in flight", async () => {
  let started = false;
  let mutationObserved = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = contentRuntime({
    html: Array.from({ length: 2500 }, (_, index) => card(`long-${index}`)).join(""),
    onMessage: (message, dom) => {
      if (message.type === "GET_PAGE_MATCHES" && !started) {
        started = true;
        dom.window.document.querySelector("article").insertAdjacentHTML("afterend", card("inserted"));
        setTimeout(() => { mutationObserved = true; }, 0);
      }
    },
    response: async (message) => {
      await gate;
      return matcher(new Set(["https://www.pornhub.com/video/title-inserted"]))(message);
    }
  });
  await waitFor(() => started);
  await waitFor(() => mutationObserved);
  // The first cards have already been visited when the first request starts.
  // The mutation root must still be scanned independently of that traversal.
  release();
  const runtime = await pending;
  await runtime.settle();
  assert.equal(runtime.dom.window.document.querySelector("article[data-video-id='inserted']").classList.contains("bookmark-filter-hidden"), true);
  runtime.dom.window.close();
});

test("BOOKMARKS_CHANGED during a scan invalidates the old generation and rescans the latest snapshot", async () => {
  let started = false;
  let changed = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = contentRuntime({
    html: Array.from({ length: 1200 }, (_, index) => card(`revision-${index}`)).join(""),
    onMessage: (message, dom, dispatch) => {
      if (message.type === "GET_PAGE_MATCHES" && !started) {
        started = true;
        dom.window.document.body.insertAdjacentHTML("beforeend", card("revision-latest"));
        setTimeout(() => { dispatch({ type: "BOOKMARKS_CHANGED" }); changed = true; }, 0);
      }
    },
    response: async (message) => {
      if (started && !changed) await gate;
      return matcher()(message);
    },
    waitTimeout: 5000
  });
  await waitFor(() => started);
  await waitFor(() => changed);
  release();
  const runtime = await pending;
  await runtime.settle();
  const status = await runtime.message({ type: "GET_PAGE_STATUS" });
  assert.equal(status.status, "ready");
  assert.equal(status.recognizedCount, 1201);
  assert.equal(status.scanning, false);
  runtime.dom.window.close();
});

test("multiple mutation roots are deduplicated by candidate identity and removals fail open", async () => {
  const runtime = await contentRuntime({ html: "<div id='one'></div><div id='two'></div>", response: matcher(new Set(["https://www.pornhub.com/video/title-saved"])) });
  const one = runtime.dom.window.document.querySelector("#one");
  const two = runtime.dom.window.document.querySelector("#two");
  one.insertAdjacentHTML("beforeend", card("saved"));
  two.insertAdjacentHTML("beforeend", card("new"));
  await runtime.settle();
  assert.equal(one.querySelector("article").classList.contains("bookmark-filter-hidden"), true);
  assert.equal(two.querySelector("article").classList.contains("bookmark-filter-hidden"), false);

  const saved = one.querySelector("article");
  saved.remove();
  await runtime.settle();
  const status = await runtime.message({ type: "GET_PAGE_STATUS" });
  assert.equal(status.recognizedCount, 1);
  assert.equal(status.matchedCount, 0);
  runtime.dom.window.close();
});

test("a 10000-root mutation storm stays bounded and covers each inserted card", async (t) => {
  const rootCount = 10000;
  const runtime = await contentRuntime({
    html: Array.from({ length: rootCount }, (_, index) => `<div id="root-${index}"></div>`).join(""),
    response: matcher(),
    waitTimeout: 10000
  });
  const document = runtime.dom.window.document;
  const nodePrototype = runtime.dom.window.Node.prototype;
  const originalContains = nodePrototype.contains;
  let containsCalls = 0;
  nodePrototype.contains = function (...args) { containsCalls += 1; return originalContains.apply(this, args); };
  t.after(() => {
    nodePrototype.contains = originalContains;
    runtime.dom.window.close();
  });
  const roots = [...document.querySelectorAll("div[id^='root-']")];
  for (let index = 0; index < rootCount; index += 1) roots[index].innerHTML = card(`storm-${index}`);
  await runtime.settle();
  const batches = runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").map((message) => message.candidates.length);
  assert.equal(batches.reduce((total, batch) => total + batch, 0), rootCount);
  assert.equal(batches.every((batch) => batch <= 200), true);
  assert.equal(containsCalls < 1000, true);
});

test("all page status responses expose bounded scan and surface fields", async () => {
  const runtime = await contentRuntime({
    url: "https://search.literotica.com/?query=journey",
    html: `<div class="panel ai_gJ"><div class="ai_iG"><a class="ai_ii" href="https://www.literotica.com/s/status-card"><h4>Status card</h4></a></div></div>`,
    response: matcher(new Set())
  });
  for (const message of [
    { type: "GET_PAGE_STATUS" },
    { type: "SET_SHOW_HIDDEN", enabled: true },
    { type: "SET_SITE_ENABLED", siteId: "literotica", enabled: true },
    { type: "RETRY_FILTER" }
  ]) {
    const response = await runtime.message(message);
    assert.equal(typeof response.recognizedCount, "number");
    assert.equal(typeof response.matchedCount, "number");
    assert.equal(typeof response.scanning, "boolean");
    assert.equal(response.errorCode, null);
    assert.equal(response.surfaceVerification, "live-layout-inspected");
  }
  runtime.dom.window.close();
});
