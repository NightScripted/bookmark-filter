(function () {
  const siteNames = { pornhub: "Pornhub", xvideos: "XVideos", xhamster: "xHamster", literotica: "Literotica" };
  const sites = document.querySelector("#sites");
  const page = document.querySelector("#page");
  const surfaceStatus = document.querySelector("#surface-status");
  const indexStatus = document.querySelector("#index-status");
  const count = document.querySelector("#count");
  const settingsStatus = document.querySelector("#settings-status");
  const actionStatus = document.querySelector("#action-status");
  const show = document.querySelector("#show");
  const retry = document.querySelector("#retry");
  const incognito = document.querySelector("#incognito");
  let tabId = null;
  let pageState = null;
  let disposed = false;
  let refreshTimer = null;
  let pollInFlight = false;
  let pageRefreshVersion = 0;
  let indexRefreshVersion = 0;
  let settingsRefreshVersion = 0;
  let retryVersion = 0;
  let retryBusy = false;
  let actionBusy = false;
  let settingsDirty = false;
  let pageHasError = false;
  let indexHasError = false;
  const settingControls = new Map();

  function send(type, payload = {}) {
    return Promise.resolve(chrome.runtime.sendMessage({ type, ...payload })).catch(() => ({ error: "unavailable" }));
  }

  async function sendTab(message) {
    if (tabId == null || !chrome.tabs?.sendMessage) return null;
    try { return await chrome.tabs.sendMessage(tabId, message); } catch (_) { return null; }
  }

  function safeCode(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : "";
  }

  function codeSuffix(value) {
    const code = safeCode(value);
    return code ? ` (code: ${code})` : "";
  }

  function numberOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }

  function availableForActions() {
    return Boolean(pageState && pageState.status === "ready" && pageState.enabled !== false && pageState.scanning !== true && !pageState.error);
  }

  function setRetryVisibility() {
    if (!retry) return;
    retry.hidden = !pageHasError && !indexHasError;
    retry.disabled = retryBusy || actionBusy;
    retry.setAttribute("aria-busy", String(retryBusy || actionBusy));
  }

  function syncSiteControlDisabled() {
    for (const control of settingControls.values()) control.input.disabled = actionBusy || control.pending;
  }

  function setActionBusy(value) {
    actionBusy = value;
    syncSiteControlDisabled();
    if (show) show.disabled = actionBusy || !availableForActions();
    setRetryVisibility();
  }

  async function finishAction() {
    const reconcileSettings = settingsDirty;
    settingsDirty = false;
    setActionBusy(false);
    if (reconcileSettings && !disposed) await refreshSettings({ preserveMessage: true });
  }

  function setSettingsMessage(message, error = false) {
    if (!settingsStatus) return;
    settingsStatus.textContent = message || "";
    settingsStatus.dataset.state = error ? "error" : "";
  }

  function setActionMessage(message) {
    if (actionStatus) actionStatus.textContent = message || "";
  }

  function surfaceMessage(value) {
    if (value === "live-layout-inspected") return "Live layout inspected; native extension behavior not yet verified.";
    if (value === "experimental") return "Experimental layout verification; filtering may be incomplete.";
    if (value === "unverified") return "Site layout is unverified; filtering may be incomplete.";
    return "";
  }

  function countMessage(state) {
    if (state.status === "error") return `Filtering unavailable; hidden count is unavailable${codeSuffix(state.errorCode)}.`;
    if (state.enabled === false) return "Filtering disabled; hidden cards are shown.";
    if (state.scanning === true || state.status === "indexing") return "Scanning this page; counts will update when scanning finishes.";

    const hidden = numberOrNull(state.hiddenCount);
    const hiddenText = hidden == null ? "—" : String(hidden);
    const recognized = numberOrNull(state.recognizedCount);
    const matched = numberOrNull(state.matchedCount);
    if (recognized === 0) return `No recognized cards (page may be empty or unsupported). Hidden on this page: ${hiddenText}.`;
    if (recognized != null && matched === 0) return `No bookmark matches. Hidden on this page: ${hiddenText}.`;
    if (matched != null) return `Bookmark matches: ${matched}. Hidden on this page: ${hiddenText}.`;
    return `Hidden on this page: ${hiddenText}.`;
  }

  function renderPage(state) {
    if (!state || typeof state !== "object") {
      pageState = null;
      pageHasError = false;
      if (page) {
        page.textContent = "Unsupported page or extension not ready.";
        page.dataset.state = "unsupported";
      }
      if (surfaceStatus) surfaceStatus.textContent = "";
      if (count) count.textContent = "Hidden on this page: —";
      if (show) {
        show.disabled = true;
        show.setAttribute("aria-pressed", "false");
        show.textContent = "Show hidden on this page";
      }
      setRetryVisibility();
      return;
    }

    pageState = { ...state };
    const name = siteNames[state.siteId] || "This site";
    const stateName = ["indexing", "ready", "error"].includes(state.status) ? state.status : "ready";
    const scanning = state.scanning === true || stateName === "indexing";
    pageState.status = stateName;
    pageState.scanning = scanning;
    pageHasError = stateName === "error" || Boolean(state.error);
    const recognized = numberOrNull(state.recognizedCount);
    const matched = numberOrNull(state.matchedCount);

    let message = `${name}: filtering ready.`;
    if (pageHasError) message = `${name}: filtering unavailable${codeSuffix(state.errorCode)}.`;
    else if (state.enabled === false) message = `${name}: filtering disabled.`;
    else if (scanning) message = `${name}: scanning this page…`;
    else if (recognized === 0) message = "No recognized cards (page may be empty or unsupported).";
    else if (recognized != null && matched === 0) message = "No bookmark matches.";

    if (page) {
      page.textContent = message;
      page.dataset.state = pageHasError ? "error" : state.enabled === false ? "disabled" : scanning ? "scanning" : stateName;
    }
    if (surfaceStatus) surfaceStatus.textContent = surfaceMessage(state.surfaceVerification);
    if (count) count.textContent = countMessage({ ...state, status: stateName, scanning });
    if (show) {
      show.disabled = actionBusy || !availableForActions();
      show.textContent = state.showHidden ? "Hide hidden on this page" : "Show hidden on this page";
      show.setAttribute("aria-pressed", String(Boolean(state.showHidden)));
    }
    setRetryVisibility();
  }

  async function refreshPage({ allowDuringAction = false } = {}) {
    if (disposed || (actionBusy && !allowDuringAction)) return;
    const version = ++pageRefreshVersion;
    const state = await sendTab({ type: "GET_PAGE_STATUS" });
    if (disposed || version !== pageRefreshVersion) return;
    renderPage(state);
  }

  function renderIndex(state) {
    if (!indexStatus) return;
    if (!state || state.error) {
      indexHasError = true;
      indexStatus.textContent = "Bookmark index unavailable.";
      setRetryVisibility();
      return;
    }
    const stateName = state.status === "error" ? "error" : state.status === "building" ? "building" : state.ready === true ? "ready" : "building";
    indexHasError = stateName === "error";
    if (stateName === "error") indexStatus.textContent = `Bookmark index unavailable${codeSuffix(state.errorCode)}.`;
    else if (stateName === "building") indexStatus.textContent = "Bookmark index is being prepared…";
    else {
      const total = numberOrNull(state.total);
      indexStatus.textContent = total == null ? "Bookmark index ready." : `Bookmark index ready (${total} saved items).`;
    }
    setRetryVisibility();
  }

  async function refreshIndex() {
    if (disposed) return;
    const version = ++indexRefreshVersion;
    const state = await send("GET_INDEX_STATUS");
    if (disposed || version !== indexRefreshVersion) return;
    renderIndex(state);
  }

  function createSiteToggle(siteId, name) {
    const label = document.createElement("label");
    label.className = "site-toggle";
    label.htmlFor = `site-${siteId}`;
    const text = document.createElement("span");
    text.textContent = name;
    const input = document.createElement("input");
    input.id = `site-${siteId}`;
    input.type = "checkbox";
    input.setAttribute("aria-label", `Enable filtering for ${name}`);
    const control = { input, committed: true, pending: false };
    input.addEventListener("change", async () => {
      if (disposed || control.pending || actionBusy) return;
      const previous = control.committed;
      const requested = input.checked;
      control.pending = true;
      setActionBusy(true);
      pageRefreshVersion += 1;
      settingsRefreshVersion += 1;
      input.disabled = true;
      try {
        const result = await send("SET_SITE_ENABLED", { siteId, enabled: requested });
        if (disposed) return;
        settingsRefreshVersion += 1;
        control.pending = false;
        if (result?.error) {
          input.checked = previous;
          control.committed = previous;
          setSettingsMessage(`Could not save ${name} filtering; setting restored.`, true);
        } else {
          const saved = result?.enabledBySite && typeof result.enabledBySite[siteId] === "boolean" ? result.enabledBySite[siteId] : requested;
          input.checked = saved;
          control.committed = saved;
          setSettingsMessage("");
          if (pageState?.siteId === siteId) await sendTab({ type: "SET_SITE_ENABLED", siteId, enabled: saved });
        }
      } finally {
        if (!disposed) {
          control.pending = false;
          await finishAction();
          await refreshPage();
        }
      }
    });
    label.append(text, input);
    settingControls.set(siteId, control);
    return label;
  }

  function ensureSiteToggles() {
    if (!sites) return;
    for (const [siteId, name] of Object.entries(siteNames)) {
      if (settingControls.has(siteId)) continue;
      sites.append(createSiteToggle(siteId, name));
    }
  }

  async function refreshSettings({ preserveMessage = false } = {}) {
    if (disposed || actionBusy) return;
    const version = ++settingsRefreshVersion;
    const settings = await send("GET_SETTINGS");
    if (disposed || version !== settingsRefreshVersion) return;
    if (settings?.error || !settings?.enabledBySite || typeof settings.enabledBySite !== "object") {
      setSettingsMessage("Filtering settings are unavailable.", true);
      return;
    }
    ensureSiteToggles();
    for (const [siteId, control] of settingControls) {
      if (control.pending) continue;
      const enabled = settings.enabledBySite[siteId] !== false;
      control.committed = enabled;
      control.input.checked = enabled;
    }
    if (!preserveMessage) setSettingsMessage("");
  }

  async function retryFilter() {
    if (disposed || retryBusy || actionBusy) return;
    setActionBusy(true);
    retryBusy = true;
    const version = ++retryVersion;
    setRetryVisibility();
    pageRefreshVersion += 1;
    indexRefreshVersion += 1;
    try {
      const indexResponse = await send("GET_INDEX_STATUS", { retry: true });
      if (disposed || version !== retryVersion) return;
      renderIndex(indexResponse);
      const pageResponse = await sendTab({ type: "RETRY_FILTER" });
      if (disposed || version !== retryVersion) return;
      if (pageResponse && typeof pageResponse === "object" && !pageResponse.error) renderPage(pageResponse);
    } finally {
      if (!disposed && version === retryVersion) {
        retryBusy = false;
        await finishAction();
        await Promise.all([refreshPage(), refreshIndex()]);
      }
    }
  }

  show?.addEventListener("click", async () => {
    if (actionBusy || !availableForActions()) return;
    const previousState = pageState;
    setActionBusy(true);
    pageRefreshVersion += 1;
    try {
      const response = await sendTab({ type: "SET_SHOW_HIDDEN", enabled: !pageState.showHidden });
      if (disposed) return;
      if (response && !response.error) {
        setActionMessage("");
        renderPage(response);
      } else {
        renderPage(previousState);
        setActionMessage("Could not update page visibility; the current setting was kept.");
      }
    } finally {
      if (!disposed) await finishAction();
    }
  });

  retry?.addEventListener("click", retryFilter);

  async function poll() {
    if (disposed || pollInFlight || actionBusy) return;
    pollInFlight = true;
    try { await Promise.all([refreshPage(), refreshIndex()]); }
    finally { pollInFlight = false; }
  }

  async function start() {
    const tabs = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (result) => resolve(result || []))).catch(() => []);
    if (disposed) return;
    tabId = tabs[0]?.id ?? null;
    ensureSiteToggles();
    await Promise.all([refreshSettings(), refreshPage(), refreshIndex()]);
    if (disposed) return;
    try {
      if (chrome.extension?.isAllowedIncognitoAccess && !(await chrome.extension.isAllowedIncognitoAccess()) && !disposed) {
        incognito.textContent = "Incognito access is disabled. Enable Allow in incognito in the extension details.";
      }
    } catch (_) { /* optional permission API */ }
    if (disposed) return;
    refreshTimer = setInterval(poll, 1000);
  }

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "local" && changes && !disposed) {
      settingsDirty = true;
      if (!actionBusy) {
        settingsDirty = false;
        refreshSettings();
      }
    }
  });
  addEventListener("pagehide", () => { disposed = true; if (refreshTimer != null) clearInterval(refreshTimer); });
  start().catch(() => { if (!disposed) renderPage(null); });
})();
