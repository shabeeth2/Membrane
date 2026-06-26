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

// Bundle content.js: inline config imports so content script doesn't need ES modules
const configPath = path.join(distDir, "config.js");
const contentPath = path.join(distDir, "content.js");

if (fs.existsSync(configPath) && fs.existsSync(contentPath)) {
  const configSrc = fs.readFileSync(configPath, "utf-8");
  const contentSrc = fs.readFileSync(contentPath, "utf-8");

  // Extract SUPPORTED_HOSTS and HOST_NAMES from config.js
  const hostsMatch = configSrc.match(/export const SUPPORTED_HOSTS = (\[[\s\S]*?\]);/);
  const namesMatch = configSrc.match(/export const HOST_NAMES = (\{[\s\S]*?\});/);

  if (hostsMatch && namesMatch) {
    const bundled = contentSrc
      .replace(/import \{ SUPPORTED_HOSTS, HOST_NAMES \} from "\.\/config\.js";\n?/, "")
      .replace(/^/, `const SUPPORTED_HOSTS = ${hostsMatch[1]};\nconst HOST_NAMES = ${namesMatch[1]};\n`);

    fs.writeFileSync(contentPath, bundled, "utf-8");
    console.log("Bundled content.js (inlined config)");
  }
}
