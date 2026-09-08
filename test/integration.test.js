const test = require("node:test");
const assert = require("node:assert/strict");
const { createConnectedExtension, waitFor } = require("./helpers/connected-extension.js");

function bookmark(url, id = url) {
  return { id, title: id, url };
}

function tree(...urls) {
  return [{ id: "root", title: "Bookmarks", children: urls.map((url, index) => bookmark(url, `bookmark-${index}`)) }];
}

function phCard(id) {
  return `<article class="pcVideoListItem"><a href="https://www.pornhub.com/video/title-${id}">${id}</a></article>`;
}

function litSearchCard(path = "https://www.literotica.com/s/connected-search-story") {
  return `<div class="panel ai_gJ"><div class="ai_iG"><a class="ai_ii" href="${path}"><h4>Connected search result</h4></a></div></div>`;
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

function assertReadyPage(status, expected) {
  assert.equal(status.status, "ready");
  assert.equal(status.scanning, false);
  assert.equal(status.errorCode, null);
  assert.equal(status.recognizedCount, expected.recognizedCount);
  assert.equal(status.matchedCount, expected.matchedCount);
  assert.equal(status.hiddenCount, expected.hiddenCount);
  assert.equal(typeof status.surfaceVerification, "string");
}

test("[simulated connected runtime] bookmark create/change/remove/folder-delete events update multiple live tabs", async () => {
  const saved = "https://www.pornhub.com/video/title-saved";
  const added = "https://www.pornhub.com/video/title-added";
  const runtime = createConnectedExtension({ tree: tree(saved, saved) });
  const tabA = runtime.openTab({ id: "tab-a", url: "https://www.pornhub.com/videos", html: `${phCard("saved")}${phCard("added")}` });
  const tabB = runtime.openTab({ id: "tab-b", url: "https://www.pornhub.com/videos?page=2", html: `${phCard("saved")}${phCard("added")}` });

  try {
    assertReadyPage(await waitPage(runtime, tabA, (state) => state.status === "ready", "initial tab A scan"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });
    assertReadyPage(await waitPage(runtime, tabB, (state) => state.status === "ready", "initial tab B scan"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });

    runtime.tree = tree(saved);
    runtime.emitBookmarkRemoved("duplicate", { parentId: "root", node: { url: saved } });
    assertReadyPage(await waitPage(runtime, tabA, (state) => state.status === "ready" && state.matchedCount === 1, "duplicate removal remains matched on tab A"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });
    assertReadyPage(await waitPage(runtime, tabB, (state) => state.status === "ready" && state.matchedCount === 1, "duplicate removal remains matched on tab B"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });

    runtime.tree = tree(saved, added);
    runtime.emitBookmarkCreated("added", bookmark(added));
    assertReadyPage(await waitPage(runtime, tabA, (state) => state.status === "ready" && state.matchedCount === 2, "bookmark create reaches tab A"), { recognizedCount: 2, matchedCount: 2, hiddenCount: 2 });
    assertReadyPage(await waitPage(runtime, tabB, (state) => state.status === "ready" && state.matchedCount === 2, "bookmark create reaches tab B"), { recognizedCount: 2, matchedCount: 2, hiddenCount: 2 });

    runtime.tree = tree(added);
    runtime.emitBookmarkChanged("saved", { url: added, title: "changed" });
    assertReadyPage(await waitPage(runtime, tabA, (state) => state.status === "ready" && state.matchedCount === 1, "bookmark change restores tab A"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });
    assertReadyPage(await waitPage(runtime, tabB, (state) => state.status === "ready" && state.matchedCount === 1, "bookmark change restores tab B"), { recognizedCount: 2, matchedCount: 1, hiddenCount: 1 });

    runtime.tree = tree();
    runtime.emitFolderDeleted("root", { parentId: "bookmarks", node: { children: [] } });
    assertReadyPage(await waitPage(runtime, tabA, (state) => state.status === "ready" && state.matchedCount === 0, "folder delete restores tab A"), { recognizedCount: 2, matchedCount: 0, hiddenCount: 0 });
    assertReadyPage(await waitPage(runtime, tabB, (state) => state.status === "ready" && state.matchedCount === 0, "folder delete restores tab B"), { recognizedCount: 2, matchedCount: 0, hiddenCount: 0 });
  } finally {
    runtime.dispose();
  }
});

test("[simulated connected runtime] Literotica search cards use the supported panel and /s/ identity", async () => {
  const saved = "https://www.literotica.com/s/connected-search-story";
  const runtime = createConnectedExtension({ tree: tree(saved) });
  const tab = runtime.openTab({
    id: "lit-search",
    url: "https://search.literotica.com/?query=connected",
    html: litSearchCard()
  });

  try {
    const status = await waitPage(runtime, tab, (state) => state.status === "ready", "Literotica search scan");
    assertReadyPage(status, { recognizedCount: 1, matchedCount: 1, hiddenCount: 1 });
    assert.equal(status.surfaceVerification, "live-layout-inspected");
    assert.equal(tab.dom.window.document.querySelector("div.panel.ai_gJ").classList.contains("bookmark-filter-hidden"), true);
  } finally {
    runtime.dispose();
  }
});

test("[simulated connected runtime] recreating the worker preserves content tabs and popup readiness starts a fresh index build", async () => {
  const saved = "https://www.pornhub.com/video/title-saved";
  const runtime = createConnectedExtension({ tree: tree(saved) });
  const tab = runtime.openTab({ id: "persistent-tab", url: "https://www.pornhub.com/videos", html: phCard("saved") });

  try {
    await waitPage(runtime, tab, (state) => state.status === "ready", "pre-recreation content scan");
    runtime.recreateWorker();
    const releaseTreeRead = runtime.blockNextTreeRead();
    const popup = runtime.openPopup();
    const building = await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" });
    assert.equal(building.status, "building");
    assert.equal(building.ready, false);
    assert.equal(building.errorCode, null);
    releaseTreeRead();

    let ready;
    await waitFor(async () => {
      ready = await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" });
      return ready.status === "ready";
    }, { label: "fresh worker index ready" });
    assert.equal(ready.status, "ready");
    assert.equal(ready.ready, true);
    assert.equal(ready.total, 1);
    assert.equal(typeof ready.revision, "number");
    await waitPage(runtime, tab, (state) => state.status === "ready" && state.hiddenCount === 1, "persistent content tab after worker recreation");
    await waitFor(() => /ready/i.test(popup.dom.window.document.querySelector("#index-status").textContent), { label: "popup readiness render" });
  } finally {
    runtime.dispose();
  }
});

test("[simulated connected runtime] popup setting persistence propagates while show-hidden remains per page", async () => {
  const saved = "https://www.pornhub.com/video/title-saved";
  const runtime = createConnectedExtension({ tree: tree(saved) });
  const tabA = runtime.openTab({ id: "active-page", url: "https://www.pornhub.com/videos", html: phCard("saved") });
  const tabB = runtime.openTab({ id: "other-page", url: "https://www.pornhub.com/videos?page=2", html: phCard("saved") });
  runtime.activeTabId = tabA.id;

  try {
    await waitPage(runtime, tabA, (state) => state.status === "ready" && state.hiddenCount === 1, "setting test tab A initial state");
    await waitPage(runtime, tabB, (state) => state.status === "ready" && state.hiddenCount === 1, "setting test tab B initial state");
    const popup = runtime.openPopup();
    const show = popup.dom.window.document.querySelector("#show");
    await waitFor(() => !show.disabled, { label: "popup show control ready" });
    show.click();
    await waitPage(runtime, tabA, (state) => state.showHidden === true && state.hiddenCount === 0, "show hidden only on active page");
    assert.equal((await pageStatus(runtime, tabB)).showHidden, false);
    assert.equal((await pageStatus(runtime, tabB)).hiddenCount, 1);

    const pornhubToggle = popup.dom.window.document.querySelector("#site-pornhub");
    await waitFor(() => pornhubToggle && !pornhubToggle.disabled, { label: "popup setting control ready" });
    pornhubToggle.click();
    await waitFor(() => runtime.storage["enabledBySite:pornhub"] === false, { label: "setting persisted" });
    await waitPage(runtime, tabA, (state) => state.enabled === false && state.hiddenCount === 0, "setting propagated to active page");
    await waitPage(runtime, tabB, (state) => state.enabled === false && state.hiddenCount === 0, "setting propagated to other page");
    assert.equal((await pageStatus(runtime, tabA)).showHidden, true);
    assert.equal((await pageStatus(runtime, tabB)).showHidden, false);
    assert.equal(pornhubToggle.checked, false);
  } finally {
    runtime.dispose();
  }
});

test("[simulated connected runtime] failed and absent tab delivery is isolated, and retry rebuilds both index and page", async () => {
  const saved = "https://www.pornhub.com/video/title-saved";
  const runtime = createConnectedExtension({ tree: tree(saved) });
  const tab = runtime.openTab({ id: "surviving-tab", url: "https://www.pornhub.com/videos", html: phCard("saved") });
  runtime.addGhostTab({ id: "closed-tab", url: "https://www.pornhub.com/videos" });
  runtime.setTreeReadFailure(true);

  try {
    const failedPage = await waitPage(runtime, tab, (state) => state.status === "error", "page error after failed index read");
    assert.equal(failedPage.scanning, false);
    assert.equal(typeof failedPage.errorCode, "string");
    assert.equal(failedPage.hiddenCount, 0);

    const popup = runtime.openPopup();
    let failedIndex;
    await waitFor(async () => {
      failedIndex = await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" });
      return failedIndex.status === "error";
    }, { label: "index error status" });
    assert.equal(failedIndex.errorCode, "index_unavailable");
    assert.equal(failedIndex.ready, false);

    const retryBuilding = await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS", retry: true });
    assert.equal(retryBuilding.status, "building");
    assert.equal(retryBuilding.errorCode, null);
    await waitFor(async () => (await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" })).status === "error", { label: "failed retry reports error" });

    runtime.setTreeReadFailure(false);
    const retry = popup.dom.window.document.querySelector("#retry");
    await waitFor(() => !retry.hidden, { label: "popup retry control visible" });
    retry.click();
    await waitPage(runtime, tab, (state) => state.status === "ready" && state.hiddenCount === 1, "page retry restores filtering");
    await waitFor(async () => (await runtime.popupMessage(popup, { type: "GET_INDEX_STATUS" })).status === "ready", { label: "index retry succeeds" });
    assert.equal(tab.messages.some((message) => message.type === "RETRY_FILTER"), true);
    assert.equal((await pageStatus(runtime, tab)).errorCode, null);

    runtime.tree = tree();
    runtime.emitFolderDeleted("root", { parentId: "bookmarks", node: { children: [] } });
    await waitPage(runtime, tab, (state) => state.status === "ready" && state.matchedCount === 0 && state.hiddenCount === 0, "surviving tab after closed-tab delivery failure");
  } finally {
    runtime.dispose();
  }
});
