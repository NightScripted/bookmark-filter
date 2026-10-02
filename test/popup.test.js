const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const popupSource = fs.readFileSync(path.join(__dirname, "../popup/popup.js"), "utf8");
const markup = `<main><p id="page"></p><p id="surface-status"></p><p id="index-status"></p><fieldset id="sites"></fieldset><p id="settings-status"></p><p id="count"></p><button id="show"></button><button id="retry" hidden>Retry</button><p id="action-status"></p><p id="incognito"></p></main>`;

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageState(overrides = {}) {
  return { siteId: "pornhub", hiddenCount: 2, showHidden: false, enabled: true, status: "ready", recognizedCount: 3, matchedCount: 2, scanning: false, errorCode: null, surfaceVerification: "live-layout-inspected", ...overrides };
}

function popupHarness(options = {}, t) {
  const dom = new JSDOM(markup, { url: "chrome-extension://ext/popup/popup.html", runScripts: "outside-only", pretendToBeVisual: true });
  const calls = [];
  const settings = { pornhub: true, xvideos: true, xhamster: true, literotica: true };
  let currentPage = Object.prototype.hasOwnProperty.call(options, "page") ? options.page : pageState();
  const revealPage = options.revealPage || pageState();
  let currentIndex = options.index || { ready: true, total: 2, revision: 1, status: "ready" };
  let settingFailure = Boolean(options.settingFailure);
  let settingsReads = 0;
  const storageListeners = [];
  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        calls.push({ channel: "runtime", message });
        if (message.type === "GET_SETTINGS") {
          settingsReads += 1;
          if (options.settingsReader) return options.settingsReader(settingsReads);
          return options.settingsFailure ? { error: "unavailable" } : { enabledBySite: { ...settings } };
        }
        if (message.type === "SET_SITE_ENABLED") {
          if (options.settingResponse) return options.settingResponse(message);
          if (settingFailure) return { error: "storage_failed" };
          settings[message.siteId] = message.enabled;
          return { enabledBySite: { ...settings } };
        }
        if (message.type === "GET_INDEX_STATUS") {
          if (message.retry) currentIndex = options.retryIndex || { ready: true, total: 2, revision: 2, status: "ready" };
          return typeof currentIndex === "function" ? currentIndex(message) : currentIndex;
        }
        return undefined;
      }
    },
    tabs: {
      query: (_query, callback) => callback([{ id: 7 }]),
      sendMessage: async (_tab, message) => {
        calls.push({ channel: "tab", message });
        if (message.type === "GET_PAGE_STATUS") return typeof currentPage === "function" ? currentPage(message) : currentPage;
        if (message.type === "RETRY_FILTER") {
          currentPage = options.retryPage || pageState();
          return currentPage;
        }
        if (message.type === "SET_SHOW_HIDDEN") {
          if (options.revealFailure) return null;
          if (options.revealResponse) return options.revealResponse(message);
          currentPage = { ...revealPage, showHidden: message.enabled, hiddenCount: message.enabled ? 0 : 2 };
          return currentPage;
        }
        if (message.type === "SET_SITE_ENABLED") return { ...currentPage, enabled: message.enabled };
        return null;
      }
    },
    extension: { isAllowedIncognitoAccess: async () => options.incognitoAllowed !== false },
    storage: { onChanged: { addListener: (listener) => storageListeners.push(listener) } }
  };
  dom.window.chrome = chrome;
  dom.window.Function(popupSource)();
  t?.after(() => dom.window.close());
  return {
    dom,
    calls,
    settings,
    setSettingFailure(value) { settingFailure = value; },
    fireStorageChange() { storageListeners.forEach((listener) => listener({ enabledBySite: { newValue: { ...settings } } }, "local")); },
    async settle(ms = 40) { await wait(ms); }
  };
}

test("popup renders four labelled controls, live count, and setting events", async (t) => {
  const dom = new JSDOM(markup, { url: "chrome-extension://ext/popup/popup.html", runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const sent = [];
  const settings = { pornhub: true, xvideos: false, xhamster: true, literotica: true };
  dom.window.chrome = {
    runtime: { sendMessage: async (message) => { sent.push(message); if (message.type === "GET_SETTINGS") return { enabledBySite: settings }; if (message.type === "SET_SITE_ENABLED") { settings[message.siteId] = message.enabled; return { enabledBySite: settings }; } if (message.type === "GET_INDEX_STATUS") return { ready: true, total: 1 }; } },
    tabs: { query: (_query, callback) => callback([{ id: 7 }]), sendMessage: async (_tab, message) => message.type === "GET_PAGE_STATUS" ? { siteId: "pornhub", status: "ready", enabled: true, hiddenCount: 2, showHidden: false } : { siteId: "pornhub", status: "ready", enabled: message.enabled, hiddenCount: message.enabled ? 2 : 0, showHidden: false } },
    extension: { isAllowedIncognitoAccess: async () => true }
  };
  dom.window.Function(popupSource)();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const inputs = [...dom.window.document.querySelectorAll("input[type=checkbox]")];
  assert.equal(inputs.length, 4);
  assert.equal(inputs.every((input) => input.getAttribute("aria-label")), true);
  assert.match(dom.window.document.querySelector("#count").textContent, /2/);
  inputs[0].click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(sent.some((message) => message.type === "SET_SITE_ENABLED" && message.siteId === "pornhub" && message.enabled === false), true);
  dom.window.close();
});

test("popup explains error, empty, unmatched, scanning, disabled, unverified, and unsupported states", async (t) => {
  const cases = [
    [{ status: "error", errorCode: "index_unavailable", recognizedCount: null, matchedCount: null }, "filtering unavailable", "hidden count is unavailable"],
    [{ recognizedCount: 0, matchedCount: 0, surfaceVerification: "unverified" }, "No recognized cards (page may be empty or unsupported)", "Site layout is unverified"],
    [{ recognizedCount: 4, matchedCount: 0 }, "No bookmark matches", "No bookmark matches"],
    [{ enabled: false }, "filtering disabled", "Filtering disabled; hidden cards are shown"],
    [{ status: "indexing", scanning: true }, "scanning this page", "Scanning this page"],
    [{ surfaceVerification: "saved-html-inspected" }, "filtering ready", "Saved page HTML inspected; live extension behavior not yet verified"],
    [{ surfaceVerification: "live-layout-inspected" }, "filtering ready", "native extension behavior not yet verified"]
  ];
  for (const [overrides, pageText, secondaryText] of cases) {
    const harness = popupHarness({ page: pageState(overrides) }, t);
    await harness.settle();
    assert.ok(harness.dom.window.document.querySelector("#page").textContent.toLowerCase().includes(pageText.toLowerCase()));
    assert.ok(`${harness.dom.window.document.querySelector("#count").textContent} ${harness.dom.window.document.querySelector("#surface-status").textContent}`.toLowerCase().includes(secondaryText.toLowerCase()));
    harness.dom.window.close();
  }

  const unsupported = popupHarness({ page: null }, t);
  await unsupported.settle();
  assert.match(unsupported.dom.window.document.querySelector("#page").textContent, /Unsupported page/);
  assert.equal(unsupported.dom.window.document.querySelector("#show").disabled, true);
  unsupported.dom.window.close();
});

test("popup keeps reveal state on success and visibly reports reveal failure", async (t) => {
  const working = popupHarness({ page: pageState({ matchedCount: 2, hiddenCount: 2 }) }, t);
  await working.settle();
  const show = working.dom.window.document.querySelector("#show");
  show.click();
  await working.settle();
  assert.equal(working.calls.some(({ message }) => message.type === "SET_SHOW_HIDDEN" && message.enabled === true), true);
  assert.match(show.textContent, /Hide hidden/);
  assert.match(working.dom.window.document.querySelector("#count").textContent, /Hidden on this page: 0/);
  working.dom.window.close();

  const failed = popupHarness({ page: pageState(), revealFailure: true }, t);
  await failed.settle();
  const failedShow = failed.dom.window.document.querySelector("#show");
  failedShow.click();
  await failed.settle();
  assert.equal(failedShow.disabled, false);
  assert.equal(failedShow.getAttribute("aria-pressed"), "false");
  assert.match(failed.dom.window.document.querySelector("#action-status").textContent, /current setting was kept/);
  failed.dom.window.close();
});

test("popup restores a setting after save failure and synchronizes storage without replacing controls", async (t) => {
  const harness = popupHarness({ settingFailure: true }, t);
  await harness.settle();
  const input = harness.dom.window.document.querySelector("#site-pornhub");
  input.click();
  await harness.settle();
  assert.equal(input.checked, true);
  assert.match(harness.dom.window.document.querySelector("#settings-status").textContent, /Could not save.*restored/);

  harness.setSettingFailure(false);
  harness.settings.pornhub = false;
  harness.fireStorageChange();
  await harness.settle();
  assert.equal(harness.dom.window.document.querySelector("#site-pornhub"), input);
  assert.equal(input.checked, false);
  harness.dom.window.close();
});

test("popup reports denied incognito access and retries both index and page errors", async (t) => {
  const incognito = popupHarness({ incognitoAllowed: false }, t);
  await incognito.settle();
  assert.match(incognito.dom.window.document.querySelector("#incognito").textContent, /Incognito access is disabled/);
  incognito.dom.window.close();

  const harness = popupHarness({ page: pageState({ status: "error", errorCode: "retryable" }), index: { status: "error", errorCode: "rebuild_failed", ready: false } }, t);
  await harness.settle();
  const retry = harness.dom.window.document.querySelector("#retry");
  assert.equal(retry.hidden, false);
  retry.click();
  await harness.settle(80);
  assert.equal(harness.calls.some(({ message }) => message.type === "GET_INDEX_STATUS" && message.retry === true), true);
  assert.equal(harness.calls.some(({ message }) => message.type === "RETRY_FILTER"), true);
  assert.match(harness.dom.window.document.querySelector("#page").textContent, /filtering ready/);
  assert.equal(retry.hidden, true);
  harness.dom.window.close();
});

test("popup does not overlap interval refreshes while an async refresh is pending", async (t) => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const harness = popupHarness({
    page: async () => {
      calls += 1;
      if (calls === 1) return pageState();
      active += 1;
      maximum = Math.max(maximum, active);
      await wait(1250);
      active -= 1;
      return pageState({ hiddenCount: calls });
    }
  }, t);
  await harness.settle(1120);
  await harness.settle(1300);
  assert.equal(maximum, 1);
  harness.dom.window.close();
});

test("a deferred poll cannot overwrite a completed reveal action or re-enable the control", async (t) => {
  let pageReads = 0;
  let releasePoll;
  const harness = popupHarness({
    page: async () => {
      pageReads += 1;
      if (pageReads === 2) return new Promise((resolve) => { releasePoll = resolve; });
      return pageState();
    },
    revealPage: pageState({ showHidden: true, hiddenCount: 0 })
  }, t);
  await harness.settle(40);
  await harness.settle(1050);
  assert.equal(typeof releasePoll, "function");
  const show = harness.dom.window.document.querySelector("#show");
  show.click();
  show.click();
  await harness.settle();
  assert.equal(harness.calls.filter(({ message }) => message.type === "SET_SHOW_HIDDEN").length, 1);
  assert.equal(show.getAttribute("aria-pressed"), "true");
  releasePoll(pageState({ showHidden: false, hiddenCount: 9 }));
  await harness.settle();
  assert.equal(show.getAttribute("aria-pressed"), "true");
  assert.match(harness.dom.window.document.querySelector("#count").textContent, /Hidden on this page: 0/);
  harness.dom.window.close();
});

test("a settings snapshot already in flight cannot overwrite a committed toggle", async (t) => {
  let releaseSnapshot;
  const harness = popupHarness({
    settingsReader: (read) => read === 2 ? new Promise((resolve) => { releaseSnapshot = resolve; }) : { enabledBySite: { pornhub: true, xvideos: true, xhamster: true, literotica: true } }
  }, t);
  await harness.settle();
  harness.fireStorageChange();
  await wait(0);
  const input = harness.dom.window.document.querySelector("#site-pornhub");
  input.click();
  await harness.settle();
  assert.equal(input.checked, false);
  releaseSnapshot({ enabledBySite: { pornhub: true, xvideos: true, xhamster: true, literotica: true } });
  await harness.settle();
  assert.equal(input.checked, false);
  harness.dom.window.close();
});

test("all site controls stay inert while a save or reveal action is pending", async (t) => {
  let releaseSave;
  const save = popupHarness({
    settingResponse: () => new Promise((resolve) => { releaseSave = resolve; })
  }, t);
  await save.settle();
  save.dom.window.document.querySelector("#site-pornhub").click();
  await wait(0);
  const secondSave = save.dom.window.document.querySelector("#site-xvideos");
  secondSave.click();
  assert.equal(secondSave.checked, true);
  assert.equal(save.calls.some(({ message }) => message.type === "SET_SITE_ENABLED" && message.siteId === "xvideos"), false);
  releaseSave({ enabledBySite: { pornhub: false, xvideos: true, xhamster: true, literotica: true } });
  await save.settle();
  save.dom.window.close();

  let releaseReveal;
  const reveal = popupHarness({
    revealResponse: () => new Promise((resolve) => { releaseReveal = resolve; })
  }, t);
  await reveal.settle();
  reveal.dom.window.document.querySelector("#show").click();
  await wait(0);
  const secondReveal = reveal.dom.window.document.querySelector("#site-xvideos");
  secondReveal.click();
  assert.equal(secondReveal.checked, true);
  assert.equal(reveal.calls.some(({ message }) => message.type === "SET_SITE_ENABLED" && message.siteId === "xvideos"), false);
  releaseReveal(pageState({ showHidden: true, hiddenCount: 0 }));
  await reveal.settle();
  reveal.dom.window.close();
});
