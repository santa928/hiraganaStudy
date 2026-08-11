import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

/** 保護者画面を誤って開かないための長押し入口。 */
export interface ParentGateProps {
  readonly onOpen: () => void;
  readonly holdDurationMs?: number;
}

/** pointerとkeyboardのいずれでも、連続保持を安全に判定する。 */
export function ParentGate({ onOpen, holdDurationMs = 2000 }: ParentGateProps): React.JSX.Element {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const openedRef = useRef(false);
  const mountedRef = useRef(true);
  const clear = useCallback((pointerId?: number, updateVisual = true): void => {
    if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return;
    activeRef.current = false;
    activePointerIdRef.current = null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (updateVisual) setHolding(false);
  }, []);
  const start = useCallback((pointerId?: number): void => {
    clear();
    activePointerIdRef.current = pointerId ?? null;
    activeRef.current = true;
    openedRef.current = false;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current || !activeRef.current || openedRef.current) return;
      openedRef.current = true;
      activeRef.current = false;
      activePointerIdRef.current = null;
      setHolding(false);
      onOpen();
    }, holdDurationMs);
  }, [clear, holdDurationMs, onOpen]);
  useEffect(() => {
    mountedRef.current = true;
    const clearOnDocumentEnd = (event: PointerEvent): void => clear(event.pointerId);
    document.addEventListener("pointerup", clearOnDocumentEnd);
    document.addEventListener("pointercancel", clearOnDocumentEnd);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("pointerup", clearOnDocumentEnd);
      document.removeEventListener("pointercancel", clearOnDocumentEnd);
      clear(undefined, false);
    };
  }, [clear]);

  /** 捕捉中でも座標で押下領域外へのdragを確実に取り消す。 */
  const cancelOutsidePointer = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) clear(event.pointerId);
  };

  const holdStyle = { "--parent-hold-duration": `${holdDurationMs}ms` } as CSSProperties;

  return <button className="parentGate" type="button" aria-label="おとなの せってい" aria-live="polite" data-holding={holding} style={holdStyle} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => {
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* capture非対応でも長押し判定を続ける。 */ }
    start(event.pointerId);
  }} onPointerMove={cancelOutsidePointer} onPointerUp={(event) => clear(event.pointerId)} onPointerCancel={(event) => clear(event.pointerId)} onLostPointerCapture={(event) => clear(event.pointerId)} onPointerLeave={cancelOutsidePointer} onKeyDown={(event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) start();
  }} onKeyUp={(event) => {
    if (event.key === "Enter" || event.key === " ") clear();
  }}>
    <span className="parentGate__label">おとなの せってい</span>
    <span className="parentGate__hint">{holding ? "そのまま おしてね" : "2びょう ながおし"}</span>
  </button>;
}
