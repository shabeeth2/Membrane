const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const assetsDir = path.join(extensionDir, "assets");
const distAssetsDir = path.join(distDir, "assets");

fs.mkdirSync(distDir, { recursive: true });

for (const name of ["manifest.json", "popup.html", "popup.css", "injected.css"]) {
  fs.copyFileSync(path.join(extensionDir, name), path.join(distDir, name));
}

if (fs.existsSync(assetsDir)) {
  fs.mkdirSync(distAssetsDir, { recursive: true });
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(assetsDir, entry.name), path.join(distAssetsDir, entry.name));
    }
  }
}
