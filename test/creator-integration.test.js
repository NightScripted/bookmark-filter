const test = require("node:test");
const assert = require("node:assert/strict");
const { contentRuntime, wait, waitFor: waitContent } = require("./helpers/runtime.js");
const { createConnectedExtension, waitFor } = require("./helpers/connected-extension.js");
const adapters = require("../content/adapters.js");
const fs = require("node:fs");
const path = require("node:path");

function bookmark(url, id = url) {
  return { id, title: id, url };
}

function tree(...nodes) {
  return [{ id: "root", title: "Bookmarks", children: nodes }];
}

function card(id, mediaUrl, creatorUrl) {
  return `<article class="pcVideoListItem" id="card-${id}"><a href="${mediaUrl}">${id}</a><a href="${creatorUrl}">creator</a></article>`;
}

function litFixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", "literotica", name), "utf8");
}

async function pageStatus(runtime, tab) {
  return runtime.sendToTab(tab.id, { type: "GET_PAGE_STATUS" });
}

async function waitPage(runtime, tab, predicate, label) {
  let current;
  await waitFor(async () => {
    current = await pageStatus(runtime, tab);
    return predicate(current) && current.scanning === false;
  }, { label });
  return current;
}

test("Lit creator fixtures highlight only the same-site author on the supported surface", async () => {
  const cases = [
    ["creators-search.html", "https://search.literotica.com/?query=synthetic", "#search-positive", ["#search-missing-creator", "#search-cross-site-creator", "#search-ambiguous"]],
    ["creators-tags.html", "https://tags.literotica.com/synthetic/", "#tags-positive", ["#tags-missing-creator", "#tags-cross-site-creator", "#tags-wrapper-only"]],
    ["creators-top.html", "https://www.literotica.com/top/stories", "#top-positive", ["#top-missing-creator", "#top-cross-site-creator"]]
  ];
  for (const [fixtureName, url, positiveSelector, negativeSelectors] of cases) {
    const runtime = await contentRuntime({
      url,
      html: litFixture(fixtureName),
      response: (message) => ({ indexReady: true, enabled: true, matches: message.candidates.map((candidate) => ({
        token: candidate.token,
        mediaBookmarked: false,
        creatorBookmarked: (candidate.creatorUrls || []).some((creatorUrl) => adapters.normalizeCreatorUrl(creatorUrl) === "literotica:creator:authors:Synthetic")
      })) })
    });
    try {
      const positive = runtime.dom.window.document.querySelector(positiveSelector);
      assert.equal(positive.classList.contains("bookmark-filter-creator-highlight"), true, fixtureName);
      assert.equal(runtime.dom.window.document.querySelectorAll(".bookmark-filter-creator-highlight").length, 1, fixtureName);
      for (const selector of negativeSelectors) {
        const element = runtime.dom.window.document.querySelector(selector);
        assert.equal(element?.classList.contains("bookmark-filter-creator-highlight"), false, `${fixtureName} ${selector}`);
        assert.equal(element?.querySelector(".bookmark-filter-creator-badge"), null, `${fixtureName} ${selector}`);
      }
    } finally {
      runtime.dom.window.close();
    }
  }
});

test("content creator badges quiesce, clear on author replacement, and recover after error retry", async () => {
  const creator = "https://www.pornhub.com/users/Casey";
  let unavailable = false;
  let mediaBookmarked = false;
  const runtime = await contentRuntime({
    html: card("creator-only", "https://www.pornhub.com/video/title-new", creator),
    response: (message) => unavailable
      ? { error: "unavailable" }
      : { indexReady: true, enabled: true, matches: message.candidates.map((candidate) => ({
        token: candidate.token,
        mediaBookmarked,
        creatorBookmarked: (candidate.creatorUrls || []).some((url) => adapters.normalizeCreatorUrl(url) === adapters.normalizeCreatorUrl(creator))
      })) }
  });
  try {
    const element = runtime.dom.window.document.querySelector("article");
    const author = element.querySelectorAll("a")[1];
    assert.equal(element.classList.contains("bookmark-filter-creator-highlight"), true);
    assert.equal(element.querySelector(".bookmark-filter-creator-badge").textContent, "Bookmarked creator");
    await runtime.settle();
    element.querySelector(".bookmark-filter-creator-badge").remove();
    await runtime.settle();
    assert.equal(element.querySelector(".bookmark-filter-creator-badge").textContent, "Bookmarked creator");

    mediaBookmarked = true;
    await runtime.message({ type: "BOOKMARKS_CHANGED" });
    await runtime.settle();
    assert.equal(element.querySelector(".bookmark-filter-creator-badge").textContent, "Saved · Bookmarked creator");
    const savedLabelRequests = runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").length;
    await wait(100);
    assert.equal(runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").length, savedLabelRequests);

    mediaBookmarked = false;
    await runtime.message({ type: "BOOKMARKS_CHANGED" });
    await runtime.settle();
    assert.equal(element.querySelector(".bookmark-filter-creator-badge").textContent, "Bookmarked creator");
    const unsavedLabelRequests = runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").length;
    await wait(100);
    assert.equal(runtime.calls.filter((message) => message.type === "GET_PAGE_MATCHES").length, unsavedLabelRequests);

    const ownedBadge = element.querySelector(".bookmark-filter-creator-badge");
    const originalAuthor = element.querySelectorAll("a")[1];
    originalAuthor.parentNode.replaceChild(ownedBadge, originalAuthor);
    await runtime.settle();
    let status = await runtime.message({ type: "GET_PAGE_STATUS" });
    assert.equal(status.creatorMatchedCount, 0);
    assert.equal(element.querySelector(".bookmark-filter-creator-badge"), null);

    const replacementAuthor = runtime.dom.window.document.createElement("a");
    replacementAuthor.href = creator;
    replacementAuthor.textContent = "creator";
    element.append(replacementAuthor);
    await runtime.settle();
    assert.equal((await runtime.message({ type: "GET_PAGE_STATUS" })).creatorMatchedCount, 1);

    replacementAuthor.href = "https://www.example.test/users/Casey";
    await runtime.settle();
    status = await runtime.message({ type: "GET_PAGE_STATUS" });
    assert.equal(status.creatorMatchedCount, 0);
    assert.equal(element.querySelector(".bookmark-filter-creator-badge"), null);
    assert.equal(element.classList.contains("bookmark-filter-creator-highlight"), false);

    replacementAuthor.href = creator;
    await runtime.settle();
    assert.equal((await runtime.message({ type: "GET_PAGE_STATUS" })).creatorMatchedCount, 1);
    assert.ok(element.querySelector(".bookmark-filter-creator-badge"));

    await runtime.message({ type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: false });
    assert.equal(element.querySelector(".bookmark-filter-creator-badge"), null);
    unavailable = true;
    await runtime.message({ type: "BOOKMARKS_CHANGED" });
    await runtime.settle();
    status = await runtime.message({ type: "GET_PAGE_STATUS" });
    assert.equal(status.status, "error");
    assert.equal(element.querySelector(".bookmark-filter-creator-badge"), null);

    unavailable = false;
    await runtime.message({ type: "RETRY_FILTER" });
    await runtime.settle();
    status = await runtime.message({ type: "GET_PAGE_STATUS" });
    assert.equal(status.status, "ready");
    assert.equal(status.creatorMatchedCount, 1);
    assert.ok(element.querySelector(".bookmark-filter-creator-badge"));
  } finally {
    runtime.dom.window.close();
  }
});

test("connected creator lifecycle keeps media and creator counts separate across bookmark events, restart, popup, and settings", async () => {
  const mediaSaved = "https://www.pornhub.com/video/title-saved";
  const mediaNew = "https://www.pornhub.com/video/title-new";
  const mediaMorgan = "https://www.pornhub.com/video/title-morgan";
  const casey = "https://www.pornhub.com/users/Casey";
  const morgan = "https://www.pornhub.com/users/Morgan";
  const runtime = createConnectedExtension({ tree: tree(bookmark(mediaSaved, "media"), bookmark(casey, "casey")) });
  const tab = runtime.openTab({
    id: "creator-lifecycle",
    url: "https://www.pornhub.com/videos",
    html: `${card("creator-only", mediaNew, casey)}${card("saved-and-creator", mediaSaved, casey)}`
  });

  try {
    let status = await waitPage(runtime, tab, (state) => state.status === "ready" && state.creatorMatchedCount === 2, "initial creator scan");
    assert.deepEqual({ recognizedCount: status.recognizedCount, matchedCount: status.matchedCount, hiddenCount: status.hiddenCount, creatorMatchedCount: status.creatorMatchedCount, highlightedCount: status.highlightedCount }, { recognizedCount: 2, matchedCount: 1, hiddenCount: 1, creatorMatchedCount: 2, highlightedCount: 1 });
    const cards = tab.dom.window.document.querySelectorAll("article");
    assert.equal(cards[0].querySelector(".bookmark-filter-creator-badge").textContent, "Bookmarked creator");
    assert.equal(cards[1].querySelector(".bookmark-filter-creator-badge").textContent, "Saved · Bookmarked creator");
    assert.equal(cards[1].classList.contains("bookmark-filter-hidden"), true);

    const popup = runtime.openPopup();
    await waitFor(async () => (await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" })).status === "ready", { label: "creator index ready" });
    const index = await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" });
    assert.equal(index.total, 1);
    assert.equal(index.creatorTotal, 1);

    const show = popup.dom.window.document.querySelector("#show");
    await waitFor(() => !show.disabled, { label: "show control ready" });
    show.click();
    status = await waitPage(runtime, tab, (state) => state.showHidden === true && state.hiddenCount === 0, "reveal saved creator card");
    assert.equal(status.highlightedCount, 2);
    assert.equal(cards[1].querySelector(".bookmark-filter-creator-badge").textContent, "Saved · Bookmarked creator");
    show.click();
    await waitPage(runtime, tab, (state) => state.showHidden === false && state.hiddenCount === 1, "hide saved creator card again");

    tab.dom.window.document.body.insertAdjacentHTML("beforeend", card("dynamic", mediaMorgan, morgan));
    status = await waitPage(runtime, tab, (state) => state.recognizedCount === 3 && state.creatorMatchedCount === 2, "dynamic creator card scan");
    assert.equal(status.highlightedCount, 1);
    runtime.tree = tree(bookmark(mediaSaved, "media"), bookmark(casey, "casey"), bookmark(morgan, "morgan"));
    runtime.emitBookmarkCreated("morgan", bookmark(morgan, "morgan"));
    status = await waitPage(runtime, tab, (state) => state.creatorMatchedCount === 3, "creator bookmark create");
    assert.equal(status.highlightedCount, 2);
    runtime.emitBookmarkRemoved("duplicate-morgan", { parentId: "root", node: bookmark(morgan, "duplicate-morgan") });
    status = await waitPage(runtime, tab, (state) => state.creatorMatchedCount === 3, "duplicate creator removal remains matched");
    assert.equal(status.highlightedCount, 2);

    runtime.tree = tree(bookmark(mediaSaved, "media"), bookmark(casey, "casey"));
    runtime.emitBookmarkChanged("morgan", { url: "https://www.pornhub.com/users/Morgan" });
    status = await waitPage(runtime, tab, (state) => state.creatorMatchedCount === 2, "creator bookmark change removes Morgan");
    assert.equal(status.highlightedCount, 1);

    runtime.tree = tree();
    runtime.emitFolderDeleted("root", { parentId: "bookmarks", node: { children: [] } });
    status = await waitPage(runtime, tab, (state) => state.matchedCount === 0 && state.creatorMatchedCount === 0, "folder deletion clears creator matches");
    assert.equal(status.hiddenCount, 0);

    runtime.tree = tree(bookmark(casey, "casey"));
    runtime.recreateWorker();
    runtime.emitBookmarkChanged("casey", { url: casey });
    status = await waitPage(runtime, tab, (state) => state.status === "ready" && state.matchedCount === 0 && state.creatorMatchedCount === 2, "restarted worker restores creator index");
    assert.equal(status.highlightedCount, 2);

    const toggle = popup.dom.window.document.querySelector("#site-pornhub");
    await waitFor(() => toggle && !toggle.disabled, { label: "Pornhub setting ready" });
    toggle.click();
    await waitFor(() => runtime.storage["enabledBySite:pornhub"] === false, { label: "creator setting disabled" });
    await waitPage(runtime, tab, (state) => state.enabled === false && state.hiddenCount === 0, "creator setting disabled propagation");
    assert.equal(tab.dom.window.document.querySelectorAll(".bookmark-filter-creator-badge").length, 0);
    toggle.click();
    await waitFor(() => runtime.storage["enabledBySite:pornhub"] === true, { label: "creator setting enabled" });
    await waitPage(runtime, tab, (state) => state.enabled === true && state.creatorMatchedCount === 2, "creator setting enabled propagation");

    await waitFor(() => popup.dom.window.document.querySelector("#page").textContent === "Bookmarked creator cards highlighted.", { label: "popup creator-only state" });
    const countText = popup.dom.window.document.querySelector("#count").textContent;
    assert.equal(countText.includes("No bookmark matches"), false);
    assert.match(countText, /saved media: 0; cards from bookmarked creators: 2/);
    assert.equal(tab.dom.window.document.querySelectorAll(".bookmark-filter-creator-highlight").length, 2);
  } finally {
    runtime.dispose();
  }
});
