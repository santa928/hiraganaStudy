import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserSpeechGuide, type SpeechSynthesisLike, type SpeechUtteranceLike, type SpeechVoiceLike } from "./BrowserSpeechGuide";

class FakeUtterance implements SpeechUtteranceLike {
  public lang = "";
  public rate = 1;
  public volume = 1;
  public voice: SpeechVoiceLike | null = null;
  public onend: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  public constructor(public readonly text: string) {}
}

class FakeSpeechSynthesis implements SpeechSynthesisLike {
  public readonly spoken: FakeUtterance[] = [];
  public readonly cancel = vi.fn();
  public voices: readonly SpeechVoiceLike[] = [];
  private readonly listeners = new Set<() => void>();

  public getVoices(): readonly SpeechVoiceLike[] {
    return this.voices;
  }

  public speak(utterance: SpeechUtteranceLike): void {
    this.spoken.push(utterance as FakeUtterance);
  }

  public addEventListener(type: "voiceschanged", listener: () => void): void {
    if (type === "voiceschanged") this.listeners.add(listener);
  }

  public removeEventListener(type: "voiceschanged", listener: () => void): void {
    if (type === "voiceschanged") this.listeners.delete(listener);
  }

  public emitVoicesChanged(): void {
    for (const listener of this.listeners) listener();
  }

  public listenerCount(): number {
    return this.listeners.size;
  }
}

/** テスト用の音声案内を、注入済みのブラウザAPIで作る。 */
function createGuide(speech = new FakeSpeechSynthesis()): { guide: BrowserSpeechGuide; speech: FakeSpeechSynthesis } {
  return {
    guide: new BrowserSpeechGuide({
      speechSynthesis: speech,
      createUtterance: (text) => new FakeUtterance(text),
      voiceWaitMs: 20,
    }),
    speech,
  };
}

describe("BrowserSpeechGuide", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("unlockでja-JP完全一致の音声を優先して準備する", async () => {
    const { guide, speech } = createGuide();
    const fallback = { lang: "en-US", default: true };
    const prefix = { lang: "ja", default: false };
    const exact = { lang: "ja-JP", default: false };
    speech.voices = [fallback, prefix, exact];

    await expect(guide.unlock()).resolves.toBe("ready");
    const speaking = guide.speak("あ");

    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]).toMatchObject({ lang: "ja-JP", rate: 0.82, volume: 1, voice: exact });
    speech.spoken[0].onend?.();
    await expect(speaking).resolves.toBeUndefined();
  });

  it("ja-JPがなければja prefix、さらに端末defaultへフォールバックする", async () => {
    const { guide, speech } = createGuide();
    const japanese = { lang: "ja-Kana", default: false };
    const fallback = { lang: "en-US", default: true };
    speech.voices = [fallback, japanese];
    await guide.unlock();
    const japaneseSpeech = guide.speak("い");
    expect(speech.spoken[0].voice).toBe(japanese);
    speech.spoken[0].onend?.();
    await japaneseSpeech;

    const { guide: fallbackGuide, speech: fallbackSpeech } = createGuide();
    fallbackSpeech.voices = [fallback];
    await fallbackGuide.unlock();
    const fallbackSpeechPromise = fallbackGuide.speak("う");
    expect(fallbackSpeech.spoken[0].voice).toBe(fallback);
    fallbackSpeech.spoken[0].onend?.();
    await fallbackSpeechPromise;
  });

  it("日本語でもdefaultでもない音声しかなければvisual-onlyへ劣化する", async () => {
    const { guide, speech } = createGuide();
    speech.voices = [{ lang: "en-US", default: false }];

    await expect(guide.unlock()).resolves.toBe("visual-only");
    expect(guide.getStatus()).toBe("visual-only");
  });

  it("遅延したvoiceschangedで音声を選び、listenerを後始末する", async () => {
    const { guide, speech } = createGuide();
    const unlocking = guide.unlock();
    expect(speech.listenerCount()).toBe(1);
    const japanese = { lang: "ja-JP", default: true };
    speech.voices = [japanese];
    speech.emitVoicesChanged();

    await expect(unlocking).resolves.toBe("ready");
    expect(speech.listenerCount()).toBe(0);
  });

  it("音声APIまたは音声一覧が使えないとvisual-onlyへ劣化する", async () => {
    const noApi = new BrowserSpeechGuide({ speechSynthesis: null, createUtterance: null });
    await expect(noApi.unlock()).resolves.toBe("visual-only");
    await expect(noApi.speak("あ")).resolves.toBeUndefined();

    const { guide } = createGuide();
    await expect(guide.unlock()).resolves.toBe("visual-only");
    expect(guide.getStatus()).toBe("visual-only");
  });

  it("多重unlockを安全に共用し、待機timerも一度だけ作る", async () => {
    vi.useFakeTimers();
    try {
      const { guide, speech } = createGuide();
      const first = guide.unlock();
      const second = guide.unlock();
      expect(speech.listenerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(20);
      await expect(first).resolves.toBe("visual-only");
      await expect(second).resolves.toBe("visual-only");
      expect(speech.listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("visual-only後もunlockを再試行し、後着voiceで同時要求を一度だけreadyへ回復する", async () => {
    vi.useFakeTimers();
    try {
      const { guide, speech } = createGuide();
      const unavailable = guide.unlock();
      await vi.advanceTimersByTimeAsync(20);
      await expect(unavailable).resolves.toBe("visual-only");

      const firstRetry = guide.unlock();
      const secondRetry = guide.unlock();
      expect(speech.listenerCount()).toBe(1);
      speech.voices = [{ lang: "ja-JP", default: true }];
      speech.emitVoicesChanged();

      await expect(firstRetry).resolves.toBe("ready");
      await expect(secondRetry).resolves.toBe("ready");
      expect(speech.listenerCount()).toBe(0);
      await expect(guide.unlock()).resolves.toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("新しい案内は古い発話を中止し、cancelされたPromiseも解決する", async () => {
    const { guide, speech } = createGuide();
    speech.voices = [{ lang: "ja-JP", default: true }];
    await guide.unlock();
    const oldSpeech = guide.speak("あひるの、あ");
    const newSpeech = guide.speak("おなじ かたちを みつけよう", { interrupt: true });

    expect(speech.cancel).toHaveBeenCalledOnce();
    await expect(oldSpeech).resolves.toBeUndefined();
    expect(speech.spoken.at(-1)).toMatchObject({ lang: "ja-JP" });
    speech.spoken.at(-1)?.onend?.();
    await expect(newSpeech).resolves.toBeUndefined();
  });

  it("cancelとerrorは待機中Promiseを残さず、古いeventは新しい発話を壊さない", async () => {
    const { guide, speech } = createGuide();
    speech.voices = [{ lang: "ja-JP", default: true }];
    await guide.unlock();
    const oldSpeech = guide.speak("あ");
    const oldUtterance = speech.spoken[0];
    const currentSpeech = guide.speak("い", { interrupt: true });
    oldUtterance.onerror?.();
    expect(guide.getStatus()).toBe("ready");
    speech.spoken[1].onend?.();
    await expect(currentSpeech).resolves.toBeUndefined();
    await expect(oldSpeech).resolves.toBeUndefined();

    const pending = guide.speak("う");
    guide.cancel();
    await expect(pending).resolves.toBeUndefined();
  });

  it("指定rateを安全範囲へclampし、interruptなしでは再生を重ねない", async () => {
    const { guide, speech } = createGuide();
    speech.voices = [{ lang: "ja-JP", default: true }];
    await guide.unlock();
    const first = guide.speak("あ", { rate: 99 });
    const ignored = guide.speak("い");
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0].rate).toBe(2);
    await expect(ignored).resolves.toBeUndefined();
    speech.spoken[0].onend?.();
    await first;
  });

  it("speech設定が無効な間はreadyでも読み上げを開始しない", async () => {
    const speech = new FakeSpeechSynthesis();
    speech.voices = [{ lang: "ja-JP", default: true }];
    let speechEnabled = false;
    const guide = new BrowserSpeechGuide({
      speechSynthesis: speech,
      createUtterance: (text) => new FakeUtterance(text),
      isSpeechEnabled: () => speechEnabled,
    });
    await guide.unlock();
    await guide.speak("あ");
    expect(speech.spoken).toHaveLength(0);

    speechEnabled = true;
    const enabledSpeech = guide.speak("あ");
    expect(speech.spoken).toHaveLength(1);
    speech.spoken[0].onend?.();
    await enabledSpeech;
  });
});
