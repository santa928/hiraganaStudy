/* global process */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findPagesBuildIssues } from "./verify-pages-build.mjs";

const VALID_MANIFEST = {
  name: "ひらがなのにわ",
  short_name: "ひらがな",
  display: "standalone",
  orientation: "any",
  start_url: "/hiraganaStudy/",
  scope: "/hiraganaStudy/",
  theme_color: "#dff3ff",
  background_color: "#fff4d7",
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
const VALID_HTML = '<link rel="icon" href="/hiraganaStudy/icons/icon-192.png"><link rel="manifest" href="/hiraganaStudy/manifest.webmanifest"><script src="/hiraganaStudy/assets/index-abc.js"></script>';

describe("GitHub Pages build verifier", () => {
  it("subpath付きHTML・manifest・offline成果物を受け入れる", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: VALID_HTML,
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "assets/index-abc.js", "assets/picture.webp", "assets/sound.wav", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-abc.js",revision:null},{url:"assets/picture.webp",revision:"b"},{url:"assets/sound.wav",revision:"c"},{url:"icons/icon-192.png",revision:"d"},{url:"icons/icon-512.png",revision:"e"},{url:"icons/icon-maskable-512.png",revision:"f"}])',
    });

    expect(issues).toEqual([]);
  });

  it("root直下asset URLと不完全なmanifest・cacheを拒否する", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: '<link rel="manifest" href="/manifest.webmanifest"><script src="/assets/index-abc.js"></script>',
      manifest: { ...VALID_MANIFEST, name: "仮名", start_url: "/", icons: [] },
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js"],
      serviceWorkerSource: "precacheAndRoute([])",
    });

    expect(issues).toEqual(expect.arrayContaining([
      "HTML asset URL が /hiraganaStudy/ 配下ではありません: /manifest.webmanifest",
      "HTML asset URL が /hiraganaStudy/ 配下ではありません: /assets/index-abc.js",
      "manifest name が不正です",
      "manifest start_url が /hiraganaStudy/ ではありません",
      "PWA icon 3種が揃っていません",
      "Workbox runtime が生成されていません",
      "service worker に画像cacheがありません",
      "service worker に音声cacheがありません",
    ]));
  });

  it("画面・画像・音声・iconの一部でもprecacheから欠ければ拒否する", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: VALID_HTML,
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "assets/index-abc.js", "assets/picture.webp", "assets/sound.wav", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-abc.js",revision:null},{url:"assets/picture.webp",revision:"b"},{url:"icons/icon-192.png",revision:"d"},{url:"icons/icon-512.png",revision:"e"},{url:"icons/icon-maskable-512.png",revision:"f"}])',
    });

    expect(issues).toContain("service worker cache欠落: assets/sound.wav");
  });

  it("固定名assetのnull revisionとprecache URL重複を拒否する", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: VALID_HTML,
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "assets/index-abc.js", "assets/picture.webp", "assets/sound.wav", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-abc.js",revision:null},{url:"assets/picture.webp",revision:null},{url:"assets/sound.wav",revision:"c"},{url:"icons/icon-192.png",revision:"d"},{url:"icons/icon-192.png",revision:"d"},{url:"icons/icon-512.png",revision:"e"},{url:"icons/icon-maskable-512.png",revision:"f"}])',
    });

    expect(issues).toContain("固定asset revision欠落: assets/picture.webp");
    expect(issues).toContain("precache URL重複: icons/icon-192.png");
  });

  it("Pages metadataを読むbuild jobへ最小権限を付ける", async () => {
    const workflow = await readFile(join(process.cwd(), ".github/workflows/deploy-pages.yml"), "utf8");
    const buildJob = workflow.match(/\n {2}build:\n([\s\S]*?)\n {2}deploy:/)?.[1] ?? "";

    expect(buildJob).toMatch(/permissions:\n\s+contents: read\n\s+pages: read/);
  });

  it("既定faviconの404を防ぐbase path付きicon linkを必須にする", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: '<link rel="manifest" href="/hiraganaStudy/manifest.webmanifest"><script src="/hiraganaStudy/assets/index-abc.js"></script>',
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "assets/index-abc.js", "assets/picture.webp", "assets/sound.wav", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-abc.js",revision:null},{url:"assets/picture.webp",revision:"b"},{url:"assets/sound.wav",revision:"c"},{url:"icons/icon-192.png",revision:"d"},{url:"icons/icon-512.png",revision:"e"},{url:"icons/icon-maskable-512.png",revision:"f"}])',
    });

    expect(issues).toContain("favicon が /hiraganaStudy/icons/icon-192.png ではありません");
  });
});
