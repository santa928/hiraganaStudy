import { useCallback, useEffect, useRef } from "react";

/** 保護者画面を誤って開かないための長押し入口。 */
export interface ParentGateProps {
  readonly onOpen: () => void;
  readonly holdDurationMs?: number;
}

/** pointerとkeyboardのいずれでも、連続保持を安全に判定する。 */
export function ParentGate({ onOpen, holdDurationMs = 2000 }: ParentGateProps): React.JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const openedRef = useRef(false);
  const mountedRef = useRef(true);
  const clear = useCallback((): void => {
    activeRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const start = useCallback((): void => {
    clear();
    activeRef.current = true;
    openedRef.current = false;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current || !activeRef.current || openedRef.current) return;
      openedRef.current = true;
      activeRef.current = false;
      onOpen();
    }, holdDurationMs);
  }, [clear, holdDurationMs, onOpen]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clear();
    };
  }, [clear]);

  return <button className="parentGate" type="button" aria-label="おとなの せってい" onPointerDown={(event) => {
    event.preventDefault();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* capture非対応でも長押し判定を続ける。 */ }
    start();
  }} onPointerUp={clear} onPointerCancel={clear} onLostPointerCapture={clear} onPointerLeave={clear} onMouseDown={start} onMouseUp={clear} onMouseLeave={clear} onKeyDown={(event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) start();
  }} onKeyUp={(event) => {
    if (event.key === "Enter" || event.key === " ") clear();
  }}>おとなの せってい</button>;
}
