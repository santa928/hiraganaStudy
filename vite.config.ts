/* global process */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const basePath = process.env.BASE_PATH ?? "/";

/** Vite と Vitest の共通設定。 */
export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      registerType: "prompt",
      includeManifestIcons: false,
      manifestFilename: "manifest.webmanifest",
      manifest: {
        id: basePath,
        name: "ひらがなのにわ",
        short_name: "ひらがな",
        description: "文字をまだ読めない子どもが、絵と音声と書字でひらがなを育てる学習ゲーム",
        lang: "ja",
        display: "standalone",
        orientation: "any",
        start_url: basePath,
        scope: basePath,
        theme_color: "#dff3ff",
        background_color: "#fff4d7",
        categories: ["education", "games", "kids"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        dontCacheBustURLsMatching: /assets\/.*-[A-Za-z0-9_-]{8,}\.(?:js|css)$/,
        globPatterns: ["**/*.{js,css,html,webp,wav,png,json}"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: "index.html",
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
