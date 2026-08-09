import { useSyncExternalStore } from "react";

/** 保護者画面で扱う、PWAの利用可能性と更新状態。 */
export type PwaStatus = "unsupported" | "checking" | "offline-ready" | "update-available" | "online-only";

export interface PwaCapabilitySnapshot {
  readonly supported: boolean;
  readonly controlled: boolean;
}

/** Service Workerの非同期通知をReactから安全に購読できる小さなstore。 */
export class PwaStatusStore {
  private status: PwaStatus;
  private readonly listeners = new Set<() => void>();

  public constructor(capabilities: PwaCapabilitySnapshot) {
    this.status = !capabilities.supported ? "unsupported" : capabilities.controlled ? "offline-ready" : "checking";
  }

  /** useSyncExternalStoreへ現在値を返す。 */
  public readonly getSnapshot = (): PwaStatus => this.status;

  /** 状態変化の購読を開始し、対になる解除関数を返す。 */
  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** 同じ状態の重複通知を避けつつ、登録済み画面へ更新を伝える。 */
  public setStatus(status: PwaStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }
}

/** PWA内部状態を、保護者が判断できる短い日本語へ変換する。 */
export function pwaStatusLabel(status: PwaStatus): string {
  if (status === "unsupported") return "このブラウザでは使えません";
  if (status === "checking") return "オフラインの準備中です";
  if (status === "offline-ready") return "オフラインで使えます";
  if (status === "update-available") return "新しい版は次回起動で使えます";
  return "オンラインで使えます";
}

/** import時点のブラウザ能力を、副作用なくstoreの初期値へ変換する。 */
function readBrowserCapabilities(): PwaCapabilitySnapshot {
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  return { supported, controlled: supported && navigator.serviceWorker.controller !== null };
}

export const browserPwaStatusStore = new PwaStatusStore(readBrowserCapabilities());

/** AppからPWA状態の日本語labelだけを購読する。 */
export function usePwaStatusLabel(store: PwaStatusStore = browserPwaStatusStore): string {
  const status = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return pwaStatusLabel(status);
}
