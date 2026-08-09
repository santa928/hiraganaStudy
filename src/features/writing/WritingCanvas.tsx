import { useCallback, useEffect, useRef, useState } from "react";

import type { StrokeTemplate } from "./data/types";
import { clamp, type WritingPoint, type WritingStrokes } from "./geometry";
import { scoreWriting, type WritingScore } from "./scoreStroke";
import "./WritingCanvas.css";

/** 一文字内で補助を減らしていく書字面の種類。 */
export type WritingMode = "traceWide" | "traceNarrow" | "copyWithModel" | "freeWrite";

/** 一筆を確定した時点で親へ渡す、表示しない内部の緩やかな結果。 */
export interface WritingAttempt {
  readonly strokes: WritingStrokes;
  readonly score: WritingScore;
}

/** Task 9以降が学習段階へ接続するための、書字面の安定した最小契約。 */
export interface WritingCanvasProps {
  /** 表示と緩やかな比較に使う、対象文字の生成済み書き順。 */
  readonly template: StrokeTemplate;
  /** 太い道、細い道、外部見本つき白紙、補助なし白紙を切り替える。 */
  readonly mode: WritingMode;
  /** 同じ文字・modeを明示的に最初から書き直すための識別子。 */
  readonly resetKey?: string | number;
  /** 操作不可時はPointer Eventを奪わず、表示だけを保持する。 */
  readonly disabled?: boolean;
  /** 確定済みstrokeだけを正規化座標で通知する。 */
  readonly onChange?: (strokes: WritingStrokes) => void;
  /** 確定ごとの補助段階を、子どもへ表示せず親の進行制御へ通知する。 */
  readonly onAttempt?: (attempt: WritingAttempt) => void;
  /** 読み上げ環境向けの書字面名。省略時は対象文字から生成する。 */
  readonly ariaLabel?: string;
}

declare global {
  interface Window {
    advanceTime?: (milliseconds: number) => void;
  }
}

const FRAME_INTERVAL = 1000 / 30;
const DEADLINE_TOLERANCE_RATIO = 0.501;
const MAX_DPR = 3;
const PERFORMANCE_MARK_LIMIT = 32;
const advanceListeners = new Map<symbol, (milliseconds: number) => void>();
let savedAdvanceTime: Window["advanceTime"] | undefined;
let hasAdvanceHook = false;
let performanceMarkCount = 0;

/** すべてのmountに同じ安全なテスト時計を接続し、最後のunmountで元へ戻す。 */
function registerAdvanceTime(listener: (milliseconds: number) => void): () => void {
  const token = Symbol("writing-clock");
  if (!hasAdvanceHook) {
    savedAdvanceTime = window.advanceTime;
    window.advanceTime = (milliseconds: number): void => {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
      for (const callback of advanceListeners.values()) callback(milliseconds);
    };
    hasAdvanceHook = true;
  }
  advanceListeners.set(token, listener);

  return () => {
    advanceListeners.delete(token);
    if (advanceListeners.size !== 0 || !hasAdvanceHook) return;
    window.advanceTime = savedAdvanceTime;
    savedAdvanceTime = undefined;
    hasAdvanceHook = false;
  };
}

/** CSSピクセル上のPointer座標を、保存・再描画に強い0..1座標へ変換する。 */
function toNormalizedPoint(canvas: HTMLCanvasElement, event: PointerEvent): WritingPoint {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return [0.5, 0.5];
  return [
    clamp((event.clientX - bounds.left) / bounds.width),
    clamp((event.clientY - bounds.top) / bounds.height),
  ];
}

/** 同じ座標の連続点を増やさず、筆跡を小さく保つ。 */
function appendPoint(points: WritingPoint[], point: WritingPoint): void {
  const previous = points.at(-1);
  if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point);
}

/** 端末の異常値を避けた、Canvas backing store用のDPRを返す。 */
function canvasDpr(): number {
  const dpr = window.devicePixelRatio;
  return Number.isFinite(dpr) && dpr > 0 ? Math.min(MAX_DPR, Math.max(1, dpr)) : 1;
}

/** 現在の書字段階と矛盾しない、読み上げ環境向けの標準書字面名を返す。 */
function defaultAriaLabel(character: string, mode: WritingMode): string {
  if (mode === "copyWithModel") return `おてほんを みて ${character} を かこう`;
  if (mode === "freeWrite") return `じぶんで ${character} を かこう`;
  return `${character} を なぞろう`;
}

/** primaryの指・ペン、または左マウスボタンだけを書字開始として受け入れる。 */
function canStartWriting(event: React.PointerEvent<HTMLCanvasElement>): boolean {
  return event.isPrimary === true && (event.pointerType !== "mouse" || event.button === 0);
}

/** Pointer captureの開始に失敗した場合でも、書字面を操作不能状態にしない。 */
function trySetPointerCapture(canvas: HTMLCanvasElement, pointerId: number): boolean {
  if (typeof canvas.setPointerCapture !== "function") return true;
  try {
    canvas.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/** releaseの端末例外を、確定済みstrokeの通知まで伝播させない。 */
function tryReleasePointerCapture(canvas: HTMLCanvasElement, pointerId: number): void {
  if (typeof canvas.releasePointerCapture !== "function") return;
  try {
    canvas.releasePointerCapture(pointerId);
  } catch {
    // Pointer Eventの終了済みcaptureでは例外になりうるため、確定処理を継続する。
  }
}

/** Canvas上のstrokeを丸端・丸継ぎ手で描く。 */
function drawStroke(context: CanvasRenderingContext2D, points: readonly WritingPoint[], width: number, height: number, lineWidth: number, color: string): void {
  if (points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0][0] * width, points[0][1] * height);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0] * width, points[index][1] * height);
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

/** modeごとの庭らしい補助線を描く。 */
function drawGuide(context: CanvasRenderingContext2D, template: StrokeTemplate, mode: WritingMode, width: number, height: number, guideTime: number): void {
  if (mode !== "traceWide" && mode !== "traceNarrow") return;
  const progress = 0.88 + (Math.sin(guideTime / 420) * 0.06);
  const lineWidth = mode === "traceWide" ? Math.min(width, height) * 0.15 : Math.min(width, height) * 0.075;
  const color = "rgba(136, 166, 128, 0.62)";
  for (const stroke of template.strokes) {
    const limit = Math.max(1, Math.ceil(stroke.points.length * progress));
    drawStroke(context, stroke.points.slice(0, limit), width, height, lineWidth, color);
  }
}

/**
 * 指・ペン・マウスを同じ経路で受ける、クリーム紙の書字Canvasを表示する。
 *
 * 筆跡は0..1座標で保持するため、portrait/landscapeのresizeやDPR変更後も形を保つ。
 */
export function WritingCanvas({ template, mode, resetKey, disabled = false, onChange, onAttempt, ariaLabel }: WritingCanvasProps): React.JSX.Element {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<WritingPoint[][]>([]);
  const activeStrokeRef = useRef<WritingPoint[] | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number | null>(null);
  const nextPaintDeadlineRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [guideTime, setGuideTime] = useState(0);
  const [successTime, setSuccessTime] = useState(0);

  const requestDraw = useCallback((): void => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame((timestamp) => {
      frameRef.current = null;
      const previousRafTime = lastRafTimeRef.current;
      const observedFrameInterval = previousRafTime === null || timestamp <= previousRafTime
        ? FRAME_INTERVAL
        : timestamp - previousRafTime;
      lastRafTimeRef.current = timestamp;
      const deadline = nextPaintDeadlineRef.current;
      if (deadline !== null && timestamp + (observedFrameInterval * DEADLINE_TOLERANCE_RATIO) < deadline) {
        requestDraw();
        return;
      }
      let nextDeadline = (deadline ?? timestamp) + FRAME_INTERVAL;
      if (nextDeadline <= timestamp) {
        const missedIntervals = Math.floor((timestamp - nextDeadline) / FRAME_INTERVAL) + 1;
        nextDeadline += missedIntervals * FRAME_INTERVAL;
      }
      nextPaintDeadlineRef.current = nextDeadline;
      const start = performance.now();
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const { width, height } = sizeRef.current;
        context.setTransform(canvasDpr(), 0, 0, canvasDpr(), 0, 0);
        context.clearRect(0, 0, width, height);
        drawGuide(context, template, mode, width, height, guideTime);
        for (const stroke of committedRef.current) drawStroke(context, stroke, width, height, Math.min(width, height) * 0.045, "#263f73");
        if (activeStrokeRef.current) drawStroke(context, activeStrokeRef.current, width, height, Math.min(width, height) * 0.045, "#263f73");
      }
      if (performance.now() - start > FRAME_INTERVAL && performanceMarkCount < PERFORMANCE_MARK_LIMIT) {
        performance.mark("writing-frame-over-budget");
        performanceMarkCount += 1;
      }
    });
  }, [guideTime, mode, template]);

  const resizeCanvas = useCallback((): void => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const bounds = surface.getBoundingClientRect();
    const width = Math.max(0, Math.round(bounds.width));
    const height = Math.max(0, Math.round(bounds.height));
    const dpr = canvasDpr();
    sizeRef.current = { width, height };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    requestDraw();
  }, [requestDraw]);

  useEffect(() => {
    resizeCanvas();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resizeCanvas);
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("fullscreenchange", resizeCanvas);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("fullscreenchange", resizeCanvas);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      lastRafTimeRef.current = null;
      nextPaintDeadlineRef.current = null;
    };
  }, [resizeCanvas]);

  useEffect(() => registerAdvanceTime((milliseconds) => {
    setGuideTime((value) => value + milliseconds);
    setSuccessTime((value) => Math.max(0, value - milliseconds));
    requestDraw();
  }), [requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [guideTime, mode, requestDraw, successTime, template]);

  useEffect(() => {
    const activePointerId = activePointerIdRef.current;
    if (activePointerId !== null && canvasRef.current) tryReleasePointerCapture(canvasRef.current, activePointerId);
    committedRef.current = [];
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    lastRafTimeRef.current = null;
    nextPaintDeadlineRef.current = null;
    setSuccessTime(0);
    requestDraw();
  // template object identityではなく、教材として異なる文字だけをreset契約にする。
  }, [template.character, mode, resetKey]);

  /** coalesced eventsを含む現在pointerの位置をactive strokeへ追加する。 */
  const addPointerEvents = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    const nativeEvent = event.nativeEvent;
    const events = typeof nativeEvent.getCoalescedEvents === "function" ? nativeEvent.getCoalescedEvents() : [nativeEvent];
    const canvas = event.currentTarget;
    for (const coalesced of events) appendPoint(activeStrokeRef.current!, toNormalizedPoint(canvas, coalesced));
  }, []);

  /** pointerdownで一本の入力所有権を得る。 */
  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (disabled || activePointerIdRef.current !== null || !canStartWriting(event)) return;
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    activeStrokeRef.current = [];
    if (!trySetPointerCapture(event.currentTarget, event.pointerId)) {
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      requestDraw();
      return;
    }
    addPointerEvents(event);
    requestDraw();
  }, [addPointerEvents, disabled, requestDraw]);

  /** 現在所有するpointer以外を無視し、ページスクロールを抑止する。 */
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (disabled || activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return;
    event.preventDefault();
    addPointerEvents(event);
    requestDraw();
  }, [addPointerEvents, disabled, requestDraw]);

  /** strokeを確定し、親へのデータ通知と緩やかな補助判定を行う。 */
  const finishStroke = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (disabled || activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return;
    event.preventDefault();
    addPointerEvents(event);
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    tryReleasePointerCapture(event.currentTarget, event.pointerId);
    committedRef.current = [...committedRef.current, stroke];
    const strokes = committedRef.current.map((current) => current.map(([x, y]) => [x, y] as const));
    onChange?.(strokes);
    const score = scoreWriting(strokes, template);
    onAttempt?.({ strokes, score });
    if (score.guide === "independent") setSuccessTime(900);
    requestDraw();
  }, [addPointerEvents, disabled, onAttempt, onChange, requestDraw, template]);

  /** cancelでは未完成strokeを保存・通知せず捨てる。 */
  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    tryReleasePointerCapture(event.currentTarget, event.pointerId);
    requestDraw();
  }, [requestDraw]);

  /** ブラウザ都合でcaptureを失った筆は確定せず破棄する。 */
  const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    requestDraw();
  }, [requestDraw]);

  return (
    <div
      ref={surfaceRef}
      className={`writingCanvasSurface writingCanvasSurface--${mode}`}
      data-success={successTime > 0 ? "sprout" : "rest"}
      data-guide-time={guideTime}
      data-requires-external-model={mode === "copyWithModel" ? "true" : undefined}
    >
      <canvas
        ref={canvasRef}
        className="writingCanvas"
        role="application"
        aria-label={ariaLabel ?? defaultAriaLabel(template.character, mode)}
        aria-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
      />
    </div>
  );
}
