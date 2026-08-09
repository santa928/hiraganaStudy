import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";

import { ParentDashboard, type ParentEnvironment } from "./ParentDashboard";
import { ParentGate } from "./ParentGate";
import { createInitialProgress } from "../learning/model/reducer";

const environment: ParentEnvironment = { audioStatus: "ready", storage: "normal", displayMode: "browser", pwaStatus: "未確認" };

describe("ParentGate", () => {
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
});

describe("ParentDashboard", () => {
  it("設定を通知し、葉の順序と最終確認の後だけresetを実行する", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<ParentDashboard progress={createInitialProgress()} environment={environment} onSettingsChange={onSettingsChange} onReset={onReset} onClose={vi.fn()} />);

    expect(screen.getByText("音声: つかえます")).toBeVisible();
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
});
