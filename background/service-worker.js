importScripts("../shared/url-utils.js", "../shared/protocol.js", "../content/adapters.js");

(function () {
  const adapters = BookmarkFilterAdapters;
  const protocol = BookmarkFilterProtocol;
  const DEFAULT_ENABLED = Object.fromEntries(adapters.all.map((adapter) => [adapter.id, true]));
  const MAX_EXTENSION_PAGE_LENGTH = 2048;

  let index = null;
  let rebuildPromise = null;
  let dirtyGeneration = 0;
  let revision = 0;
  let importing = false;
  let rebuildScheduled = false;
  let lastRebuildFailure = null;

  function runtimeId() {
    return typeof chrome.runtime?.id === "string" ? chrome.runtime.id : "";
  }

  function extensionUrl(url) {
    if (typeof url !== "string" || url.length === 0 || url.length > MAX_EXTENSION_PAGE_LENGTH) return false;
    const id = runtimeId();
    return url.startsWith("chrome-extension://") && (!id || url.startsWith(`chrome-extension://${id}/`));
  }

  function supportedSite(siteId) {
    return typeof siteId === "string" && Object.prototype.hasOwnProperty.call(adapters.byId, siteId);
  }

  function contentSender(sender, siteId) {
    if (!sender || (runtimeId() && sender.id !== runtimeId())) return false;
    if (sender.frameId !== 0) return false;
    const senderUrl = sender.url || sender.tab?.url;
    const senderAdapter = adapters.forUrl(senderUrl);
    return Boolean(senderAdapter && senderAdapter.id === siteId);
  }

  function popupSender(sender) {
    if (!sender || (runtimeId() && sender.id !== runtimeId())) return false;
    return extensionUrl(sender.url);
  }

  function mergedSettings(stored) {
    const legacy = stored && stored.enabledBySite;
    const enabledBySite = { ...DEFAULT_ENABLED };
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      for (const siteId of Object.keys(DEFAULT_ENABLED)) if (typeof legacy[siteId] === "boolean") enabledBySite[siteId] = legacy[siteId];
    }
    for (const siteId of Object.keys(DEFAULT_ENABLED)) {
      if (typeof stored?.[`enabledBySite:${siteId}`] === "boolean") enabledBySite[siteId] = stored[`enabledBySite:${siteId}`];
    }
    return { enabledBySite };
  }

  async function getSettings() {
    const defaults = { enabledBySite: DEFAULT_ENABLED };
    for (const siteId of Object.keys(DEFAULT_ENABLED)) defaults[`enabledBySite:${siteId}`] = null;
    const stored = await chrome.storage.local.get(defaults);
    return mergedSettings(stored);
  }

  async function saveSiteSetting(siteId, enabled) {
    await chrome.storage.local.set({ [`enabledBySite:${siteId}`]: enabled });
    return getSettings();
  }

  function emptyIndex() {
    return {
      bySite: Object.fromEntries(adapters.all.map((adapter) => [adapter.id, new Set()])),
      creatorsBySite: Object.fromEntries(adapters.all.map((adapter) => [adapter.id, new Map()])),
      total: 0, creatorTotal: 0, revision: 0
    };
  }

  function buildIndex(tree) {
    const next = emptyIndex();
    const walk = (nodes) => {
      for (const node of Array.isArray(nodes) ? nodes : []) {
        if (typeof node.url === "string") {
          const adapter = adapters.forUrl(node.url);
          const key = adapters.normalizeBookmarkUrl(node.url);
          if (adapter && key) next.bySite[adapter.id].add(key);
          const creatorKey = adapters.normalizeCreatorUrl(node.url);
          if (adapter && creatorKey) {
            const creators = next.creatorsBySite[adapter.id];
            const existing = creators.get(creatorKey) || { ids: new Set(), dateAdded: null };
            if (node.id != null) existing.ids.add(String(node.id));
            const dateAdded = node.dateAdded;
            if (typeof dateAdded === "number" && Number.isFinite(dateAdded) && dateAdded >= 0 && (existing.dateAdded == null || dateAdded < existing.dateAdded)) existing.dateAdded = dateAdded;
            creators.set(creatorKey, existing);
          }
        }
        if (Array.isArray(node.children)) walk(node.children);
      }
    };
    walk(tree);
    next.total = Object.values(next.bySite).reduce((total, values) => total + values.size, 0);
    next.creatorTotal = Object.values(next.creatorsBySite).reduce((total, values) => total + values.size, 0);
    return next;
  }

  async function rebuildIndex() {
    if (rebuildPromise) return rebuildPromise;
    lastRebuildFailure = null;
    rebuildPromise = (async () => {
      while (true) {
        const generation = dirtyGeneration;
        const tree = await chrome.bookmarks.getTree();
        const next = buildIndex(tree);
        if (generation !== dirtyGeneration) continue;
        next.revision = ++revision;
        index = next;
        lastRebuildFailure = null;
        return index;
      }
    })().catch((error) => {
      index = null;
      lastRebuildFailure = { errorCode: "index_unavailable" };
      throw error;
    }).finally(() => { rebuildPromise = null; });
    return rebuildPromise;
  }

  async function notifyContentTabs(message) {
    if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return;
    let tabs = [];
    try { tabs = await chrome.tabs.query({}); } catch (_) { return; }
    await Promise.all(tabs.filter((tab) => tab?.id != null && adapters.forUrl(tab.url)).map(async (tab) => {
      try { await chrome.tabs.sendMessage(tab.id, message); } catch (_) { /* tab closed or unsupported frame */ }
    }));
  }

  function scheduleRebuild() {
    if (rebuildScheduled || rebuildPromise) return;
    rebuildScheduled = true;
    Promise.resolve().then(() => {
      rebuildScheduled = false;
      return rebuildIndex().catch(() => undefined);
    });
  }

  function invalidateIndex({ notify = true } = {}) {
    dirtyGeneration += 1;
    index = null;
    if (notify) notifyContentTabs({ type: "BOOKMARKS_CHANGED" });
    if (!importing) scheduleRebuild();
  }

  function registerBookmarkEvents() {
    chrome.bookmarks.onCreated.addListener(() => invalidateIndex({ notify: !importing }));
    chrome.bookmarks.onChanged.addListener(() => invalidateIndex({ notify: true }));
    chrome.bookmarks.onRemoved.addListener(() => invalidateIndex({ notify: true }));
    chrome.bookmarks.onMoved.addListener(() => invalidateIndex({ notify: true }));
    chrome.bookmarks.onImportBegan?.addListener(() => { importing = true; invalidateIndex({ notify: false }); });
    chrome.bookmarks.onImportEnded?.addListener(() => { importing = false; invalidateIndex(); });
  }

  async function pageMatches(message, sender) {
    const validation = protocol.validateMatchesRequest(message);
    if (validation) return validation;
    if (!supportedSite(message.siteId)) return protocol.error("invalid_site");
    if (!contentSender(sender, message.siteId)) return protocol.error("forbidden_sender");
    const currentSettings = await getSettings();
    const currentIndex = index || await rebuildIndex();
    const keys = currentIndex.bySite[message.siteId] || new Set();
    const creatorKeys = currentIndex.creatorsBySite[message.siteId] || new Map();
    const matches = message.candidates.map((candidate) => {
      const candidateAdapter = adapters.forUrl(candidate.url);
      const normalized = candidateAdapter?.id === message.siteId ? candidateAdapter.normalizeBookmarkUrl(candidate.url) : null;
      let creatorBookmarked = false;
      const creatorUrls = Array.isArray(candidate.creatorUrls) ? candidate.creatorUrls : [];
      if (normalized) {
        for (const creatorUrl of creatorUrls) {
          const creatorAdapter = adapters.forUrl(creatorUrl);
          if (!creatorAdapter || creatorAdapter.id !== message.siteId) continue;
          const creatorKey = creatorAdapter.normalizeCreatorUrl(creatorUrl);
          if (creatorKey && creatorKeys.has(creatorKey)) { creatorBookmarked = true; break; }
        }
      }
      const mediaBookmarked = Boolean(normalized && keys.has(normalized));
      return { token: candidate.token, matched: mediaBookmarked, mediaBookmarked, creatorBookmarked };
    });
    return { enabled: currentSettings.enabledBySite[message.siteId] !== false, indexReady: true, matches, revision: currentIndex.revision };
  }

  function storageChanged(changes, areaName) {
    if (areaName !== "local") return;
    const changedSetting = Boolean(changes?.enabledBySite) || Object.keys(DEFAULT_ENABLED).some((siteId) => Boolean(changes?.[`enabledBySite:${siteId}`]));
    if (!changedSetting) return;
    getSettings().then((settings) => notifyContentTabs({ type: "SETTINGS_CHANGED", enabledBySite: settings.enabledBySite })).catch(() => undefined);
  }

  function runtimePageSender(sender) {
    return sender && (!runtimeId() || sender.id === runtimeId()) && extensionUrl(sender.url);
  }

  function indexStatus(retry = false) {
    if (index) return { ready: true, total: index.total, creatorTotal: index.creatorTotal, revision: index.revision, status: "ready", errorCode: null };
    if (retry) lastRebuildFailure = null;
    if (lastRebuildFailure) return { ready: false, total: 0, revision: 0, status: "error", errorCode: lastRebuildFailure.errorCode };
    if (!rebuildPromise) rebuildIndex().catch(() => undefined);
    return { ready: false, total: 0, revision: 0, status: "building", errorCode: null };
  }

  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      chrome.storage.local.get({ enabledBySite: null }).then((stored) => {
        if (!stored.enabledBySite) return chrome.storage.local.set({ enabledBySite: DEFAULT_ENABLED });
        return undefined;
      }).catch(() => undefined);
    }
    scheduleRebuild();
  });
  chrome.runtime.onStartup.addListener(() => scheduleRebuild());
  chrome.storage.onChanged?.addListener(storageChanged);
  registerBookmarkEvents();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.type === protocol.REQUEST) return pageMatches(message, sender);
      if (message?.type === "GET_SETTINGS") {
        if (!runtimePageSender(sender)) return protocol.error("forbidden_sender");
        return getSettings();
      }
      if (message?.type === "SET_SITE_ENABLED") {
        if (!runtimePageSender(sender) || !supportedSite(message.siteId) || typeof message.enabled !== "boolean") return protocol.error("forbidden_sender");
        return saveSiteSetting(message.siteId, message.enabled);
      }
      if (message?.type === "GET_INDEX_STATUS") {
        if (!runtimePageSender(sender)) return protocol.error("forbidden_sender");
        return indexStatus(message.retry === true);
      }
      return protocol.error("unknown_message");
    })().then(sendResponse).catch(() => sendResponse(protocol.error("internal_error")));
    return true;
  });

  globalThis.BookmarkFilterBackground = { buildIndex, getSettings, invalidateIndex, rebuildIndex, pageMatches, mergedSettings, saveSiteSetting };
})();
