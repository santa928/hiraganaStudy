/** 音声案内が利用できる状態。 */
export type AudioGuideStatus = "locked" | "ready" | "visual-only";

/** 読み上げ要求ごとの、重なり制御と速度指定。 */
export interface SpeakOptions {
  readonly interrupt?: boolean;
  readonly rate?: number;
}

/**
 * 学習UIが使う音声案内の最小契約。
 *
 * `unlock` は利用者の明示操作から呼び、再生不能時も画面だけで学習を続けられるようにする。
 */
export interface AudioGuide {
  unlock(): Promise<Exclude<AudioGuideStatus, "locked">>;
  speak(message: string, options?: SpeakOptions): Promise<void>;
  cancel(): void;
  getStatus(): AudioGuideStatus;
}
