const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const workerPath = path.join(root, "background/service-worker.js");
const workerSource = fs.readFileSync(workerPath, "utf8");
const knownImports = new Set([
  path.resolve(path.dirname(workerPath), "../shared/url-utils.js"),
  path.resolve(path.dirname(workerPath), "../shared/protocol.js"),
  path.resolve(path.dirname(workerPath), "../content/adapters.js")
]);

function event() {
  const listeners = [];
  return {
    addListener: (listener) => listeners.push(listener),
    fire: (...args) => listeners.forEach((listener) => listener(...args)),
    send: (...args) => listeners.map((listener) => listener(...args))
  };
}

function worker(tree, sharedStorage = {}) {
  let trees = 0;
  const storage = sharedStorage;
  const chrome = {
    runtime: { id: "ext", onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { local: {
      get: async (defaults) => Object.fromEntries(Object.keys(defaults || {}).map((key) => [key, storage[key] === undefined ? defaults[key] : storage[key]])),
      set: async (values) => Object.assign(storage, values)
    }, onChanged: event() },
    bookmarks: { getTree: async () => { trees += 1; return tree; }, onCreated: event(), onChanged: event(), onRemoved: event(), onMoved: event(), onImportBegan: event(), onImportEnded: event() },
    tabs: { query: async () => [], sendMessage: async () => undefined }
  };
  const context = { chrome, console, Promise, URL, URLSearchParams, setTimeout, clearTimeout };
  context.globalThis = context;
  context.importScripts = (...files) => files.forEach((file) => {
    const resolved = path.resolve(path.dirname(workerPath), file);
    if (!knownImports.has(resolved)) throw new Error(`Unexpected local import: ${file}`);
    vm.runInContext(fs.readFileSync(resolved, "utf8"), context, { filename: resolved });
  });
  vm.createContext(context);
  vm.runInContext(workerSource, context, { filename: workerPath });
  return { context, chrome, get treeReads() { return trees; } };
}

module.exports = { worker };
