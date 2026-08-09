import { describe, expect, it, vi } from "vitest";

import { PwaStatusStore, pwaStatusLabel } from "./PwaStatus";

describe("PwaStatusStore", () => {
  it("端末の対応状況と既存controllerから初期状態を決める", () => {
    expect(new PwaStatusStore({ supported: false, controlled: false }).getSnapshot()).toBe("unsupported");
    expect(new PwaStatusStore({ supported: true, controlled: false }).getSnapshot()).toBe("checking");
    expect(new PwaStatusStore({ supported: true, controlled: true }).getSnapshot()).toBe("offline-ready");
  });

  it("状態が変わった時だけ購読者へ通知し、解除後は通知しない", () => {
    const store = new PwaStatusStore({ supported: true, controlled: false });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setStatus("offline-ready");
    store.setStatus("offline-ready");
    unsubscribe();
    store.setStatus("update-available");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("保護者へ技術語ではなく利用状態を日本語で示す", () => {
    expect(pwaStatusLabel("unsupported")).toBe("このブラウザでは使えません");
    expect(pwaStatusLabel("checking")).toBe("オフラインの準備中です");
    expect(pwaStatusLabel("offline-ready")).toBe("オフラインで使えます");
    expect(pwaStatusLabel("update-available")).toBe("新しい版は次回起動で使えます");
    expect(pwaStatusLabel("online-only")).toBe("オンラインで使えます");
  });
});
