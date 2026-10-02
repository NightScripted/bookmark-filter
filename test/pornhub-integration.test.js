const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createConnectedExtension, waitFor } = require("./helpers/connected-extension.js");

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "pornhub", "creator.html"), "utf8");
const bookmark = (url, id) => ({ id: id || url, title: id || url, url });
const tree = (...nodes) => [{ id: "root", title: "Bookmarks", children: nodes }];

async function ready(runtime, tab) {
  let status;
  await waitFor(async () => {
    status = await runtime.sendToTab(tab.id, { type: "GET_PAGE_STATUS" });
    return status.status === "ready" && status.scanning === false;
  }, { label: "Pornhub fixture scan" });
  return status;
}

test("Pornhub MODEL tab uses explicit creator links and preserves saved/reveal/disable behavior", async () => {
  const creator = "https://www.pornhub.com/model/synthetic-owner/videos?o=mr#recent";
  const saved = "https://www.pornhub.com/view_video.php?viewkey=phcreator3";
  const runtime = createConnectedExtension({ tree: tree(bookmark(creator, "creator"), bookmark(saved, "saved")) });
  const tab = runtime.openTab({
    id: "pornhub-model-tab",
    url: "https://www.pornhub.com/model/synthetic-owner",
    html: fixture
  });

  try {
    let status = await ready(runtime, tab);
    assert.equal(status.recognizedCount, 3);
    assert.equal(status.matchedCount, 1);
    assert.equal(status.hiddenCount, 1);
    assert.equal(status.creatorMatchedCount, 1);
    assert.equal(status.highlightedCount, 1);

    const one = tab.dom.window.document.querySelector("#synthetic-creator-one");
    const own = tab.dom.window.document.querySelector("#synthetic-creator-own");
    assert.equal(one.classList.contains("bookmark-filter-creator-highlight"), true);
    assert.equal(own.classList.contains("bookmark-filter-hidden"), true);
    assert.equal(own.classList.contains("bookmark-filter-creator-highlight"), false);
    assert.equal(own.querySelector(".bookmark-filter-creator-badge"), null);

    status = await runtime.sendToTab(tab.id, { type: "SET_SHOW_HIDDEN", enabled: true });
    assert.equal(status.showHidden, true);
    assert.equal(status.hiddenCount, 0);
    assert.equal(own.classList.contains("bookmark-filter-hidden"), false);
    assert.equal(own.querySelector(".bookmark-filter-creator-badge"), null);

    status = await runtime.sendToTab(tab.id, { type: "SET_SITE_ENABLED", siteId: "pornhub", enabled: false });
    assert.equal(status.enabled, false);
    assert.equal(tab.dom.window.document.querySelectorAll(".bookmark-filter-hidden").length, 0);
    assert.equal(tab.dom.window.document.querySelectorAll(".bookmark-filter-creator-badge").length, 0);
  } finally {
    runtime.dispose();
  }
});
