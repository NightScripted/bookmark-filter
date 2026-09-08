const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "../..");
const workerPath = path.join(root, "background/service-worker.js");
const popupPath = path.join(root, "popup/popup.js");
const popupMarkup = fs.readFileSync(path.join(root, "popup/popup.html"), "utf8");
const workerSource = fs.readFileSync(workerPath, "utf8");
const popupSource = fs.readFileSync(popupPath, "utf8");
const urlUtils = require(path.join(root, "shared/url-utils.js"));
const adapters = require(path.join(root, "content/adapters.js"));
const contentSource = fs.readFileSync(path.join(root, "content/content-script.js"), "utf8");

function event() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    fire(...args) { for (const listener of [...listeners]) listener(...args); },
    listeners
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function changedValues(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { oldValue: before[key], newValue: after[key] };
    }
  }
  return changes;
}

function dispatchListeners(listeners, message, sender) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackCount = 0;
    let keepAlive = false;
    const sendResponse = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      for (const listener of [...listeners]) {
        callbackCount += 1;
        const returned = listener(message, sender, sendResponse);
        if (returned === true) keepAlive = true;
        if (returned && typeof returned.then === "function") {
          returned.then(sendResponse, reject);
        } else if (returned !== true && returned !== false && returned !== undefined) {
          sendResponse(returned);
        }
      }
      if (callbackCount === 0) sendResponse(undefined);
      else if (!settled && !keepAlive) sendResponse(undefined);
      // Content listeners use synchronous sendResponse and popup/worker calls
      // use the callback after an async operation. A missing response is a
      // valid tabs.sendMessage result, so do not invent one here.
    } catch (error) {
      reject(error);
    }
  });
}

function waitFor(predicate, { timeout = 2500, interval = 10, label = "condition" } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (await predicate()) return resolve(true);
      } catch (_) {
        // The connected runtime can be between lifecycle states while polling.
      }
      if (Date.now() - started >= timeout) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(poll, interval);
    };
    poll();
  });
}

function workerInstance(runtime) {
  const bookmarks = {
    getTree: async () => {
      if (runtime.treeReadBlock) {
        runtime.treeReadBlock = null;
        if (!runtime.treeReadReleaseRequested) {
          await new Promise((resolve) => { runtime.releaseTreeRead = resolve; });
        }
        runtime.treeReadReleaseRequested = false;
        runtime.releaseTreeRead = null;
      }
      if (runtime.treeReadAlwaysFails || runtime.treeReadFailures > 0) {
        runtime.treeReadFailures -= 1;
        throw new Error("simulated_bookmark_read_failure");
      }
      runtime.treeReads += 1;
      return clone(runtime.tree);
    },
    onCreated: event(),
    onChanged: event(),
    onRemoved: event(),
    onMoved: event(),
    onImportBegan: event(),
    onImportEnded: event()
  };
  const storageLocal = {
    get: async (defaults) => Object.fromEntries(Object.keys(defaults || {}).map((key) => [
      key, runtime.storage[key] === undefined ? defaults[key] : runtime.storage[key]
    ])),
    set: async (values) => {
      const before = { ...runtime.storage };
      Object.assign(runtime.storage, clone(values));
      runtime.storageEvents.fire(changedValues(before, runtime.storage), "local");
    }
  };
  const chrome = {
    runtime: { id: runtime.extensionId, onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { local: storageLocal, onChanged: runtime.storageEvents },
    bookmarks,
    tabs: {
      query: async () => [...runtime.tabs.values()].filter((tab) => !tab.queryHidden).map(({ id, url }) => ({ id, url })),
      sendMessage: async (tabId, message) => runtime.sendToTab(tabId, message)
    }
  };
  const context = {
    chrome,
    console,
    Promise,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  context.importScripts = (...files) => files.forEach((file) => {
    const resolved = path.resolve(path.dirname(workerPath), file);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unexpected local import: ${file}`);
    vm.runInContext(fs.readFileSync(resolved, "utf8"), context, { filename: resolved });
  });
  vm.createContext(context);
  vm.runInContext(workerSource, context, { filename: workerPath });
  return { chrome, context, bookmarks };
}

function createConnectedExtension({ tree = [], storage = {}, activeTabId = null } = {}) {
  const runtime = {
    extensionId: "connected-test-extension",
    tree: clone(tree),
    storage,
    storageEvents: event(),
    tabs: new Map(),
    popups: new Set(),
    activeTabId,
    treeReads: 0,
    treeReadFailures: 0,
    treeReadBlock: null,
    treeReadReleaseRequested: false,
    releaseTreeRead: null,
    treeReadAlwaysFails: false,
    worker: null,
    sendToTab: async () => undefined
  };

  runtime.senderForTab = (tab) => ({
    id: runtime.extensionId,
    url: tab.url,
    tab: { id: tab.id, url: tab.url },
    frameId: 0
  });

  runtime.dispatchWorkerMessage = (message, sender) => {
    if (!runtime.worker) return Promise.reject(new Error("worker_unavailable"));
    return dispatchListeners(runtime.worker.chrome.runtime.onMessage.listeners, message, sender);
  };

  runtime.sendToTab = async (tabId, message) => {
    const tab = runtime.tabs.get(tabId);
    if (!tab || tab.closed || !tab.content) throw new Error("tab_closed");
    return tab.content.dispatch(message, { id: runtime.extensionId, url: tab.url, tab: { id: tab.id, url: tab.url }, frameId: 0 });
  };

  runtime.sendFromTab = (tabId, message) => {
    const tab = runtime.tabs.get(tabId);
    if (!tab || tab.closed) return Promise.reject(new Error("tab_closed"));
    return runtime.dispatchWorkerMessage(message, runtime.senderForTab(tab));
  };

  runtime.sendFromPopup = (popup, message) => runtime.dispatchWorkerMessage(message, {
    id: runtime.extensionId,
    url: popup.url,
    tab: undefined,
    frameId: 0
  });

  runtime.createWorker = () => {
    runtime.worker = workerInstance(runtime);
    return runtime.worker;
  };
  runtime.recreateWorker = () => runtime.createWorker();
  runtime.createWorker();

  runtime.openTab = ({ id = `tab-${runtime.tabs.size + 1}`, url = "https://www.pornhub.com/videos", html = "", queryHidden = false } = {}) => {
    const tab = { id, url, html, queryHidden, closed: false, content: null, messages: [] };
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      url,
      runScripts: "outside-only",
      pretendToBeVisual: true
    });
    const listeners = [];
    runtime.tabs.set(id, tab);
    dom.window.BookmarkFilterUrl = urlUtils;
    dom.window.BookmarkFilterAdapters = adapters;
    dom.window.chrome = {
      runtime: {
        sendMessage: (message) => runtime.sendFromTab(id, message),
        onMessage: { addListener: (listener) => listeners.push(listener) }
      }
    };
    dom.window.Function("location", contentSource)(dom.window.location);
    tab.dom = dom;
    tab.content = {
      async dispatch(message, sender) {
        tab.messages.push(message);
        return dispatchListeners(listeners, message, sender);
      }
    };
    if (runtime.activeTabId == null) runtime.activeTabId = id;
    return tab;
  };

  runtime.addGhostTab = ({ id, url = "https://www.pornhub.com/videos" } = {}) => {
    runtime.tabs.set(id, { id, url, closed: false, content: null });
    return runtime.tabs.get(id);
  };

  runtime.closeTab = (id) => {
    const tab = runtime.tabs.get(id);
    if (tab) tab.closed = true;
  };

  runtime.emitBookmarkCreated = (id, node) => runtime.worker.bookmarks.onCreated.fire(id, node);
  runtime.emitBookmarkChanged = (id, changeInfo) => runtime.worker.bookmarks.onChanged.fire(id, changeInfo);
  runtime.emitBookmarkRemoved = (id, removeInfo) => runtime.worker.bookmarks.onRemoved.fire(id, removeInfo);
  runtime.emitBookmarkMoved = (id, moveInfo) => runtime.worker.bookmarks.onMoved.fire(id, moveInfo);
  runtime.emitFolderDeleted = (id, removeInfo = { isFolder: true, node: { children: [] } }) => runtime.emitBookmarkRemoved(id, removeInfo);

  runtime.blockNextTreeRead = () => {
    runtime.treeReadBlock = () => {};
    runtime.treeReadReleaseRequested = false;
    runtime.releaseTreeRead = null;
    return () => {
      runtime.treeReadReleaseRequested = true;
      runtime.releaseTreeRead?.();
    };
  };
  runtime.failNextTreeRead = (count = 1) => { runtime.treeReadFailures = count; };
  runtime.setTreeReadFailure = (value) => { runtime.treeReadAlwaysFails = Boolean(value); };

  runtime.openPopup = () => {
    const dom = new JSDOM(popupMarkup, {
      url: `chrome-extension://${runtime.extensionId}/popup/popup.html`,
      runScripts: "outside-only",
      pretendToBeVisual: true
    });
    const popup = { dom, url: dom.window.location.href };
    dom.window.chrome = {
      runtime: { sendMessage: (message) => runtime.sendFromPopup(popup, message) },
      tabs: {
        query: (_query, callback) => callback(runtime.activeTabId == null ? [] : [{ id: runtime.activeTabId }]),
        sendMessage: (tabId, message) => runtime.sendToTab(tabId, message)
      },
      storage: { onChanged: runtime.storageEvents },
      extension: { isAllowedIncognitoAccess: async () => true }
    };
    dom.window.Function(popupSource)();
    runtime.popups.add(popup);
    return popup;
  };

  runtime.popupMessage = (popup, message) => runtime.sendFromPopup(popup, message);
  runtime.dispose = () => {
    for (const tab of runtime.tabs.values()) tab.dom?.window.close();
    for (const popup of runtime.popups) {
      popup.dom.window.dispatchEvent(new popup.dom.window.Event("pagehide"));
      popup.dom.window.close();
    }
  };
  return runtime;
}

module.exports = { createConnectedExtension, waitFor };
