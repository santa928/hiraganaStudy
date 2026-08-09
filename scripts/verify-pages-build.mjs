/* global console, process */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ICONS = [
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
  ["icons/icon-maskable-512.png", 512],
];

/** directory以下の全fileをPOSIX風の相対pathで列挙する。 */
async function listArtifactPaths(directory, current = directory) {
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) paths.push(...await listArtifactPaths(directory, absolutePath));
    else paths.push(relative(directory, absolutePath).split("\\").join("/"));
  }
  return paths.sort();
}

/** HTML、manifest、成果物一覧、service workerを純粋に照合する。 */
export function findPagesBuildIssues({ basePath, html, manifest, artifactPaths, serviceWorkerSource }) {
  const issues = [];
  const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const url of urls) {
    if (url.startsWith("/") && !url.startsWith(basePath)) {
      issues.push(`HTML asset URL が ${basePath} 配下ではありません: ${url}`);
    }
  }

  if (manifest.name !== "ひらがなのにわ") issues.push("manifest name が不正です");
  if (manifest.short_name !== "ひらがな") issues.push("manifest short_name が不正です");
  if (manifest.display !== "standalone") issues.push("manifest display がstandaloneではありません");
  if (manifest.orientation !== "any") issues.push("manifest orientation がanyではありません");
  if (manifest.start_url !== basePath) issues.push(`manifest start_url が ${basePath} ではありません`);
  if (manifest.scope !== basePath) issues.push(`manifest scope が ${basePath} ではありません`);
  if (manifest.theme_color !== "#dff3ff" || manifest.background_color !== "#fff4d7") issues.push("manifest色がCSS tokenと一致しません");

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const iconKeys = new Set(icons.map((icon) => `${icon.src}|${icon.sizes}|${icon.type}|${icon.purpose ?? ""}`));
  const hasIcons = iconKeys.has("icons/icon-192.png|192x192|image/png|")
    && iconKeys.has("icons/icon-512.png|512x512|image/png|")
    && iconKeys.has("icons/icon-maskable-512.png|512x512|image/png|maskable");
  if (!hasIcons) issues.push("PWA icon 3種が揃っていません");

  const artifactSet = new Set(artifactPaths);
  for (const requiredPath of ["index.html", "manifest.webmanifest", "sw.js", ...EXPECTED_ICONS.map(([path]) => path)]) {
    if (!artifactSet.has(requiredPath)) issues.push(`build成果物がありません: ${requiredPath}`);
  }
  if (!artifactPaths.some((path) => /^workbox-[^.]+\.js$/.test(path))) issues.push("Workbox runtime が生成されていません");
  if (!/\.webp/.test(serviceWorkerSource)) issues.push("service worker に画像cacheがありません");
  if (!/\.wav/.test(serviceWorkerSource)) issues.push("service worker に音声cacheがありません");
  const cacheableArtifacts = artifactPaths.filter((path) => path === "index.html"
    || (/\.(?:js|css|webp|wav|png|json)$/.test(path) && path !== "sw.js" && !/^workbox-[^.]+\.js$/.test(path)));
  for (const path of cacheableArtifacts) {
    if (!serviceWorkerSource.includes(path)) issues.push(`service worker cache欠落: ${path}`);
  }
  return issues;
}

/** 実distを検査し、Pages subpath・PWA成果物・icon寸法の欠落を列挙する。 */
export async function verifyPagesBuild({
  distDirectory = join(REPOSITORY_ROOT, "dist"),
  basePath = "/hiraganaStudy/",
  log = true,
} = {}) {
  const issues = [];
  try {
    const [html, manifestSource, serviceWorkerSource, artifactPaths] = await Promise.all([
      readFile(join(distDirectory, "index.html"), "utf8"),
      readFile(join(distDirectory, "manifest.webmanifest"), "utf8"),
      readFile(join(distDirectory, "sw.js"), "utf8"),
      listArtifactPaths(distDirectory),
    ]);
    issues.push(...findPagesBuildIssues({
      basePath,
      html,
      manifest: JSON.parse(manifestSource),
      artifactPaths,
      serviceWorkerSource,
    }));
    for (const [relativePath, expectedSize] of EXPECTED_ICONS) {
      const metadata = await sharp(join(distDirectory, relativePath)).metadata();
      if (metadata.format !== "png" || metadata.width !== expectedSize || metadata.height !== expectedSize) {
        issues.push(`PWA icon寸法が不正です: ${relativePath}`);
      }
    }
    const maskable = await sharp(join(distDirectory, "icons/icon-maskable-512.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let unsafePixels = 0;
    for (let y = 0; y < maskable.info.height; y += 1) {
      for (let x = 0; x < maskable.info.width; x += 1) {
        const offset = (y * maskable.info.width + x) * maskable.info.channels;
        const colorDistance = Math.abs(maskable.data[offset] - 223)
          + Math.abs(maskable.data[offset + 1] - 243)
          + Math.abs(maskable.data[offset + 2] - 255);
        const outsideSafeCircle = Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 205;
        if (colorDistance > 12 && outsideSafeCircle) unsafePixels += 1;
      }
    }
    if (unsafePixels > 0) issues.push(`maskable iconの安全円外に主役pixelがあります: ${unsafePixels}`);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  if (log) {
    if (issues.length === 0) console.log(`Verified GitHub Pages PWA build for ${basePath}`);
    else for (const issue of issues) console.error(issue);
  }
  return { ok: issues.length === 0, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const basePath = process.argv[2] ?? "/hiraganaStudy/";
  const result = await verifyPagesBuild({ basePath });
  if (!result.ok) process.exitCode = 1;
}
