/** 定義済みの静的効果音・BGM名。 */
export type SoundEffectName = "tap" | "success" | "sprout";

/** BGM・効果音・読み上げを独立して制御する設定値。 */
export interface SoundSettings {
  readonly effects: boolean;
  readonly music: boolean;
  readonly speech: boolean;
}

/** Web Audio APIのgain最小契約。 */
export interface GainNodeLike {
  readonly gain: { value: number };
  connect(destination: unknown): void;
}

/** Web Audio APIのsource最小契約。 */
export interface AudioBufferSourceLike {
  buffer: AudioBuffer | null;
  loop: boolean;
  onended: (() => void) | null;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

/** SoundEffectsが必要とするAudioContextの最小契約。 */
export interface AudioContextLike {
  readonly destination: unknown;
  readonly state?: AudioContextState;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  resume?(): Promise<void>;
}

/** SoundEffectsへ注入できるブラウザ依存とアセット起点。 */
export interface SoundEffectsOptions {
  readonly audioContext?: AudioContextLike | null;
  readonly fetchAudio?: ((url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>) | null;
  readonly baseUrl?: string;
}

const ASSET_PATHS: Readonly<Record<SoundEffectName | "garden-loop", string>> = {
  tap: "assets/sfx/tap.wav",
  success: "assets/sfx/success.wav",
  sprout: "assets/sfx/sprout.wav",
  "garden-loop": "assets/sfx/garden-loop.wav",
};

const DEFAULT_SETTINGS: SoundSettings = { effects: true, music: false, speech: true };

/**
 * 同梱WAVだけを再生するWeb Audioアダプター。
 * AudioContextやファイル取得に失敗しても、視覚のみの学習を中断しない。
 */
export class SoundEffects {
  private readonly context: AudioContextLike | null;
  private readonly effectsGain: GainNodeLike | null;
  private readonly musicGain: GainNodeLike | null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private settings: SoundSettings = DEFAULT_SETTINGS;
  private gardenSource: AudioBufferSourceLike | null = null;
  private gardenStart: Promise<void> | null = null;
  private gardenGeneration = 0;

  public constructor(private readonly options: SoundEffectsOptions = {}) {
    this.context = options.audioContext === undefined ? createBrowserAudioContext() : options.audioContext;
    if (!this.context) {
      this.effectsGain = null;
      this.musicGain = null;
      return;
    }
    try {
      this.effectsGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.effectsGain.connect(this.context.destination);
      this.musicGain.connect(this.context.destination);
    } catch {
      this.context = null;
      this.effectsGain = null;
      this.musicGain = null;
    }
  }

  /** 学習設定の現在値を丸ごと反映し、無効化済みBGMは停止する。 */
  public applySettings(settings: SoundSettings): void {
    this.settings = { ...settings };
    if (!settings.music) this.stopGardenLoop();
  }

  /** 現在反映済みの独立音声設定を返す。 */
  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  /** 読み上げの開始・終了に合わせ、BGMと効果音の音量を下げて復帰する。 */
  public setSpeechActive(active: boolean): void {
    const gain = active ? 0.35 : 1;
    const musicGain = active ? 0.2 : 1;
    if (this.effectsGain) this.effectsGain.gain.value = gain;
    if (this.musicGain) this.musicGain.gain.value = musicGain;
  }

  /** 指定効果音を一度だけ鳴らす。無効設定や障害時は何もしない。 */
  public async play(name: SoundEffectName): Promise<void> {
    if (!this.settings.effects) return;
    if (!await this.resumeForUserAction()) return;
    await this.playBuffer(name, this.effectsGain, false);
  }

  /** 庭のループBGMを開始する。同じBGMを重ねて開始しない。 */
  public async startGardenLoop(): Promise<void> {
    if (!this.settings.music || this.gardenSource) return;
    if (this.gardenStart) return this.gardenStart;

    const generation = this.gardenGeneration;
    const starting = this.startGardenLoopForGeneration(generation);
    this.gardenStart = starting;
    const clearInFlight = (): void => {
      if (this.gardenStart === starting) this.gardenStart = null;
    };
    void starting.then(clearInFlight, clearInFlight);
    return starting;
  }

  /** 庭のBGMを安全に停止する。 */
  public stopGardenLoop(): void {
    this.gardenGeneration += 1;
    this.gardenStart = null;
    const source = this.gardenSource;
    this.gardenSource = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // 既に停止済みのsourceでも学習を中断しない。
    }
  }

  /** 取得・decode済みのWAVを、指定gainへ接続して再生する。 */
  private async playBuffer(name: SoundEffectName | "garden-loop", gain: GainNodeLike | null, loop: boolean): Promise<AudioBufferSourceLike | null> {
    if (!this.context || !gain) return null;
    try {
      const buffer = await this.loadBuffer(name);
      if (!buffer) return null;
      return this.startBuffer(buffer, gain, loop);
    } catch {
      return null;
    }
  }

  /** URL取得とdecodeの失敗をnullへ変換してキャッシュする。 */
  private loadBuffer(name: SoundEffectName | "garden-loop"): Promise<AudioBuffer | null> {
    const url = this.assetUrl(name);
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const loading = this.decode(url).then((buffer) => {
      if (!buffer) this.buffers.delete(url);
      return buffer;
    });
    this.buffers.set(url, loading);
    return loading;
  }

  /** BGM開始要求を一世代に束ね、停止済みの非同期要求は再生しない。 */
  private async startGardenLoopForGeneration(generation: number): Promise<void> {
    if (!await this.resumeForUserAction()) return;
    const buffer = await this.loadBuffer("garden-loop");
    if (!buffer || generation !== this.gardenGeneration || !this.settings.music || this.gardenSource || !this.musicGain) return;
    const source = this.startBuffer(buffer, this.musicGain, true);
    if (!source) return;
    this.gardenSource = source;
    source.onended = () => {
      if (this.gardenSource === source) this.gardenSource = null;
    };
  }

  /** AudioBufferをsourceへ接続して再生し、失敗をnullへ変換する。 */
  private startBuffer(buffer: AudioBuffer, gain: GainNodeLike, loop: boolean): AudioBufferSourceLike | null {
    if (!this.context) return null;
    try {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.connect(gain);
      source.start();
      return source;
    } catch {
      return null;
    }
  }

  /** suspendedなAudioContextをユーザー操作開始時だけ安全に復帰する。 */
  private async resumeForUserAction(): Promise<boolean> {
    if (!this.context || this.context.state !== "suspended") return this.context !== null;
    if (!this.context.resume) return false;
    try {
      await this.context.resume();
      return true;
    } catch {
      return false;
    }
  }

  /** アセットを取得してAudioBufferへdecodeする。 */
  private async decode(url: string): Promise<AudioBuffer | null> {
    const fetchAudio = this.options.fetchAudio ?? browserFetch();
    if (!fetchAudio || !this.context) return null;
    try {
      const response = await fetchAudio(url);
      return await this.context.decodeAudioData(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** GitHub Pagesのサブパスを保持するdocument/base相対URLを組み立てる。 */
  private assetUrl(name: SoundEffectName | "garden-loop"): string {
    return new URL(ASSET_PATHS[name], this.options.baseUrl ?? browserBaseUrl()).href;
  }
}

/** 実ブラウザのAudioContextを例外なく取得する。 */
function createBrowserAudioContext(): AudioContextLike | null {
  const browserWindow = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Constructor = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  if (!Constructor) return null;
  try {
    return new Constructor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

/** 実ブラウザのfetchを、非ブラウザ環境へ漏らさず取得する。 */
function browserFetch(): ((url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>) | null {
  return typeof globalThis.fetch === "function" ? (url) => globalThis.fetch(url) : null;
}

/** document.baseURIを優先し、テストやSSRでは安全な起点を返す。 */
function browserBaseUrl(): string {
  return typeof document === "undefined" ? "http://localhost/" : document.baseURI;
}
