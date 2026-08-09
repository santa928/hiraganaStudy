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

describe("GitHub Pages build verifier", () => {
  it("subpath付きHTML・manifest・offline成果物を受け入れる", () => {
    const issues = findPagesBuildIssues({
      basePath: "/hiraganaStudy/",
      html: '<link rel="manifest" href="/hiraganaStudy/manifest.webmanifest"><script src="/hiraganaStudy/assets/index-abc.js"></script>',
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html"},{url:"assets/index-abc.js"},{url:"assets/picture.webp"},{url:"assets/sound.wav"},{url:"icons/icon-192.png"},{url:"icons/icon-512.png"},{url:"icons/icon-maskable-512.png"}])',
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
      html: '<link rel="manifest" href="/hiraganaStudy/manifest.webmanifest"><script src="/hiraganaStudy/assets/index-abc.js"></script>',
      manifest: VALID_MANIFEST,
      artifactPaths: ["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js", "assets/index-abc.js", "assets/picture.webp", "assets/sound.wav", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      serviceWorkerSource: 'precacheAndRoute([{url:"index.html"},{url:"assets/index-abc.js"},{url:"assets/picture.webp"},{url:"icons/icon-192.png"},{url:"icons/icon-512.png"},{url:"icons/icon-maskable-512.png"}])',
    });

    expect(issues).toContain("service worker cache欠落: assets/sound.wav");
  });
});
