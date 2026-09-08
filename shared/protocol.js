(function (root) {
  const MAX_CANDIDATES = 200;
  const MAX_TOKEN_LENGTH = 128;
  const MAX_URL_LENGTH = 4096;
  const MAX_SITE_LENGTH = 32;
  const REQUEST = "GET_PAGE_MATCHES";

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function error(code, message) {
    return { error: code, message: message || code };
  }

  function validateMatchesRequest(message) {
    if (!isRecord(message) || message.type !== REQUEST) return error("invalid_request");
    if (typeof message.siteId !== "string" || message.siteId.length === 0 || message.siteId.length > MAX_SITE_LENGTH) return error("invalid_site");
    if (!Array.isArray(message.candidates) || message.candidates.length > MAX_CANDIDATES) return error("invalid_candidates");
    for (const candidate of message.candidates) {
      if (!isRecord(candidate) || typeof candidate.token !== "string" || candidate.token.length === 0 || candidate.token.length > MAX_TOKEN_LENGTH) return error("invalid_candidate");
      if (typeof candidate.url !== "string" || candidate.url.length === 0 || candidate.url.length > MAX_URL_LENGTH) return error("invalid_candidate");
    }
    return null;
  }

  const protocol = { MAX_CANDIDATES, MAX_TOKEN_LENGTH, MAX_URL_LENGTH, REQUEST, error, validateMatchesRequest };
  root.BookmarkFilterProtocol = protocol;
  if (typeof module !== "undefined") module.exports = protocol;
})(typeof globalThis !== "undefined" ? globalThis : this);
