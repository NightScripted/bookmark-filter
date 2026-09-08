const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function readPng(filePath) {
  const data = fs.readFileSync(filePath);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filePath} has a PNG signature`);
  assert.equal(data.toString("ascii", 12, 16), "IHDR", `${filePath} has an IHDR chunk`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  const idat = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(data.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, `${filePath} uses 8-bit channels`);
  assert.equal(colorType, 6, `${filePath} preserves RGBA alpha`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  let minimumAlpha = 255;
  let maximumAlpha = 0;
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const above = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      const value = raw[cursor++];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + above) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceAbove = Math.abs(estimate - above);
        const distanceUpperLeft = Math.abs(estimate - upperLeft);
        const predictor = distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft ? left : distanceAbove <= distanceUpperLeft ? above : upperLeft;
        row[x] = (value + predictor) & 255;
      } else throw new Error(`Unsupported PNG filter ${filter} in ${filePath}`);
    }
    for (let x = 3; x < stride; x += 4) {
      minimumAlpha = Math.min(minimumAlpha, row[x]);
      maximumAlpha = Math.max(maximumAlpha, row[x]);
    }
    previous = row;
  }
  return { width, height, minimumAlpha, maximumAlpha };
}

function assertReferencedFile(relativePath) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `manifest path exists: ${relativePath}`);
}

test("manifest exposes generated icons and preserves extension permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.incognito, "split");
  assert.deepEqual(manifest.permissions, ["bookmarks", "storage"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://pornhub.com/*", "https://*.pornhub.com/*",
    "https://xvideos.com/*", "https://*.xvideos.com/*",
    "https://xhamster.com/*", "https://*.xhamster.com/*",
    "https://literotica.com/*", "https://*.literotica.com/*"
  ]);
  assert.deepEqual(manifest.icons, {
    "16": "assets/icons/icon16.png",
    "32": "assets/icons/icon32.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  });
  assert.deepEqual(manifest.action.default_icon, {
    "16": "assets/icons/icon16.png",
    "24": "assets/icons/icon24.png",
    "32": "assets/icons/icon32.png"
  });
});

test("manifest and worker production imports resolve to files", () => {
  assertReferencedFile(manifest.background.service_worker);
  assertReferencedFile(manifest.action.default_popup);
  for (const iconPath of Object.values(manifest.icons)) assertReferencedFile(iconPath);
  for (const iconPath of Object.values(manifest.action.default_icon)) assertReferencedFile(iconPath);
  for (const contentScript of manifest.content_scripts) {
    for (const cssPath of contentScript.css || []) assertReferencedFile(cssPath);
    for (const scriptPath of contentScript.js || []) assertReferencedFile(scriptPath);
  }

  const worker = fs.readFileSync(path.join(root, manifest.background.service_worker), "utf8");
  const imports = [...worker.matchAll(/importScripts\(([^)]+)\)/g)].flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]));
  assert.ok(imports.length > 0, "worker declares production imports");
  for (const importPath of imports) assertReferencedFile(path.posix.normalize(path.posix.join(path.posix.dirname(manifest.background.service_worker), importPath)));
});

test("all generated icons are valid RGBA PNGs with expected dimensions and transparency", () => {
  const expected = { 16: 16, 24: 24, 32: 32, 48: 48, 128: 128 };
  for (const [size, dimension] of Object.entries(expected)) {
    const info = readPng(path.join(root, "assets", "icons", `icon${size}.png`));
    assert.deepEqual({ width: info.width, height: info.height }, { width: dimension, height: dimension });
    assert.ok(info.minimumAlpha < 255, `icon${size}.png retains transparent pixels`);
    assert.ok(info.maximumAlpha > 0, `icon${size}.png contains visible pixels`);
  }
});
