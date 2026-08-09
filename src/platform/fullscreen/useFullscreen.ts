import { useCallback, useEffect, useState } from "react";

/** Fullscreen APIの可否を学習画面へ安全に公開する。失敗しても操作を止めない。 */
export function useFullscreen(): { readonly isFullscreen: boolean; readonly toggleFullscreen: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement !== null);

  useEffect(() => {
    const sync = (): void => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback((): void => {
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const documentWithLegacy = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    const exit = document.exitFullscreen ?? documentWithLegacy.webkitExitFullscreen;
    const operation = document.fullscreenElement ? exit?.call(document) : request?.call(root);
    void Promise.resolve(operation).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "f" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  return { isFullscreen, toggleFullscreen };
}
