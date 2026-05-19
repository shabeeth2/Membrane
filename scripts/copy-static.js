const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");

fs.mkdirSync(distDir, { recursive: true });

for (const name of ["manifest.json", "popup.html", "popup.css"]) {
  fs.copyFileSync(path.join(extensionDir, name), path.join(distDir, name));
}
