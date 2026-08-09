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
function installAnimationFrame(): { flush: (time?: number) => void; currentTime: () => number; restore: () => void } {
  const callbacks = new Map<number, FrameRequestCallback>();
  let identifier = 0;
  let currentTime = 0;
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
      currentTime = time;
      const current = [...callbacks.values()];
      callbacks.clear();
      current.forEach((callback) => callback(time));
    },
    currentTime: (): number => currentTime,
    restore(): void {
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

/** RAFの時刻で実描画時刻を採取するCanvas contextを設置する。 */
function installMeasuredCanvasContext(currentTime: () => number): { readonly paintTimes: number[]; readonly restore: () => void } {
  const paintTimes: number[] = [];
  const context = {
    clearRect: vi.fn(() => paintTimes.push(currentTime())), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    setTransform: vi.fn(), lineCap: "round", lineJoin: "round", strokeStyle: "", fillStyle: "", lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  return { paintTimes, restore: (): void => spy.mockRestore() };
}

/** 高refresh rateのframe時刻を順に流す。 */
function flushFrames(animation: ReturnType<typeof installAnimationFrame>, timestamps: readonly number[]): void {
  act(() => timestamps.forEach((timestamp) => animation.flush(timestamp)));
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

  it("modeに合う書字面名を出し、明示labelを優先する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const { getByRole, rerender } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />);

    expect(getByRole("application")).toHaveAccessibleName("あ を なぞろう");
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceNarrow" />);
    expect(getByRole("application")).toHaveAccessibleName("あ を なぞろう");
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="copyWithModel" />);
    expect(getByRole("application")).toHaveAccessibleName("おてほんを みて あ を かこう");
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="freeWrite" ariaLabel="あの じゆうれんしゅう" />);
    expect(getByRole("application")).toHaveAccessibleName("あの じゆうれんしゅう");
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
    const observerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
    const dprDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    try {
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
    } finally {
      if (observerDescriptor) Object.defineProperty(globalThis, "ResizeObserver", observerDescriptor);
      else Reflect.deleteProperty(globalThis, "ResizeObserver");
      if (dprDescriptor) Object.defineProperty(window, "devicePixelRatio", dprDescriptor);
      else Reflect.deleteProperty(window, "devicePixelRatio");
      animation.restore();
    }
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

  it("capture例外とlost captureで未完strokeを破棄し、次のpointerで復帰する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} />);
    const canvas = getByRole("application");
    Object.assign(canvas, { setPointerCapture: vi.fn(() => { throw new Error("capture unavailable"); }) });

    fireEvent(canvas, pointEvent("pointerdown", 10, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 10, 30, 30));
    expect(onChange).not.toHaveBeenCalled();
    Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    fireEvent(canvas, pointEvent("pointerdown", 11, 10, 10));
    fireEvent(canvas, pointEvent("lostpointercapture", 11, 20, 20));
    fireEvent(canvas, pointEvent("pointerup", 11, 30, 30));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(canvas, pointEvent("pointerdown", 12, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 12, 30, 30));
    expect(onChange).toHaveBeenCalledTimes(1);
    animation.restore();
  });

  it("release captureの例外後もstrokeを確定し、次のpointerを受け取る", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} />);
    const canvas = getByRole("application");
    Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(() => { throw new Error("release unavailable"); }) });

    fireEvent(canvas, pointEvent("pointerdown", 13, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 13, 30, 30));
    fireEvent(canvas, pointEvent("pointerdown", 14, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 14, 30, 30));
    expect(onChange).toHaveBeenCalledTimes(2);
    animation.restore();
  });

  it("正常pointerup後のlost captureでは確定strokeと通知を保持する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const onAttempt = vi.fn();
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} onAttempt={onAttempt} />);
    const canvas = getByRole("application");
    Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });

    fireEvent(canvas, pointEvent("pointerdown", 15, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 15, 30, 30));
    fireEvent(canvas, pointEvent("lostpointercapture", 15, 30, 30));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    animation.restore();
  });

  it("120Hzと144Hzでも30fpsを維持し、pending pointを次の描画で失わない", () => {
    const context = installCanvasContext();
    const animation = installAnimationFrame();
    const { getByRole } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />);
    const canvas = getByRole("application");
    Object.defineProperty(canvas, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 100, 100) });
    Object.defineProperty(canvas.parentElement!, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 100, 100) });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames(animation, [0]);
    fireEvent(canvas, pointEvent("pointerdown", 15, 10, 10));
    fireEvent(canvas, pointEvent("pointermove", 15, 30, 30));
    flushFrames(animation, [8.333, 16.667, 25, 33.333]);
    expect(context.mock.results[0].value.clearRect).toHaveBeenCalledTimes(2);
    fireEvent(canvas, pointEvent("pointermove", 15, 60, 60));
    flushFrames(animation, [40.278, 47.222, 54.167, 61.111, 68.056]);
    expect(context.mock.results[0].value.clearRect).toHaveBeenCalledTimes(3);
    expect(context.mock.results[0].value.lineTo).toHaveBeenCalledWith(60, 60);
    animation.restore();
  });

  it.each([75, 120, 144, 165])("%iHzの連続入力を約30fpsで描き、50ms未満に応答する", (refreshRate) => {
    const animation = installAnimationFrame();
    const measured = installMeasuredCanvasContext(animation.currentTime);
    const { getByRole, unmount } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" />);
    const canvas = getByRole("application");
    Object.defineProperty(canvas, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 100, 100) });
    Object.defineProperty(canvas.parentElement!, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 100, 100) });
    act(() => window.dispatchEvent(new Event("resize")));
    flushFrames(animation, [0]);
    measured.paintTimes.length = 0;
    fireEvent(canvas, pointEvent("pointerdown", 30, 10, 10));
    const interval = 1000 / refreshRate;
    for (let time = interval; time <= 1000; time += interval) {
      fireEvent(canvas, pointEvent("pointermove", 30, Math.min(90, time / 12), Math.min(90, time / 12)));
      flushFrames(animation, [time]);
    }

    expect(measured.paintTimes.length).toBeGreaterThanOrEqual(29);
    expect(measured.paintTimes.length).toBeLessThanOrEqual(31);
    expect(measured.paintTimes[0]).toBeLessThan(50);
    const gaps = measured.paintTimes.slice(1).map((time, index) => time - measured.paintTimes[index]);
    expect(Math.max(...gaps)).toBeLessThan(50);
    expect(measured.paintTimes.at(-1)! - 1000).toBeLessThanOrEqual(0);
    unmount();
    measured.restore();
    animation.restore();
  });

  it("stage/template/resetKeyの変更で筆跡を引き継がず、同じstageのrerenderでは保持する", () => {
    installCanvasContext();
    const animation = installAnimationFrame();
    const onChange = vi.fn();
    const { getByRole, rerender } = render(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} />);
    const canvas = getByRole("application");
    fireEvent(canvas, pointEvent("pointerdown", 16, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 16, 30, 30));
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceWide" onChange={onChange} ariaLabel="あ" />);
    fireEvent(canvas, pointEvent("pointerdown", 17, 40, 40));
    fireEvent(canvas, pointEvent("pointerup", 17, 50, 50));
    expect(onChange.mock.calls[1][0]).toHaveLength(2);
    rerender(<WritingCanvas template={loadStrokeTemplate("あ")} mode="traceNarrow" onChange={onChange} />);
    fireEvent(canvas, pointEvent("pointerdown", 18, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 18, 20, 20));
    expect(onChange.mock.calls[2][0]).toHaveLength(1);
    rerender(<WritingCanvas template={loadStrokeTemplate("い")} mode="copyWithModel" onChange={onChange} resetKey="next" />);
    expect(canvas.parentElement).toHaveAttribute("data-requires-external-model", "true");
    fireEvent(canvas, pointEvent("pointerdown", 19, 10, 10));
    rerender(<WritingCanvas template={loadStrokeTemplate("い")} mode="freeWrite" onChange={onChange} resetKey="next" />);
    fireEvent(canvas, pointEvent("pointerdown", 20, 10, 10));
    fireEvent(canvas, pointEvent("pointerup", 20, 20, 20));
    expect(onChange.mock.calls[3][0]).toHaveLength(1);
    animation.restore();
  });
});
