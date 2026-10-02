(function (root) {
  const U = root.BookmarkFilterUrl || {
    safeUrl(value) {
      try {
        const url = new URL(String(value));
        return /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.port ? url : null;
      } catch (_) { return null; }
    },
    normalizedUrl(value) { return value; },
    TRACKING_PARAMS: new Set()
  };

  function asUrl(value) { return U.safeUrl(value); }
  function hostOf(value) { return asUrl(value)?.hostname.toLowerCase() || ""; }
  function matchesDomain(value, domains) {
    const hostname = hostOf(value);
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  }
  function token(siteId, key, url) { return { siteId, key, url }; }

  function queryRemainder(url, identityParams) {
    const ignored = new Set([...(identityParams || []), ...U.TRACKING_PARAMS]);
    const params = [];
    for (const [key, value] of url.searchParams) if (!ignored.has(key)) params.push([key, value]);
    return new URLSearchParams(params).toString();
  }

  function identityKey(siteId, prefix, value, url, identityParams) {
    const remainder = queryRemainder(url, identityParams);
    return `${siteId}:${prefix}:${value}${remainder ? `?${remainder}` : ""}`;
  }

  const MAX_CLASSIFICATION_NODES = 2048;
  const MAX_CLASSIFICATION_LINKS = 256;
  const MAX_CREATOR_URLS = 16;

  function hrefsIn(container, baseUrl) {
    const anchors = [];
    if (!container) return { anchors, bounded: true };
    const stack = [{ node: container, index: -1 }];
    let visited = 0;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index === -1) {
        frame.index = 0;
        const element = frame.node;
        if (!element || ++visited > MAX_CLASSIFICATION_NODES) return { anchors, bounded: false };
        if (element.nodeType === 1 && element.matches?.("a[href]")) {
          anchors.push(element);
          if (anchors.length > MAX_CLASSIFICATION_LINKS) return { anchors, bounded: false };
        }
      }
      const children = frame.node.childNodes;
      if (frame.index >= (children?.length || 0)) {
        stack.pop();
        continue;
      }
      stack.push({ node: children[frame.index++], index: -1 });
    }
    return { anchors, bounded: true };
  }

  function contentLinks(container, identityFromUrl, baseUrl) {
    const links = hrefsIn(container, baseUrl);
    if (!links.bounded) return null;
    // Prefer the browser-resolved property so relative fixture/live links
    // are evaluated against the page origin.
    const keys = new Map();
    for (const anchor of links.anchors) {
      const raw = baseUrl ? (anchor.getAttribute?.("href") || anchor.href) : (anchor.href || anchor.getAttribute?.("href"));
      let resolved = raw;
      try { if (baseUrl) resolved = new URL(raw, baseUrl).href; } catch (_) { resolved = raw; }
      const url = asUrl(resolved);
      if (!url) continue;
      const identity = identityFromUrl(url);
      if (identity && !keys.has(identity.key)) keys.set(identity.key, { url, href: url.href, identity });
    }
    if (keys.size !== 1) return null;
    const first = keys.values().next().value;
    return { url: first.href, key: first.identity.key };
  }

  function creatorLinks(container, identityFromUrl, baseUrl) {
    const links = hrefsIn(container, baseUrl);
    if (!links.bounded) return [];
    const found = [];
    const keys = new Set();
    for (const anchor of links.anchors) {
      const raw = baseUrl ? (anchor.getAttribute?.("href") || anchor.href) : (anchor.href || anchor.getAttribute?.("href"));
      let resolved = raw;
      try { if (baseUrl) resolved = new URL(raw, baseUrl).href; } catch (_) { resolved = raw; }
      const url = asUrl(resolved);
      const identity = url && identityFromUrl(url, anchor);
      if (!identity || keys.has(identity.key)) continue;
      keys.add(identity.key);
      found.push(url.href);
      if (found.length >= MAX_CREATOR_URLS) break;
    }
    return found;
  }

  function selectorMatches(element, selectors) {
    return Boolean(element?.matches && selectors.some((selector) => element.matches(selector)));
  }

  function protectedWrapper(element) {
    if (!element?.tagName) return true;
    const tag = element.tagName.toLowerCase();
    if (tag === "body" || tag === "main" || tag === "html") return true;
    const marker = `${element.id || ""} ${element.className || ""}`.toLowerCase();
    if (/(?:^|\s)(?:player|series)(?:[-_][a-z0-9]+)?(?:$|\s)|(?:^|\s)story(?:[-_](?:page|container|wrapper))?(?:$|\s)/.test(marker)) return true;
    for (let current = element; current; current = current.parentElement) {
      const currentTag = current.tagName?.toLowerCase();
      if (currentTag === "header" || currentTag === "nav") return true;
      if (current.getAttribute?.("role")?.toLowerCase() === "navigation") return true;
    }
    return false;
  }

  function walkElements(rootNode, visit) {
    if (!rootNode) return;
    const stack = [rootNode];
    while (stack.length) {
      const node = stack.pop();
      if (node?.nodeType === 1) visit(node);
      const children = node?.childNodes;
      for (let index = (children?.length || 0) - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
  }

  function hasNestedEligibleContainer(container, matchesCandidate, identityFromUrl, baseUrl) {
    const stack = [];
    const children = container?.childNodes;
    if ((children?.length || 0) > MAX_CLASSIFICATION_NODES) return true;
    for (let index = (children?.length || 0) - 1; index >= 0; index -= 1) stack.push({ node: children[index], index: -1 });
    let visited = 0;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index === -1) {
        frame.index = 0;
        const node = frame.node;
        if (!node || ++visited > MAX_CLASSIFICATION_NODES) return false;
        if (node.nodeType === 1 && matchesCandidate(node) && !protectedWrapper(node) && contentLinks(node, identityFromUrl, baseUrl)) return true;
      }
      const descendants = frame.node.childNodes;
      if (frame.index >= (descendants?.length || 0)) {
        stack.pop();
        continue;
      }
      stack.push({ node: descendants[frame.index++], index: -1 });
    }
    return false;
  }

  function routeAdapter(config) {
    const { id, domains, selectors, contentIdentity, creatorIdentity, isDetail, candidateMatches } = config;
    const matches = candidateMatches || ((element) => selectorMatches(element, selectors));
    return {
      id,
      domains,
      // The first three selector sets are legacy experimental selectors. They
      // remain narrow and require a verified-looking, single URL identity.
      verification: config.verification,
      surfaceVerification: config.surfaceVerification,
      isSupportedPage(value) { return matchesDomain(value, domains); },
      isListingPage(value) {
        const url = asUrl(value);
        return Boolean(url && this.isSupportedPage(url) && !isDetail(url));
      },
      matchesCandidate(element, contextUrl) {
        return Boolean(element?.nodeType === 1 && matches(element, contextUrl) && !protectedWrapper(element));
      },
      findCandidateContainers(rootNode, contextUrl) {
        const found = [];
        const valid = new Set();
        walkElements(rootNode, (element) => {
          if (!this.matchesCandidate(element, contextUrl)) return;
          if (this.identifyCandidate(element, contextUrl)) {
            found.push(element);
            valid.add(element);
          }
        });
        // Reject a valid wrapper when a valid selected card is nested inside it.
        // Walking ancestors is linear in tree depth and avoids pairwise contains().
        const hasValidAncestor = new Set();
        for (const element of found) {
          for (let current = element.parentElement; current; current = current.parentElement) {
            if (valid.has(current)) hasValidAncestor.add(current);
          }
        }
        return found.filter((element) => !hasValidAncestor.has(element));
      },
      identifyCandidate(container, contextUrl) {
        if (!this.matchesCandidate(container, contextUrl)) return null;
        if (hasNestedEligibleContainer(container, (element) => matches(element, contextUrl), contentIdentity, contextUrl)) return null;
        const match = contentLinks(container, contentIdentity, contextUrl);
        if (!match) return null;
        const creatorUrls = creatorIdentity ? creatorLinks(container, creatorIdentity, contextUrl) : [];
        return { ...token(id, match.key, match.url), creatorUrls };
      },
      normalizeBookmarkUrl(value) {
        const url = asUrl(value);
        if (!url || !this.isSupportedPage(url)) return null;
        return contentIdentity(url)?.key || null;
      },
      normalizeCreatorUrl(value) {
        const url = asUrl(value);
        if (!url || !this.isSupportedPage(url) || !creatorIdentity) return null;
        return creatorIdentity(url)?.key || null;
      }
    };
  }

  function normalizedContentUrl(siteId, url) {
    const canonical = new URL(url.href);
    // The verified main Literotica hosts are interchangeable; do not apply
    // this aliasing to arbitrary subdomains.
    if (siteId === "literotica" && (canonical.hostname === "literotica.com" || canonical.hostname.endsWith(".literotica.com"))) {
      canonical.hostname = "www.literotica.com";
    }
    const value = U.normalizedUrl(canonical, { stripFragment: true });
    return value ? `${siteId}:url:${value}` : null;
  }

  function pornhubIdentity(url) {
    if (!matchesDomain(url, ["pornhub.com"])) return null;
    const viewkeys = url.searchParams.getAll("viewkey");
    // viewkey is a query identity. Never search the pathname for this token.
    if (/^\/view_video\.php$/i.test(url.pathname)) {
      if (viewkeys.length !== 1 || !/^[a-z0-9]+$/i.test(viewkeys[0])) return null;
      return { key: identityKey("pornhub", "id", viewkeys[0], url, ["viewkey"]) };
    }
    const match = url.pathname.match(/^\/video\/[^/]+-([a-z0-9]+)\/?$/i);
    return match ? { key: identityKey("pornhub", "id", match[1], url) } : null;
  }

  function xvideosVideoId(url) {
    if (!matchesDomain(url, ["xvideos.com"])) return null;
    // /video123/slug, /video.ID/slug, and /video-ID/slug. Saved 2026-09-30
    // homepage suggestions add opaque segments (/video.ID/56182174/0/slug)
    // and creator pages template /video.ID/THUMBNUM/slug; all share the ID.
    const match = url.pathname.match(/^\/video(\d+|\.([a-z0-9]+)|-([a-z0-9]+))(?:\/[^/]*){0,3}\/?$/i);
    return match ? match[1].replace(/^[-.]/, "") : null;
  }

  function xvideosIdentity(url) {
    let id = xvideosVideoId(url);
    // Creator-page cards link through a click-tracking redirect that carries
    // the same video ID: /prof-video-click/upload/<handle>/<ID>/<slug>.
    if (!id && matchesDomain(url, ["xvideos.com"])) {
      id = url.pathname.match(/^\/prof-video-click\/upload\/[A-Za-z0-9_-]+\/([a-z0-9]+)(?:\/[^/]*){0,2}\/?$/i)?.[1] || null;
    }
    return id ? { key: identityKey("xvideos", "id", id, url) } : null;
  }

  function xhamsterIdentity(url) {
    if (!matchesDomain(url, ["xhamster.com"])) return null;
    const match = url.pathname.match(/^\/videos\/[^/]+-([a-z0-9]+)(?:\.html)?\/?$/i);
    return match ? { key: identityKey("xhamster", "id", match[1], url) } : null;
  }

  function literoticaIdentity(url) {
    if (!matchesDomain(url, ["literotica.com"])) return null;
    // /stories/contest.php/<slug>, tags, promos, and search links are not
    // individual works. Preserve the complete /s/ path and meaningful query.
    if (!/^\/s\/[^/]+(?:\/[^/]*)?\/?$/i.test(url.pathname)) return null;
    return { key: normalizedContentUrl("literotica", url) };
  }

  function routeCreatorIdentity(siteId, routes, value) {
    if (!matchesDomain(value, siteId === "pornhub" ? ["pornhub.com"] : siteId === "xvideos" ? ["xvideos.com"] : ["xhamster.com"])) return null;
    const pathname = value.pathname.replace(/\/+$/, "") || "/";
    for (const [family, pattern] of routes) {
      const match = pathname.match(pattern);
      if (match) return { key: `${siteId}:creator:${family}:${match[1]}` };
    }
    return null;
  }

  function pornhubCreatorIdentity(url) {
    return routeCreatorIdentity("pornhub", [
      ["users", /^\/(?:users)\/([A-Za-z0-9_-]+)$/],
      ["channels", /^\/(?:channels)\/([A-Za-z0-9_-]+)$/],
      ["model", /^\/(?:model)\/([A-Za-z0-9_-]+)(?:\/(?:videos|clips|photos|gifs|stream|playlists|about))?$/],
      ["pornstar", /^\/(?:pornstar)\/([A-Za-z0-9_-]+)$/]
    ], url);
  }

  // Root-level paths seen outside uploader links in the 2026-09-30 captures,
  // plus a few known listing routes. These are never creator handles.
  const XVIDEOS_RESERVED_ROOTS = new Set([
    "account", "best", "change-country", "channels", "channels-index", "favorites", "gay", "history", "hits",
    "lang", "my-feed", "new", "porn", "pornstars", "pornstars-index", "profiles", "profileslist", "red",
    "search", "shemale", "tags", "trans", "verified", "videos-i-like"
  ]);

  function xvideosCreatorIdentity(url, anchor) {
    const routed = routeCreatorIdentity("xvideos", [
      ["profiles", /^\/(?:profiles)\/([A-Za-z0-9_-]+)$/],
      ["amateur-channels", /^\/(?:amateur-channels)\/([A-Za-z0-9_-]+)$/],
      ["channels", /^\/(?:channels)\/([A-Za-z0-9_-]+)$/]
    ], url);
    if (routed || !matchesDomain(url, ["xvideos.com"])) return routed;
    const match = (url.pathname.replace(/\/+$/, "") || "/").match(/^\/([A-Za-z0-9_-]+)$/);
    if (!match || XVIDEOS_RESERVED_ROOTS.has(match[1].toLowerCase())) return null;
    // Root-level channel handles (/kate_koss1) share a namespace with site
    // routes, so inside a card only the uploader line counts.
    if (anchor && !anchor.closest?.("p.metadata")) return null;
    return { key: `xvideos:creator:handle:${match[1]}` };
  }

  function xhamsterCreatorIdentity(url) {
    return routeCreatorIdentity("xhamster", [
      ["users", /^\/(?:users)\/([A-Za-z0-9_-]+)$/],
      ["creators", /^\/(?:creators)\/([A-Za-z0-9_-]+)$/]
    ], url);
  }

  function literoticaCreatorIdentity(url) {
    if (!matchesDomain(url, ["literotica.com"])) return null;
    const match = url.pathname.match(/^\/authors\/([A-Za-z0-9_-]+)(?:\/works(?:\/stories)?)?\/?$/i);
    return match ? { key: `literotica:creator:authors:${match[1]}` } : null;
  }

  function literoticaHost(element, contextUrl) {
    return hostOf(contextUrl) || element?.ownerDocument?.location?.hostname?.toLowerCase() || "";
  }

  function literoticaSurface(element, contextUrl) {
    const host = literoticaHost(element, contextUrl);
    if (host === "search.literotica.com") return "search";
    if (host === "tags.literotica.com") return "tags";
    if (host === "literotica.com" || host === "www.literotica.com") return "main";
    return "other";
  }

  function literoticaWorkCard(element) {
    return element.matches("article._card_1epno_16") && Boolean(element.querySelector?.("div._content_1epno_58 > h3._title_1epno_54 > a._title_link_1epno_69"));
  }

  function literoticaCandidateMatches(element, contextUrl) {
    const surface = literoticaSurface(element, contextUrl);
    if (surface === "search") return element.matches("div.panel.ai_gJ") && Boolean(element.querySelector?.("div.ai_iG > a.ai_ii"));
    if (surface === "tags") return (element.matches("article._card_ohlxb_16") && Boolean(element.querySelector?.("div._content_ohlxb_56 > h3._title_ohlxb_52 > a"))) || (element.matches("article._card_1epno_16") && Boolean(element.querySelector?.("div._content_1epno_58 > h3._title_1epno_54 > a._title_link_1epno_69")));
    if (surface === "main") {
      const path = asUrl(contextUrl)?.pathname || element.ownerDocument.location.pathname;
      if (path === "/top/stories" || path === "/top/stories/") return element.matches("article._card_ohlxb_16, article._card_1epno_16._most_read_1epno_670");
      // Category listings and author story lists reuse the tag-page work card.
      // Category sidebars (div._item_1rmtm_97) and the homepage news submenu
      // are not eligible.
      if (/^\/c\/[^/]+\/?$/.test(path)) return literoticaWorkCard(element) && Boolean(element.parentElement?.matches("div._list_1epno_6"));
      if (/^\/authors\/[^/]+\/works\/stories\/?$/.test(path)) return literoticaWorkCard(element) && Boolean(element.parentElement?.matches("div._part_row_1epno_512, div._list_1epno_6"));
      if (/^\/s\/[^/]+(?:\/[^/]*)?\/?$/i.test(path)) {
        return element.matches("div._item_1m9b4_7") && element.parentElement?.matches("div._widget_list_1m9b4_1") && Boolean(element.querySelector?.(":scope > a._widget_link_1m9b4_62"));
      }
    }
    return false;
  }

  const adapters = [
    routeAdapter({
      id: "pornhub", domains: ["pornhub.com"],
      selectors: [".pcVideoListItem", ".videoPreview"],
      contentIdentity: pornhubIdentity,
      creatorIdentity: pornhubCreatorIdentity,
      isDetail: (url) => Boolean(pornhubIdentity(url)),
      verification: "saved-html-inspected 2026-09-12; live/native extension behavior unverified",
      surfaceVerification(value) {
        const url = asUrl(value);
        const host = url?.hostname?.toLowerCase();
        if (host !== "pornhub.com" && host !== "www.pornhub.com") return "experimental";
        if (url.pathname === "/" || /^\/video\/search\/?$/.test(url.pathname) || /^\/model\/[A-Za-z0-9_-]+$/.test(url.pathname.replace(/\/$/, ""))) return "saved-html-inspected";
        return "experimental";
      }
    }),
    routeAdapter({
      id: "xvideos", domains: ["xvideos.com"],
      selectors: [".thumb-block", ".video-card"],
      contentIdentity: xvideosIdentity,
      creatorIdentity: xvideosCreatorIdentity,
      isDetail: (url) => Boolean(xvideosVideoId(url)),
      verification: "saved-html-inspected 2026-09-30 homepage/search/creator; other surfaces experimental; live/native extension behavior unverified",
      surfaceVerification(value) {
        const url = asUrl(value);
        const host = url?.hostname?.toLowerCase();
        if (host !== "xvideos.com" && host !== "www.xvideos.com") return "experimental";
        if (url.pathname === "/" || xvideosCreatorIdentity(url)?.key.startsWith("xvideos:creator:handle:")) return "saved-html-inspected";
        return "experimental";
      }
    }),
    routeAdapter({
      id: "xhamster", domains: ["xhamster.com"],
      selectors: [".video-card", ".video-thumb"],
      contentIdentity: xhamsterIdentity,
      creatorIdentity: xhamsterCreatorIdentity,
      isDetail: (url) => Boolean(xhamsterIdentity(url)),
      verification: "experimental-legacy-selector; live layout unverified"
    }),
    routeAdapter({
      id: "literotica", domains: ["literotica.com"],
      // Search, tag, top-story, and detail recommendation selectors were
      // verified against the current live surfaces. The old li submenu and
      // homepage navigation selectors are intentionally not eligible.
      selectors: ["div.panel.ai_gJ", "article._card_ohlxb_16", "article._card_1epno_16", "div._item_1m9b4_7"],
      candidateMatches: literoticaCandidateMatches,
      contentIdentity: literoticaIdentity,
      creatorIdentity: literoticaCreatorIdentity,
      isDetail: (url) => Boolean(literoticaIdentity(url)),
      verification: "live-layout-inspected 2026-09-12 search/tag/top selectors; saved-html-inspected 2026-09-30 category/author selectors; legacy detail selector retained; /s/ content links only",
      surfaceVerification(value) {
        const host = hostOf(value);
        if (host === "search.literotica.com" || host === "tags.literotica.com") return "live-layout-inspected";
        if (host === "literotica.com" || host === "www.literotica.com") {
          const url = asUrl(value);
          if (url && (url.pathname === "/top/stories" || url.pathname === "/top/stories/")) return "live-layout-inspected";
          if (url && (/^\/c\/[^/]+\/?$/.test(url.pathname) || /^\/authors\/[^/]+\/works\/stories\/?$/.test(url.pathname))) return "saved-html-inspected";
          if (url && /^\/s\/[^/]+(?:\/[^/]*)?\/?$/i.test(url.pathname)) return "experimental";
        }
        return "unverified";
      }
    })
  ];

  root.BookmarkFilterAdapters = {
    all: adapters,
    byId: Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter])),
    forUrl(value) {
      const url = asUrl(value);
      return url ? adapters.find((adapter) => adapter.isSupportedPage(url)) || null : null;
    },
    normalizeBookmarkUrl(value) {
      const adapter = this.forUrl(value);
      return adapter ? adapter.normalizeBookmarkUrl(value) : null;
    },
    normalizeCreatorUrl(value) {
      const adapter = this.forUrl(value);
      return adapter ? adapter.normalizeCreatorUrl(value) : null;
    }
  };
  if (typeof module !== "undefined") module.exports = root.BookmarkFilterAdapters;
})(typeof globalThis !== "undefined" ? globalThis : this);
