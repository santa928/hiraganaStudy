import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useFullscreen } from "./useFullscreen";

/** Fullscreen APIのない環境でも、初期状態とキーボード操作を安全に保つ。 */
describe("useFullscreen", () => {
  it("未対応環境ではfullscreenElementがundefinedでも非全画面として扱う", () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: undefined });

    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isFullscreen).toBe(false);
    expect(() => result.current.toggleFullscreen()).not.toThrow();
  });

  it("fキーは入力欄では無視し、拒否されても例外にしない", async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    const request = vi.fn(() => Promise.reject(new Error("denied")));
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    const { result } = renderHook(() => useFullscreen());
    const input = document.createElement("input");
    document.body.append(input);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    expect(request).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(() => result.current.toggleFullscreen()).not.toThrow();
    input.remove();
  });

  it("unmount後はfキーのlistenerを残さない", () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    const { unmount } = renderHook(() => useFullscreen());

    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(request).not.toHaveBeenCalled();
  });
});
