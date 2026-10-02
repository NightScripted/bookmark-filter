(function () {
  const pageLocation = location;
  const adapter = BookmarkFilterAdapters.forUrl(pageLocation.href);
  if (!adapter) return;

  const MAX_BATCH = 200;
  const SCAN_NODE_BUDGET = 200;
  const SCAN_TIME_BUDGET = 8;
  const BATCH_DELAY = 32;
  const RETRY_DELAYS = [250, 1000, 2500];
  let showHidden = false;
  let filterEnabled = true;
  let status = "indexing";
  let errorCode = null;
  let candidateQueue = new Set();
  let scheduled = false;
  let processing = false;
  let generation = 0;
  let retryCount = 0;
  let retryTimer = null;
  let emptyRequest = false;
  let scanRoots = [];
  const scanRootSet = new Set();
  const MAX_PENDING_SCAN_ROOTS = 256;
  let scanTask = null;
  let scanScheduled = false;
  let scanning = false;
  const knownCandidates = new Set();
  const matched = new Set();
  const creatorMatched = new Set();
  const badgeByCard = new WeakMap();
  const ownedBadgeNodes = new WeakSet();
  const ownedBadgeRemovals = new WeakSet();
  let states = new WeakMap();

  function connected(element) { return Boolean(element && element.isConnected); }
  function contextUrl() { return pageLocation.href; }
  function isElement(node) { return Boolean(node && node.nodeType === Node.ELEMENT_NODE); }
  function candidateMatches(element) { return adapter.matchesCandidate(element, contextUrl()); }

  function hiddenCount() {
    if (!filterEnabled || showHidden) return 0;
    let count = 0;
    matched.forEach((element) => {
      if (connected(element) && element.classList.contains("bookmark-filter-hidden")) count += 1;
    });
    return count;
  }

  function highlightedCount() {
    if (!filterEnabled) return 0;
    let count = 0;
    creatorMatched.forEach((element) => {
      if (connected(element) && element.classList.contains("bookmark-filter-creator-highlight") && !element.classList.contains("bookmark-filter-hidden")) count += 1;
    });
    return count;
  }

  function connectedCount(set) {
    let count = 0;
    set.forEach((element) => { if (connected(element)) count += 1; });
    return count;
  }

  function reveal(element) { if (element?.classList) element.classList.remove("bookmark-filter-hidden"); }
  function clearHighlight(element) {
    if (!element) return;
    element.classList?.remove("bookmark-filter-creator-highlight");
    const badge = badgeByCard.get(element);
    if (badge) {
      badgeByCard.delete(element);
      if (badge.parentNode) {
        ownedBadgeRemovals.add(badge);
        badge.remove();
      }
    }
  }
  function setHighlight(element, isCreatorMatched) {
    if (!element) return;
    const enabled = filterEnabled && isCreatorMatched;
    let badge = badgeByCard.get(element);
    if (badge && !badge.isConnected) { badgeByCard.delete(element); badge = null; }
    if (!enabled) {
      clearHighlight(element);
      return;
    }
    element.classList?.add("bookmark-filter-creator-highlight");
    const label = matched.has(element) ? "Saved · Bookmarked creator" : "Bookmarked creator";
    if (badge) { if (badge.textContent !== label) badge.textContent = label; }
    else {
      const node = element.ownerDocument.createElement("span");
      node.className = "bookmark-filter-creator-badge";
      node.setAttribute("data-bookmark-filter-owned", "creator-badge");
      node.textContent = label;
      ownedBadgeNodes.add(node);
      badgeByCard.set(element, node);
      element.append(node);
    }
  }
  function restoreAll() {
    matched.forEach(reveal);
    creatorMatched.forEach((element) => clearHighlight(element));
    knownCandidates.forEach((element) => { if (connected(element)) { reveal(element); clearHighlight(element); } });
  }
  function isBusy() {
    return Boolean(scanning || scanTask || scanRoots.length || processing || candidateQueue.size || scheduled);
  }
  function surfaceVerification() {
    return typeof adapter.surfaceVerification === "function" ? adapter.surfaceVerification(contextUrl()) : "experimental";
  }
  function statusResponse() {
    return {
      siteId: adapter.id,
      hiddenCount: hiddenCount(),
      showHidden,
      enabled: filterEnabled,
      status,
      recognizedCount: connectedCount(knownCandidates),
      matchedCount: connectedCount(matched),
      creatorMatchedCount: connectedCount(creatorMatched),
      highlightedCount: highlightedCount(),
      scanning: isBusy(),
      errorCode,
      surfaceVerification: surfaceVerification()
    };
  }

  function apply(element, isMatched, isCreatorMatched, requestGeneration, token, url, creatorFingerprint) {
    const state = states.get(element);
    if (!connected(element)) {
      resetCandidate(element);
      return;
    }
    if (!state) {
      resetCandidate(element);
      return;
    }
    if (state.generation !== requestGeneration || state.token !== token || state.url !== url || state.creatorFingerprint !== creatorFingerprint) {
      return;
    }
    applyCurrent(element, isMatched, isCreatorMatched);
  }

  function applyCurrent(element, isMatched, isCreatorMatched) {
    if (isMatched) {
      matched.add(element);
      if (filterEnabled && !showHidden) element.classList.add("bookmark-filter-hidden");
      else reveal(element);
    } else {
      matched.delete(element);
      reveal(element);
    }
    if (isCreatorMatched) creatorMatched.add(element); else creatorMatched.delete(element);
    setHighlight(element, isCreatorMatched);
  }

  function resetCandidate(element) {
    knownCandidates.delete(element);
    matched.delete(element);
    creatorMatched.delete(element);
    states.delete(element);
    reveal(element);
    clearHighlight(element);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(runScan, 0);
  }

  function enqueueScanRoot(root, forceEmpty = false) {
    if (!root || (root.nodeType !== Node.DOCUMENT_NODE && !isElement(root))) {
      if (forceEmpty) emptyRequest = true;
      return;
    }
    if (forceEmpty) emptyRequest = true;
    for (let current = root; current; current = current.parentNode) {
      if (scanRootSet.has(current)) { scheduleScan(); return; }
    }
    // Do not coalesce against the active traversal: it may already have
    // passed the insertion point, and a generation refresh must rescan it.
    // A storm of disjoint sibling insertions is collapsed once, rather than
    // comparing every new root with every queued root. The document traversal
    // remains bounded and candidateQueue deduplication prevents duplicate work.
    if (root === document || root === document.documentElement || root === document.body || scanRoots.length >= MAX_PENDING_SCAN_ROOTS) {
      scanRoots = [document];
      scanRootSet.clear();
      scanRootSet.add(document);
    } else {
      scanRoots.push(root);
      scanRootSet.add(root);
    }
    scanning = true;
    scheduleScan();
  }

  function enqueueCandidates(elements, forceEmpty = false) {
    for (const element of elements || []) if (isElement(element) && connected(element)) candidateQueue.add(element);
    if (forceEmpty) emptyRequest = true;
    if (!scheduled && candidateQueue.size) { scheduled = true; setTimeout(flush, BATCH_DELAY); }
    maybeFinishScan();
  }

  function nextFrame(stack) {
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const children = frame.node?.childNodes;
      if (frame.index >= (children?.length || 0)) { stack.pop(); continue; }
      const node = children[frame.index++];
      stack.push({ node, index: 0 });
      return node;
    }
    return null;
  }

  function runScan() {
    scanScheduled = false;
    if (scanTask && scanTask.generation !== generation) scanTask = null;
    if (!scanTask) {
      const root = scanRoots.shift();
      if (!root) { scanning = false; maybeFinishScan(); return; }
      scanRootSet.delete(root);
      scanTask = { generation, root, stack: [{ node: root, index: 0 }] };
      scanning = true;
    }
    const start = globalThis.performance?.now?.() ?? Date.now();
    let visited = 0;
    while (scanTask.stack.length && visited < SCAN_NODE_BUDGET) {
      if ((globalThis.performance?.now?.() ?? Date.now()) - start >= SCAN_TIME_BUDGET) break;
      const frame = scanTask.stack[scanTask.stack.length - 1];
      const node = frame.node;
      if (frame.index === 0) {
        visited += 1;
        if (isElement(node) && candidateMatches(node)) {
          const candidate = adapter.identifyCandidate(node, contextUrl());
          if (candidate) {
            knownCandidates.add(node);
            candidateQueue.add(node);
            if (!scheduled) { scheduled = true; setTimeout(flush, BATCH_DELAY); }
          }
        }
      }
      if (!nextFrame(scanTask.stack)) scanTask.stack.length = 0;
    }
    if (scanTask.stack.length) { scanning = true; scheduleScan(); }
    else {
      scanTask = null;
      if (scanRoots.length) scheduleScan();
      else { scanning = false; maybeFinishScan(); }
    }
  }

  function scan(root, forceRequest = false) { enqueueScanRoot(root, forceRequest); }
  function maybeFinishScan() {
    if (scanning || scanTask || scanRoots.length || processing) return;
    if (candidateQueue.size) {
      if (!scheduled) { scheduled = true; setTimeout(flush, BATCH_DELAY); }
      return;
    }
    if (emptyRequest && !scheduled) { scheduled = true; setTimeout(flush, BATCH_DELAY); }
  }

  function candidateEntry(element, requestGeneration, index) {
    if (!connected(element)) { resetCandidate(element); return null; }
    const candidate = adapter.identifyCandidate(element, contextUrl());
    if (!candidate || typeof candidate.url !== "string") { resetCandidate(element); return null; }
    knownCandidates.add(element);
    const token = `${requestGeneration.toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 120);
    const creatorUrls = Array.isArray(candidate.creatorUrls) ? candidate.creatorUrls.slice(0, 16) : [];
    const creatorFingerprint = creatorUrls.map((url) => adapter.normalizeCreatorUrl(url)).filter(Boolean).sort().join("|");
    const state = { generation: requestGeneration, token, url: candidate.url, creatorFingerprint };
    states.set(element, state);
    return { element, candidate, token, url: candidate.url, creatorUrls, creatorFingerprint };
  }

  function clearRetry() {
    if (retryTimer != null) clearTimeout(retryTimer);
    retryTimer = null;
    retryCount = 0;
  }
  function scheduleRetry() {
    if (retryTimer != null || retryCount >= RETRY_DELAYS.length) return;
    const delay = RETRY_DELAYS[retryCount++];
    retryTimer = setTimeout(() => {
      retryTimer = null;
      status = "indexing";
      errorCode = null;
      scan(document, true);
    }, delay);
  }

  async function requestBatch(entries, requestGeneration) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "GET_PAGE_MATCHES",
        siteId: adapter.id,
        candidates: entries.map((entry) => ({ token: entry.token, url: entry.url, creatorUrls: entry.creatorUrls }))
      });
    } catch (_) { response = { error: "unavailable" }; }
    if (requestGeneration !== generation) return false;
    if (!response || response.error || response.indexReady !== true) {
      status = "error";
      errorCode = response?.error === "unavailable" ? "runtime-unavailable" : "index-unavailable";
      restoreAll();
      scheduleRetry();
      return false;
    }
    clearRetry();
    status = "ready";
    errorCode = null;
    filterEnabled = response.enabled !== false;
    if (!filterEnabled) restoreAll();
    const matches = new Map((Array.isArray(response.matches) ? response.matches : []).map((match) => [match.token, {
      media: match.mediaBookmarked === true || (match.mediaBookmarked === undefined && match.matched === true),
      creator: match.creatorBookmarked === true
    }]));
    for (const entry of entries) {
      const current = states.get(entry.element);
      if (!connected(entry.element)) {
        resetCandidate(entry.element);
        continue;
      }
      // A newer request for this element owns its state; an old response must
      // not clear that newer in-flight state or its visual result.
      if (!current) { resetCandidate(entry.element); continue; }
      if (current.generation !== requestGeneration || current.token !== entry.token) continue;
      const currentCandidate = adapter.identifyCandidate(entry.element, contextUrl());
      const currentCreatorUrls = Array.isArray(currentCandidate?.creatorUrls) ? currentCandidate.creatorUrls.slice(0, 16) : [];
      const currentFingerprint = currentCreatorUrls.map((url) => adapter.normalizeCreatorUrl(url)).filter(Boolean).sort().join("|");
      if (!currentCandidate || currentCandidate.url !== entry.url || currentFingerprint !== entry.creatorFingerprint) { resetCandidate(entry.element); continue; }
      const match = matches.get(entry.token) || { media: false, creator: false };
      apply(entry.element, match.media, match.creator, requestGeneration, entry.token, entry.url, entry.creatorFingerprint);
    }
    return true;
  }

  async function process(elements, forceEmpty = false) {
    if (processing) {
      elements.forEach((element) => candidateQueue.add(element));
      if (forceEmpty) emptyRequest = true;
      return;
    }
    processing = true;
    const requestGeneration = generation;
    try {
      const candidates = elements.map((element, index) => candidateEntry(element, requestGeneration, index)).filter(Boolean);
      if (!candidates.length && forceEmpty) await requestBatch([], requestGeneration);
      for (let offset = 0; offset < candidates.length; offset += MAX_BATCH) {
        const succeeded = await requestBatch(candidates.slice(offset, offset + MAX_BATCH), requestGeneration);
        if (!succeeded || requestGeneration !== generation) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      processing = false;
      if (candidateQueue.size || emptyRequest) {
        if (!scheduled) { scheduled = true; setTimeout(flush, BATCH_DELAY); }
      } else maybeFinishScan();
    }
  }

  function flush() {
    scheduled = false;
    if (!candidateQueue.size && !emptyRequest) { maybeFinishScan(); return; }
    const items = [];
    for (const element of candidateQueue) {
      items.push(element);
      candidateQueue.delete(element);
      if (items.length >= MAX_BATCH) break;
    }
    if (items.length) emptyRequest = false;
    const forceEmpty = emptyRequest && items.length === 0 && candidateQueue.size === 0;
    if (forceEmpty) emptyRequest = false;
    process(items, forceEmpty);
  }

  function cancelDiscovery() {
    scanRoots = [];
    scanRootSet.clear();
    scanTask = null;
    scanning = false;
    candidateQueue.clear();
    emptyRequest = false;
  }
  function restartScan(forceRequest) { cancelDiscovery(); scan(document, forceRequest); }

  function resetForRoute() {
    generation += 1;
    clearRetry();
    showHidden = false;
    status = "indexing";
    errorCode = null;
    cancelDiscovery();
    restoreAll();
    knownCandidates.clear();
    matched.clear();
    creatorMatched.clear();
    states = new WeakMap();
    scan(document, true);
  }

  let routeKey = pageLocation.href;
  function checkRoute() {
    if (pageLocation.href !== routeKey) { routeKey = pageLocation.href; resetForRoute(); }
  }
  function setShowHidden(value) {
    showHidden = Boolean(value);
    if (showHidden) matched.forEach(reveal);
    else scan(document);
  }
  function setEnabled(value) {
    generation += 1;
    clearRetry();
    filterEnabled = Boolean(value);
    errorCode = null;
    status = filterEnabled ? "indexing" : "ready";
    if (!filterEnabled) { cancelDiscovery(); restoreAll(); }
    else restartScan(true);
  }
  function restartFilter() {
    generation += 1;
    clearRetry();
    status = "indexing";
    errorCode = null;
    restoreAll();
    restartScan(true);
  }
  function cleanDisconnected() {
    knownCandidates.forEach((element) => {
      if (!connected(element)) { knownCandidates.delete(element); matched.delete(element); creatorMatched.delete(element); reveal(element); clearHighlight(element); }
    });
    matched.forEach((element) => { if (!connected(element)) matched.delete(element); });
    creatorMatched.forEach((element) => { if (!connected(element)) creatorMatched.delete(element); });
  }
  function affectedCandidates(targets) {
    const affected = new Set();
    for (const target of targets) {
      let current = isElement(target) ? target : target?.parentElement;
      while (current) {
        if (knownCandidates.has(current) || candidateMatches(current)) affected.add(current);
        current = current.parentElement;
      }
    }
    return affected;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_STATUS") { checkRoute(); sendResponse(statusResponse()); return false; }
    if (message?.type === "SET_SHOW_HIDDEN") { setShowHidden(message.enabled); sendResponse(statusResponse()); return false; }
    if (message?.type === "SET_SITE_ENABLED" && message.siteId === adapter.id && typeof message.enabled === "boolean") {
      setEnabled(message.enabled); sendResponse(statusResponse()); return false;
    }
    if (message?.type === "RETRY_FILTER") { restartFilter(); sendResponse(statusResponse()); return false; }
    if (message?.type === "BOOKMARKS_CHANGED") {
      generation += 1;
      status = "indexing";
      errorCode = null;
      scan(document, true);
      return false;
    }
    if (message?.type === "SETTINGS_CHANGED" && message.enabledBySite && typeof message.enabledBySite[adapter.id] === "boolean") {
      setEnabled(message.enabledBySite[adapter.id]);
      return false;
    }
    return false;
  });

  const observer = new MutationObserver((records) => {
    const targets = new Set();
    const additions = [];
    let removed = false;
    let relevant = false;
    for (const record of records) {
      if (record.type === "childList") {
        const added = [...record.addedNodes];
        const removedNodes = [...record.removedNodes];
        const addedEmptyOrOwn = added.length === 0 || added.every((node) => ownedBadgeNodes.has(node));
        const removedEmptyOrOwn = removedNodes.length === 0 || removedNodes.every((node) => ownedBadgeRemovals.has(node));
        const actualOwnOperation = added.some((node) => ownedBadgeNodes.has(node)) || removedNodes.some((node) => ownedBadgeRemovals.has(node));
        const ownTextMutation = ownedBadgeNodes.has(record.target);
        if (ownTextMutation || (actualOwnOperation && addedEmptyOrOwn && removedEmptyOrOwn)) continue;
        relevant = true;
        if (record.removedNodes.length) removed = true;
        targets.add(record.target);
        record.addedNodes.forEach((node) => { if (isElement(node)) additions.push(node); });
      } else if (record.type === "attributes") {
        if (record.attributeName === "class") {
          const withoutExtensionClass = (value) => String(value || "").split(/\s+/).filter((name) => name && !["bookmark-filter-hidden", "bookmark-filter-creator-highlight"].includes(name)).sort().join(" ");
          if (withoutExtensionClass(record.oldValue) === withoutExtensionClass(record.target.getAttribute("class"))) continue;
        }
        relevant = true;
        targets.add(record.target);
      }
    }
    if (!relevant) return;
    const affected = affectedCandidates(targets);
    affected.forEach(resetCandidate);
    enqueueCandidates(affected);
    additions.forEach((node) => scan(node));
    if (removed) cleanDisconnected();
    checkRoute();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["href", "id", "class", "data-id", "data-video-id", "data-story-id", "data-chapter-id"] });

  addEventListener("popstate", checkRoute);
  addEventListener("hashchange", checkRoute);
  addEventListener("focus", checkRoute);
  addEventListener("pageshow", checkRoute);
  addEventListener("visibilitychange", checkRoute);
  if (globalThis.navigation?.addEventListener) navigation.addEventListener("currententrychange", checkRoute);
  scan(document, true);

  globalThis.BookmarkFilterContent = {
    hiddenCount,
    scan,
    setEnabled,
    setShowHidden,
    get scanning() { return isBusy(); },
    get status() { return status; }
  };
})();
