import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";

import { ParentDashboard, type ParentEnvironment } from "./ParentDashboard";
import { ParentGate } from "./ParentGate";
import { createInitialProgress } from "../learning/model/reducer";

const environment: ParentEnvironment = { audioStatus: "ready", storage: "normal", displayMode: "browser", pwaStatus: "未確認" };

describe("ParentGate", () => {
  afterEach(() => vi.useRealTimers());

  /** jsdomでも押下領域の座標契約を確認する。 */
  function setGateBounds(gate: HTMLElement): void {
    vi.spyOn(gate, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 120, height: 48, top: 0, right: 120, bottom: 48, left: 0,
      toJSON: () => ({}),
    });
  }

  it("StrictModeの再setup後も2秒保持で開く", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<StrictMode><ParentGate onOpen={onOpen} /></StrictMode>);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    fireEvent.pointerDown(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("必要時間を常時示し、長押し開始から離すまで即座に反応を返す", () => {
    vi.useFakeTimers();
    render(<ParentGate onOpen={vi.fn()} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });

    expect(screen.getByText("2びょう ながおし")).toBeVisible();
    expect(gate).toHaveAttribute("data-holding", "false");

    fireEvent.pointerDown(gate, { pointerId: 1, clientX: 24, clientY: 24 });
    expect(gate).toHaveAttribute("data-holding", "true");
    expect(screen.getByText("そのまま おしてね")).toBeVisible();

    fireEvent.pointerUp(gate, { pointerId: 1, clientX: 24, clientY: 24 });
    expect(gate).toHaveAttribute("data-holding", "false");
    expect(screen.getByText("2びょう ながおし")).toBeVisible();
  });

  it("iOSの長押しメニューを出さず保護者操作を継続する", () => {
    render(<ParentGate onOpen={vi.fn()} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    expect(gate.dispatchEvent(contextMenu)).toBe(false);
    expect(contextMenu.defaultPrevented).toBe(true);
  });

  it("2秒の連続保持だけで開き、短いtapとcancelでは開かない", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const { unmount } = render(<ParentGate onOpen={onOpen} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    await act(async () => { gate.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })); vi.advanceTimersByTime(1999); });
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => { gate.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })); vi.advanceTimersByTime(1); });
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => { gate.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2 })); vi.advanceTimersByTime(2000); });
    expect(onOpen).toHaveBeenCalledOnce();
    unmount();
    vi.useRealTimers();
  });

  it("cancelとunmount後は保留中の長押しを開かない", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const { unmount } = render(<ParentGate onOpen={onOpen} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    fireEvent.pointerDown(gate, { pointerId: 1 });
    fireEvent.pointerCancel(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.pointerDown(gate, { pointerId: 2 });
    unmount();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("押下中の領域内移動は継続し、領域外移動だけをcancelする", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<ParentGate onOpen={onOpen} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    setGateBounds(gate);
    fireEvent.pointerDown(gate, { pointerId: 1, clientX: 24, clientY: 24 });
    fireEvent.pointerMove(gate, { pointerId: 1, clientX: 100, clientY: 30 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).toHaveBeenCalledOnce();

    fireEvent.pointerDown(gate, { pointerId: 2, clientX: 24, clientY: 24 });
    fireEvent.pointerMove(gate, { pointerId: 2, clientX: 121, clientY: 24 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("別pointerの移動を無視し、capture失敗でも現在pointerを保持する", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<ParentGate onOpen={onOpen} />);
    const gate = screen.getByRole("button", { name: "おとなの せってい" });
    setGateBounds(gate);
    Object.defineProperty(gate, "setPointerCapture", { configurable: true, value: () => { throw new Error("unsupported"); } });
    fireEvent.pointerDown(gate, { pointerId: 1, clientX: 24, clientY: 24 });
    fireEvent.pointerMove(gate, { pointerId: 2, clientX: 200, clientY: 24 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onOpen).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("ParentDashboard", () => {
  it("設定を通知し、葉の順序と最終確認の後だけresetを実行する", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={onSettingsChange} onReset={onReset} onClose={vi.fn()} />);

    expect(screen.getByText("音声: つかえます")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "もういちど案内した回数" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "こえ" }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ speech: false }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    expect(screen.getByText("ひだりの はから さわってね")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("任意の行音復習を全文字の達成項目として表示しない", () => {
    render(<ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={vi.fn()} onReset={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()} />);

    expect(screen.queryByRole("columnheader", { name: "ぎょうの おと" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "おと" })).not.toBeInTheDocument();
  });

  it("reset失敗では進捗を保持し、実行中の二重確認を防ぐ", async () => {
    const user = userEvent.setup();
    let rejectReset: ((error: Error) => void) | undefined;
    const onReset = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectReset = reject; }));
    render(<ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={vi.fn()} onReset={onReset} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    const confirm = screen.getByRole("button", { name: "ほんとうに はじめからにする" });
    await user.click(confirm);
    await user.click(confirm);
    expect(onReset).toHaveBeenCalledOnce();
    await act(async () => { rejectReset?.(new Error("storage")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("リセットできませんでした");
  });

  it("StrictModeでもdeferred resetの失敗を表示し、成功後だけ葉を戻す", async () => {
    const user = userEvent.setup();
    let resolveReset: (() => void) | undefined;
    let rejectReset: ((error: Error) => void) | undefined;
    const onReset = vi.fn(() => new Promise<void>((resolve, reject) => {
      resolveReset = resolve;
      rejectReset = reject;
    }));
    render(<StrictMode><ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={vi.fn()} onReset={onReset} onClose={vi.fn()} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    await act(async () => { rejectReset?.(new Error("storage")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("リセットできませんでした");

    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    await act(async () => { resolveReset?.(); });
    expect(await screen.findByText("ひだりの はから さわってね")).toBeVisible();
  });

  it("unmount後のdeferred reset完了は画面更新を試みない", async () => {
    const user = userEvent.setup();
    let resolveReset: (() => void) | undefined;
    const onReset = vi.fn(() => new Promise<void>((resolve) => { resolveReset = resolve; }));
    const { unmount } = render(<StrictMode><ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={vi.fn()} onReset={onReset} onClose={vi.fn()} /></StrictMode>);
    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    unmount();
    await act(async () => { resolveReset?.(); });
  });
});
