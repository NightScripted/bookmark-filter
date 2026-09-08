(function (root) {
  // Only these well-known tracking parameters may be removed. Unknown query
  // parameters, duplicate parameters, path case, and repeated slashes matter.
  const TRACKING_PARAMS = new Set([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "dclid", "fbclid", "msclkid"
  ]);

  function safeUrl(value) {
    try {
      const raw = value instanceof URL || (value && typeof value.href === "string") ? value.href : String(value);
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return null;
      if (url.username || url.password || url.port) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  // This helper intentionally does not collapse slashes, lower-case paths, or
  // remove a trailing slash. Route-specific adapters may canonicalize only
  // after recognizing a verified content route.
  function cleanPath(pathname) { return String(pathname || "/"); }

  function normalizedUrl(value, options) {
    const url = safeUrl(value);
    if (!url) return null;
    const opts = options || {};
    const dropped = new Set((opts.dropParams || []).map(String));
    const params = [];
    for (const [key, paramValue] of url.searchParams) {
      if (!dropped.has(key) && !(opts.dropTracking !== false && TRACKING_PARAMS.has(key))) {
        params.push([key, paramValue]);
      }
    }
    const query = new URLSearchParams(params).toString();
    const base = `${url.protocol}//${url.hostname.toLowerCase()}${cleanPath(url.pathname)}`;
    const withQuery = query ? `${base}?${query}` : base;
    return opts.stripFragment ? withQuery : `${withQuery}${url.hash}`;
  }

  root.BookmarkFilterUrl = { safeUrl, normalizedUrl, cleanPath, TRACKING_PARAMS };
  if (typeof module !== "undefined") module.exports = root.BookmarkFilterUrl;
})(typeof globalThis !== "undefined" ? globalThis : this);
