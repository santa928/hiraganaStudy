import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import { browserPwaStatusStore } from "./platform/pwa/PwaStatus";
import "./styles/tokens.css";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("アプリの起動要素 #root が見つかりません。");
}

if ("serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady: () => browserPwaStatusStore.setStatus("offline-ready"),
    onNeedRefresh: () => browserPwaStatusStore.setStatus("update-available"),
    onRegisterError: () => browserPwaStatusStore.setStatus("online-only"),
  });
  void navigator.serviceWorker.ready.then(() => {
    if (browserPwaStatusStore.getSnapshot() !== "update-available") browserPwaStatusStore.setStatus("offline-ready");
  }).catch(() => browserPwaStatusStore.setStatus("online-only"));
  navigator.serviceWorker.addEventListener("controllerchange", () => browserPwaStatusStore.setStatus("offline-ready"));
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
