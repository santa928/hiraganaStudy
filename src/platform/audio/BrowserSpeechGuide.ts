import type { AudioGuide, AudioGuideStatus, SpeakOptions } from "./AudioGuide";

/** Web Speech APIから必要な日本語音声の最小表現。 */
export interface SpeechVoiceLike {
  readonly lang: string;
  readonly default: boolean;
}

/** Web Speech APIの発話オブジェクトへ閉じ込める最小契約。 */
export interface SpeechUtteranceLike {
  lang: string;
  rate: number;
  volume: number;
  voice: SpeechVoiceLike | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** `speechSynthesis` をテスト可能にする最小契約。 */
export interface SpeechSynthesisLike {
  getVoices(): readonly SpeechVoiceLike[];
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  addEventListener?(type: "voiceschanged", listener: () => void): void;
  removeEventListener?(type: "voiceschanged", listener: () => void): void;
}

/** BrowserSpeechGuideへ注入できるブラウザ依存と動作設定。 */
export interface BrowserSpeechGuideOptions {
  readonly speechSynthesis?: SpeechSynthesisLike | null;
  readonly createUtterance?: ((text: string) => SpeechUtteranceLike) | null;
  readonly voiceWaitMs?: number;
  readonly isSpeechEnabled?: () => boolean;
  readonly onSpeakingChange?: (speaking: boolean) => void;
}

interface ActiveSpeech {
  readonly id: number;
  readonly resolve: () => void;
}

const DEFAULT_RATE = 0.82;
const MIN_RATE = 0.1;
const MAX_RATE = 2;
const DEFAULT_VOICE_WAIT_MS = 1_000;

/**
 * Web Speech APIを子ども向けの短い日本語案内へ変換するアダプター。
 * ブラウザAPIがない端末では例外を出さず、visual-only状態へ劣化する。
 */
export class BrowserSpeechGuide implements AudioGuide {
  private status: AudioGuideStatus = "locked";
  private selectedVoice: SpeechVoiceLike | null = null;
  private unlockPromise: Promise<Exclude<AudioGuideStatus, "locked">> | null = null;
  private activeSpeech: ActiveSpeech | null = null;
  private speechId = 0;

  public constructor(private readonly options: BrowserSpeechGuideOptions = {}) {}

  /** 利用者の明示操作後に日本語音声を選択し、利用状態を返す。 */
  public unlock(): Promise<Exclude<AudioGuideStatus, "locked">> {
    if (this.status === "ready") return Promise.resolve(this.status);
    if (this.unlockPromise) return this.unlockPromise;

    // 日本語音声が後からインストール・読み込みされる端末では再試行を許可する。
    this.status = "locked";
    this.selectedVoice = null;

    const speech = this.options.speechSynthesis ?? browserSpeechSynthesis();
    const createUtterance = this.options.createUtterance ?? browserUtteranceFactory();
    if (!speech || !createUtterance) {
      this.status = "visual-only";
      return Promise.resolve(this.status);
    }

    const voice = this.selectVoice(speech);
    if (voice) {
      this.selectedVoice = voice;
      this.status = "ready";
      return Promise.resolve(this.status);
    }

    this.unlockPromise = new Promise<Exclude<AudioGuideStatus, "locked">>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (nextStatus: Exclude<AudioGuideStatus, "locked">, nextVoice: SpeechVoiceLike | null): void => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        speech.removeEventListener?.("voiceschanged", onVoicesChanged);
        this.selectedVoice = nextVoice;
        this.status = nextStatus;
        this.unlockPromise = null;
        resolve(nextStatus);
      };
      const onVoicesChanged = (): void => {
        const changedVoice = this.selectVoice(speech);
        if (changedVoice) finish("ready", changedVoice);
      };

      speech.addEventListener?.("voiceschanged", onVoicesChanged);
      timer = setTimeout(() => finish("visual-only", null), this.options.voiceWaitMs ?? DEFAULT_VOICE_WAIT_MS);
      onVoicesChanged();
    });
    return this.unlockPromise;
  }

  /** 指定文を一つだけ読み上げる。無効・未準備時は画面案内だけを継続する。 */
  public speak(message: string, options: SpeakOptions = {}): Promise<void> {
    if (this.status !== "ready" || this.options.isSpeechEnabled?.() === false || message.trim() === "") {
      return Promise.resolve();
    }
    const speech = this.options.speechSynthesis ?? browserSpeechSynthesis();
    const createUtterance = this.options.createUtterance ?? browserUtteranceFactory();
    if (!speech || !createUtterance || !this.selectedVoice) return Promise.resolve();

    if (this.activeSpeech) {
      if (!options.interrupt) return Promise.resolve();
      this.finishActiveSpeech();
      safely(() => speech.cancel());
    }

    let utterance: SpeechUtteranceLike;
    try {
      utterance = createUtterance(message);
    } catch {
      return Promise.resolve();
    }
    utterance.lang = "ja-JP";
    utterance.rate = clampRate(options.rate ?? DEFAULT_RATE);
    utterance.volume = 1;
    utterance.voice = this.selectedVoice;

    return new Promise<void>((resolve) => {
      const id = ++this.speechId;
      this.activeSpeech = { id, resolve };
      utterance.onend = () => this.finishSpeech(id);
      utterance.onerror = () => this.finishSpeech(id);
      this.options.onSpeakingChange?.(true);
      try {
        speech.speak(utterance);
      } catch {
        this.finishSpeech(id);
      }
    });
  }

  /** 画面遷移などで進行中の読み上げを確実に中止する。 */
  public cancel(): void {
    this.finishActiveSpeech();
    const speech = this.options.speechSynthesis ?? browserSpeechSynthesis();
    if (speech) safely(() => speech.cancel());
  }

  /** 現在の再生可否を保護者画面やUIへ公開する。 */
  public getStatus(): AudioGuideStatus {
    return this.status;
  }

  /** 利用可能な音声から日本語を優先して一つ選ぶ。 */
  private selectVoice(speech: SpeechSynthesisLike): SpeechVoiceLike | null {
    let voices: readonly SpeechVoiceLike[];
    try {
      voices = speech.getVoices();
    } catch {
      return null;
    }
    if (voices.length === 0) return null;
    return voices.find((voice) => voice.lang.toLowerCase() === "ja-jp")
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("ja"))
      ?? voices.find((voice) => voice.default)
      ?? null;
  }

  /** 現在の発話を解決し、ducking通知も一回だけ戻す。 */
  private finishActiveSpeech(): void {
    const active = this.activeSpeech;
    if (!active) return;
    this.activeSpeech = null;
    this.options.onSpeakingChange?.(false);
    active.resolve();
  }

  /** stale eventを無視して指定idの発話だけを終える。 */
  private finishSpeech(id: number): void {
    if (this.activeSpeech?.id !== id) return;
    this.finishActiveSpeech();
  }
}

/** 発話速度をWeb Speech APIで安全な範囲へ丸める。 */
function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/** 任意のブラウザ処理を学習画面の例外にしない。 */
function safely(action: () => void): void {
  try {
    action();
  } catch {
    // 読み上げ不可でも視覚的な案内を継続する。
  }
}

/** 実ブラウザのSpeechSynthesisを、非ブラウザ環境へ漏らさず取得する。 */
function browserSpeechSynthesis(): SpeechSynthesisLike | null {
  const candidate = globalThis.speechSynthesis;
  return candidate ? (candidate as unknown as SpeechSynthesisLike) : null;
}

/** 実ブラウザのSpeechSynthesisUtterance生成器を安全に取得する。 */
function browserUtteranceFactory(): ((text: string) => SpeechUtteranceLike) | null {
  const Constructor = globalThis.SpeechSynthesisUtterance;
  return Constructor ? (text) => new Constructor(text) as unknown as SpeechUtteranceLike : null;
}
