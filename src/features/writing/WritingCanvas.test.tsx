import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WritingCanvas } from "./WritingCanvas";
import { loadStrokeTemplate } from "./data/types";

type ResizeObserverCallback = (entries: readonly ResizeObserverEntry[]) => void;

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  trigger(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry]);
  }
}

/** requestAnimationFrameを手動で進める小さなテスト時計を作る。 */
function installAnimationFrame(): { flush: (time?: number) => void; restore: () => void } {
  const callbacks = new Map<number, FrameRequestCallback>();
  let identifier = 0;
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    identifier += 1;
    callbacks.set(identifier, callback);
    return identifier;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    flush(time = 34): void {
      const current = [...callbacks.values()];
      callbacks.clear();
      current.forEach((callback) => callback(time));
    },
    restore(): void {
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

/** Canvas 2D APIで検査する描画呼び出しだけを持つcontextを返す。 */
function installCanvasContext(): ReturnType<typeof vi.spyOn> {
  const context = {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    lineCap: "round", lineJoin: "round", strokeStyle: "", fillStyle: "", lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
}

function pointEvent(type: string, pointerId: number, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId, clientX: x, clientY: y, pointerType: "touch", buttons: 1 });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  ResizeObserverMock.instances = [];
});

describe("WritingCanvas", () => {
  it("朝の庭の語彙で、太いなぞりから補助なしまでguideを切り替える", () => {
    const context = installCanvasContext();
    const animation = installAnimationFrame();
    const { rerender, getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />);
    const canvas = getByRole("application", { name: "あ を なぞろう" });

    expect(canvas.className).toContain("writingCanvas");
    expect(canvas.parentElement?.className).toContain("writingCanvasSurface");
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceNarrow" />);
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="copyWithModel" />);
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="freeWrite" />);
    act(() => animation.flush());

    expect(context).toHaveBeenCalled();
    animation.restore();
  });

  it("active pointerだけを取り込み、coalesced eventで1筆を確定する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} />);
    const canvas = getByRole("application");
    Object.defineProperty(canvas, "getBoundingClientRect", { value: () => new DOMRect(10, 20, 200, 200) });
    const capture = vi.fn();
    const release = vi.fn();
    Object.assign(canvas, { setPointerCapture: capture, releasePointerCapture: release });

    fireEvent(canvas, pointEvent("pointerdown", 1, 30, 40));
    fireEvent(canvas, pointEvent("pointermove", 2, 60, 80));
    const move = pointEvent("pointermove", 1, 70, 80) as Event & { getCoalescedEvents: () => Event[] };
    move.getCoalescedEvents = () => [pointEvent("pointermove", 1, 50, 60), move];
    fireEvent(canvas, move);
    fireEvent(canvas, pointEvent("pointerup", 1, 90, 100));
    act(() => animation.flush());

    expect(capture).toHaveBeenCalledWith(1);
    expect(release).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toEqual([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4]]);
    animation.restore();
  });

  it("cancelした未完strokeを破棄し、disabledではページ操作を抑止しない", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const { getByRole, rerender } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} />);
    const canvas = getByRole("application");

    fireEvent(canvas, pointEvent("pointerdown", 3, 20, 20));
    fireEvent(canvas, pointEvent("pointermove", 3, 30, 30));
    fireEvent(canvas, pointEvent("pointercancel", 3, 30, 30));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" disabled />);
    const blocked = pointEvent("pointerdown", 4, 20, 20);
    fireEvent(canvas, blocked);
    expect(blocked.defaultPrevented).toBe(false);
    animation.restore();
  });

  it("CSS寸法とDPR backing storeを分離し、resize後も書いたstrokeを保持する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const originalObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverMock });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="freeWrite" />);
    const canvas = getByRole("application") as HTMLCanvasElement;
    Object.defineProperty(canvas.parentElement!, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 120, 100) });
    act(() => ResizeObserverMock.instances[0].trigger(canvas.parentElement!));
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(200);
    fireEvent(canvas, pointEvent("pointerdown", 8, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 8, 30, 30));
    act(() => ResizeObserverMock.instances[0].trigger(canvas.parentElement!));
    act(() => animation.flush());
    expect(canvas.width).toBe(240);
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalObserver });
    animation.restore();
  });

  it("30fpsへbatchし、予算超過のframeだけbounded markerへ記録する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const mark = vi.spyOn(performance, "mark");
    let performanceNowCalls = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => {
      performanceNowCalls += 1;
      return performanceNowCalls % 2 === 1 ? 0 : 100;
    });
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />);
    const canvas = getByRole("application");
    fireEvent(canvas, pointEvent("pointerdown", 9, 10, 10));
    fireEvent(canvas, pointEvent("pointermove", 9, 20, 20));
    fireEvent(canvas, pointEvent("pointermove", 9, 30, 30));
    act(() => animation.flush(34));

    expect(mark).toHaveBeenCalledWith("writing-frame-over-budget");
    now.mockRestore();
    animation.restore();
  });

  it("advanceTimeを安全に登録・復元し、無効な時間を無視する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const previous = vi.fn();
    window.advanceTime = previous;
    const first = render(
      <>
        <WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />
        <WritingCanvas template={loadStrokeTemplate("い")} mode="traceNarrow" />
      </>,
    );
    const hook = window.advanceTime;
    expect(hook).not.toBe(previous);
    expect(() => act(() => hook?.(120))).not.toThrow();
    expect(() => act(() => hook?.(Number.NaN))).not.toThrow();
    expect(() => act(() => hook?.(-1))).not.toThrow();
    first.unmount();
    expect(window.advanceTime).toBe(previous);
    animation.restore();
  });
});
