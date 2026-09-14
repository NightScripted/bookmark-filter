const test = require("node:test");
const assert = require("node:assert/strict");
const { worker } = require("./helpers/worker");

const sender = { id: "ext", frameId: 0, url: "https://www.pornhub.com/videos" };
const popupSender = { id: "ext", url: "chrome-extension://ext/popup/popup.html" };

function dispatch(instance, message, messageSender) {
  return new Promise((resolve) => instance.chrome.runtime.onMessage.send(message, messageSender, resolve));
}

test("popup-only startup status initiates a cold rebuild and returns ready metadata", async () => {
  const instance = worker([{ children: [{ url: "https://www.pornhub.com/video/title-saved" }] }]);
  const building = await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender);
  assert.deepEqual(JSON.parse(JSON.stringify(building)), { ready: false, total: 0, revision: 0, status: "building", errorCode: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ready = await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender);
  assert.equal(ready.status, "ready");
  assert.equal(ready.ready, true);
  assert.equal(ready.total, 1);
  assert.equal(ready.revision, 1);
  assert.equal(instance.treeReads, 1);
});

test("worker indexes creators independently and keeps the earliest duplicate date", async () => {
  const instance = worker([{ children: [
    { id: "late", dateAdded: 30, url: "https://www.pornhub.com/users/Casey" },
    { id: "early", dateAdded: 10, url: "https://www.pornhub.com/users/Casey" },
    { url: "https://www.pornhub.com/video/title-saved" }
  ] }]);
  const response = await instance.context.BookmarkFilterBackground.pageMatches({ type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "x", url: "https://www.pornhub.com/video/title-new", creatorUrls: ["https://www.pornhub.com/users/Casey"] }] }, sender);
  assert.equal(response.matches[0].mediaBookmarked, false);
  assert.equal(response.matches[0].creatorBookmarked, true);
  const invalidMedia = await instance.context.BookmarkFilterBackground.pageMatches({ type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "invalid", url: "https://www.pornhub.com/users/Other", creatorUrls: ["https://www.pornhub.com/users/Casey"] }] }, sender);
  assert.equal(invalidMedia.matches[0].creatorBookmarked, false);
  const index = instance.context.BookmarkFilterBackground.buildIndex([{ children: [{ id: "late", dateAdded: 30, url: "https://www.pornhub.com/users/Casey" }, { id: "early", dateAdded: 10, url: "https://www.pornhub.com/users/Casey" }] }]);
  assert.equal(index.total, 0);
  assert.equal(index.creatorTotal, 1);
  assert.equal(index.creatorsBySite.pornhub.get("pornhub:creator:users:Casey").dateAdded, 10);
});

test("concurrent status polls share the cold rebuild", async () => {
  const instance = worker([{ children: [] }]);
  let release;
  let reads = 0;
  const waiting = new Promise((resolve) => { release = resolve; });
  instance.chrome.bookmarks.getTree = async () => { reads += 1; await waiting; return [{ children: [] }]; };
  const statuses = await Promise.all([
    dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender),
    dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender)
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(statuses)), [
    { ready: false, total: 0, revision: 0, status: "building", errorCode: null },
    { ready: false, total: 0, revision: 0, status: "building", errorCode: null }
  ]);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  assert.equal((await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender)).status, "ready");
});

test("failed status rebuild reports a stable error until an explicit retry", async () => {
  const instance = worker([{ children: [] }]);
  let failed = true;
  let reads = 0;
  instance.chrome.bookmarks.getTree = async () => {
    reads += 1;
    if (failed) { failed = false; throw new Error("private bookmark backend detail"); }
    return [{ children: [{ url: "https://www.pornhub.com/video/title-saved" }] }];
  };
  assert.equal((await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender)).status, "building");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const error = await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender);
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { ready: false, total: 0, revision: 0, status: "error", errorCode: "index_unavailable" });
  assert.equal(JSON.stringify(error).includes("private bookmark backend detail"), false);
  assert.equal(reads, 1);
  assert.equal((await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender)).status, "error");
  assert.equal(reads, 1);
  assert.equal((await dispatch(instance, { type: "GET_INDEX_STATUS", retry: true }, popupSender)).status, "building");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ready = await dispatch(instance, { type: "GET_INDEX_STATUS" }, popupSender);
  assert.equal(ready.status, "ready");
  assert.equal(ready.total, 1);
  assert.equal(reads, 2);
});

test("forbidden status sender cannot initiate an index rebuild", async () => {
  const instance = worker([{ children: [] }]);
  const response = await dispatch(instance, { type: "GET_INDEX_STATUS" }, sender);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: "forbidden_sender", message: "forbidden_sender" });
  assert.equal(instance.treeReads, 0);
});

test("worker lazily builds once, normalizes worker-side URLs, and validates sender/request", async () => {
  const instance = worker([{ children: [{ url: "https://www.pornhub.com/video/title-saved" }] }]);
  const api = instance.context.BookmarkFilterBackground;
  const request = { type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "a", key: "pornhub:id:saved", url: "https://www.pornhub.com/video/title-new" }] };
  const first = await api.pageMatches(request, sender);
  const second = await api.pageMatches(request, sender);
  assert.equal(first.matches[0].matched, false);
  assert.equal(second.matches[0].matched, false);
  assert.equal(instance.treeReads, 1);
  assert.equal((await api.pageMatches({ ...request, siteId: "toString" }, sender)).error, "invalid_site");
  assert.equal((await api.pageMatches(request, { ...sender, frameId: 2 })).error, "forbidden_sender");
});

test("worker recovers after a failed rebuild without serving stale data", async () => {
  const instance = worker([{ children: [] }]);
  let failed = true;
  instance.chrome.bookmarks.getTree = async () => { if (failed) { failed = false; throw new Error("startup"); } return [{ children: [{ url: "https://www.pornhub.com/video/title-saved" }] }]; };
  const request = { type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "a", url: "https://www.pornhub.com/video/title-saved" }] };
  await assert.rejects(instance.context.BookmarkFilterBackground.pageMatches(request, sender));
  const recovered = await instance.context.BookmarkFilterBackground.pageMatches(request, sender);
  assert.equal(recovered.matches[0].matched, true);
});

test("worker recursively deduplicates folders and reruns a snapshot when a change lands during getTree", async () => {
  const instance = worker([{ children: [{ url: "https://www.pornhub.com/video/title-saved" }, { children: [{ url: "https://www.pornhub.com/video/title-saved" }] }] }]);
  const built = instance.context.BookmarkFilterBackground.buildIndex([{ children: [{ url: "https://www.pornhub.com/video/title-saved" }, { children: [{ url: "https://www.pornhub.com/video/title-saved" }] }] }]);
  assert.equal(built.total, 1);
  let release;
  let reads = 0;
  const waiting = new Promise((resolve) => { release = resolve; });
  instance.chrome.bookmarks.getTree = async () => {
    reads += 1;
    if (reads === 1) { await waiting; return [{ children: [] }]; }
    return [{ children: [{ url: "https://www.pornhub.com/video/title-new" }] }];
  };
  const rebuilding = instance.context.BookmarkFilterBackground.rebuildIndex();
  instance.chrome.bookmarks.onChanged.fire("id", { url: "https://www.pornhub.com/video/title-new" });
  release();
  const index = await rebuilding;
  assert.equal(reads, 2);
  assert.equal(index.bySite.pornhub.has("pornhub:id:new"), true);
});

test("per-site setting writes do not lose concurrent updates and import notifications are bounded", async () => {
  const instance = worker([{ children: [] }]);
  await Promise.all([instance.context.BookmarkFilterBackground.saveSiteSetting("pornhub", false), instance.context.BookmarkFilterBackground.saveSiteSetting("xvideos", false)]);
  const settings = await instance.context.BookmarkFilterBackground.getSettings();
  assert.equal(settings.enabledBySite.pornhub, false);
  assert.equal(settings.enabledBySite.xvideos, false);

  const delivered = [];
  instance.chrome.tabs.query = async () => [{ id: 4, url: "https://www.pornhub.com/videos" }];
  instance.chrome.tabs.sendMessage = async (_id, message) => delivered.push(message);
  instance.chrome.bookmarks.onImportBegan.fire();
  instance.chrome.bookmarks.onCreated.fire("1", {});
  await Promise.resolve();
  assert.equal(delivered.length, 0);
  instance.chrome.bookmarks.onChanged.fire("1", { url: "https://www.pornhub.com/video/title-new" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(delivered.length, 1);
  instance.chrome.bookmarks.onImportEnded.fire();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(delivered.length, 2);
});

test("worker rejects malformed payloads before touching the index", async () => {
  const instance = worker([{ children: [] }]);
  const api = instance.context.BookmarkFilterBackground;
  const oversized = { type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: Array.from({ length: 201 }, (_, index) => ({ token: String(index), url: "https://www.pornhub.com/video/title-x" })) };
  assert.equal((await api.pageMatches(oversized, sender)).error, "invalid_candidates");
  assert.equal((await api.pageMatches({ type: "NOPE" }, sender)).error, "invalid_request");
  assert.equal((await api.pageMatches({ type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "x", url: "javascript:alert(1)" }] }, sender)).matches[0].matched, false);
});

test("runtime message dispatch protects settings and preserves existing preferences on update", async () => {
  const shared = { enabledBySite: { pornhub: false } };
  const instance = worker([{ children: [] }], shared);
  instance.chrome.runtime.onInstalled.fire({ reason: "update" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const content = await dispatch(instance, { type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: true }, sender);
  assert.equal(content.error, "forbidden_sender");
  const popupSender = { id: "ext", url: "chrome-extension://ext/popup/popup.html" };
  const settingsBefore = await dispatch(instance, { type: "GET_SETTINGS" }, popupSender);
  assert.equal(settingsBefore.enabledBySite.pornhub, false);
  const changed = await dispatch(instance, { type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: true }, popupSender);
  assert.equal(changed.enabledBySite.pornhub, true);
  const settingsAfter = await dispatch(instance, { type: "GET_SETTINGS" }, popupSender);
  assert.equal(settingsAfter.enabledBySite.pornhub, true);
});

test("bookmark duplicate removal and folder removal rebuild matches and notify content tabs", async () => {
  let currentTree = [{ children: [{ url: "https://www.pornhub.com/video/title-saved" }, { children: [{ url: "https://www.pornhub.com/video/title-saved" }] }] }];
  const instance = worker(currentTree);
  instance.chrome.bookmarks.getTree = async () => currentTree;
  const delivered = [];
  instance.chrome.tabs.query = async () => [{ id: 9, url: "https://www.pornhub.com/videos" }];
  instance.chrome.tabs.sendMessage = async (_id, message) => delivered.push(message);
  const request = { type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "x", url: "https://www.pornhub.com/video/title-saved" }] };
  assert.equal((await instance.context.BookmarkFilterBackground.pageMatches(request, sender)).matches[0].matched, true);
  currentTree = [{ children: [{ url: "https://www.pornhub.com/video/title-saved" }] }];
  instance.chrome.bookmarks.onRemoved.fire("duplicate", {});
  assert.equal((await instance.context.BookmarkFilterBackground.pageMatches(request, sender)).matches[0].matched, true);
  currentTree = [{ children: [] }];
  instance.chrome.bookmarks.onRemoved.fire("folder", {});
  assert.equal((await instance.context.BookmarkFilterBackground.pageMatches(request, sender)).matches[0].matched, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(delivered.filter((message) => message.type === "BOOKMARKS_CHANGED").length >= 2, true);
});

test("a fresh worker instance rebuilds independently after bookmark changes", async () => {
  const oldWorker = worker([{ children: [{ url: "https://www.pornhub.com/video/title-old" }] }]);
  const freshWorker = worker([{ children: [{ url: "https://www.pornhub.com/video/title-new" }] }]);
  const oldRequest = { type: "GET_PAGE_MATCHES", siteId: "pornhub", candidates: [{ token: "x", url: "https://www.pornhub.com/video/title-old" }] };
  const newRequest = { ...oldRequest, candidates: [{ token: "x", url: "https://www.pornhub.com/video/title-new" }] };
  assert.equal((await oldWorker.context.BookmarkFilterBackground.pageMatches(oldRequest, sender)).matches[0].matched, true);
  assert.equal((await freshWorker.context.BookmarkFilterBackground.pageMatches(newRequest, sender)).matches[0].matched, true);
  assert.equal((await freshWorker.context.BookmarkFilterBackground.pageMatches(oldRequest, sender)).matches[0].matched, false);
});

test("normal and incognito worker settings can share per-site storage without clobbering", async () => {
  const shared = {};
  const normal = worker([{ children: [] }], shared);
  const incognito = worker([{ children: [] }], shared);
  await Promise.all([normal.context.BookmarkFilterBackground.saveSiteSetting("pornhub", false), incognito.context.BookmarkFilterBackground.saveSiteSetting("xvideos", false)]);
  const settings = await normal.context.BookmarkFilterBackground.getSettings();
  assert.equal(settings.enabledBySite.pornhub, false);
  assert.equal(settings.enabledBySite.xvideos, false);
});
