const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "../..");
const urlUtils = require(path.join(root, "shared/url-utils.js"));
const adapters = require(path.join(root, "content/adapters.js"));
const contentSource = fs.readFileSync(path.join(root, "content/content-script.js"), "utf8");

function wait(ms = 25) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeout = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await wait(5);
  }
  throw new Error("Timed out waiting for runtime condition");
}

async function contentRuntime({ html, response, url = "https://www.pornhub.com/videos", onMessage, waitTimeout = 2000 }) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const listeners = [];
  const calls = [];
  dom.window.BookmarkFilterUrl = urlUtils;
  dom.window.BookmarkFilterAdapters = adapters;
  dom.window.chrome = {
    runtime: {
      sendMessage: async (message) => {
        calls.push(message);
        onMessage?.(message, dom, (inbound) => {
          for (const listener of listeners) listener(inbound, {}, () => {});
        });
        return response(message);
      },
      onMessage: { addListener: (listener) => listeners.push(listener) }
    }
  };
  dom.window.Function("location", contentSource)(dom.window.location);
  await waitFor(() => dom.window.BookmarkFilterContent && !dom.window.BookmarkFilterContent.scanning, waitTimeout);
  return {
    dom,
    calls,
    async message(message) {
      let value;
      for (const listener of listeners) listener(message, {}, (responseValue) => { value = responseValue; });
      await wait(0);
      return value;
    },
    async settle() {
      await wait(0);
      await waitFor(() => dom.window.BookmarkFilterContent && !dom.window.BookmarkFilterContent.scanning, waitTimeout);
    }
  };
}

module.exports = { contentRuntime, wait, waitFor };
