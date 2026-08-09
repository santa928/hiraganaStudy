import { describe, expect, it, vi } from "vitest";

import { SoundEffects, type AudioContextLike } from "./SoundEffects";

class FakeGain {
  public readonly gain = { value: 1 };
  public connect(): void {}
}

class FakeSource {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public readonly connect = vi.fn();
  public readonly start = vi.fn(() => {
    if (this.throwOnStart) throw new Error("play blocked");
  });
  public readonly stop = vi.fn();
  public onended: (() => void) | null = null;

  public constructor(private readonly throwOnStart = false) {}
}

class FakeAudioContext implements AudioContextLike {
  public readonly destination = {} as AudioDestinationNode;
  public readonly gains: FakeGain[] = [];
  public readonly sources: FakeSource[] = [];
  public readonly decodeAudioData = vi.fn(async () => ({}) as Promise<AudioBuffer>);
  public state: AudioContextState = "running";
  public readonly resume = vi.fn(async () => {
    this.state = "running";
  });
  public throwOnStart = false;

  public createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  public createBufferSource(): FakeSource {
    const source = new FakeSource(this.throwOnStart);
    this.sources.push(source);
    return source;
  }
}

/** 明示完了させるまで待つ非同期fetchを作る。 */
function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void; reject: (error: Error) => void } {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** 注入可能な音声コンテキストで効果音を作る。 */
function createEffects(context = new FakeAudioContext(), fetchAudio = vi.fn(async () => new Response(new ArrayBuffer(8)))): {
  effects: SoundEffects;
  context: FakeAudioContext;
  fetchAudio: ReturnType<typeof vi.fn>;
} {
  return {
    effects: new SoundEffects({ audioContext: context, fetchAudio, baseUrl: "https://example.test/subpath/" }),
    context,
    fetchAudio,
  };
}

describe("SoundEffects", () => {
  it("effectsとmusicを独立設定し、サブパス基準のasset URLだけを読む", async () => {
    const { effects, context, fetchAudio } = createEffects();
    effects.applySettings({ effects: false, music: true, speech: false });
    await effects.play("tap");
    await effects.startGardenLoop();

    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(fetchAudio.mock.calls[0][0]).toBe("https://example.test/subpath/assets/sfx/garden-loop.wav");
    expect(context.sources[0].loop).toBe(true);
    expect(effects.getSettings()).toEqual({ effects: false, music: true, speech: false });
  });

  it("読み上げ中はeffectsとBGMをduckし、終了で復帰する", async () => {
    const { effects, context } = createEffects();
    effects.applySettings({ effects: true, music: true, speech: true });
    await effects.startGardenLoop();
    effects.setSpeechActive(true);
    expect(context.gains.map((gain) => gain.gain.value)).toEqual([0.35, 0.2]);
    effects.setSpeechActive(false);
    expect(context.gains.map((gain) => gain.gain.value)).toEqual([1, 1]);
  });

  it("suspendedなAudioContextをユーザー操作再生の前にresumeしてから鳴らす", async () => {
    const context = new FakeAudioContext();
    context.state = "suspended";
    const { effects } = createEffects(context);
    await effects.play("tap");

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(1);
  });

  it("同時BGM開始は一つにし、読み込み中の停止後に開始しない", async () => {
    const response = deferredResponse();
    const fetchAudio = vi.fn(async () => response.promise);
    const { effects, context } = createEffects(undefined, fetchAudio);
    effects.applySettings({ effects: true, music: true, speech: true });
    const first = effects.startGardenLoop();
    const second = effects.startGardenLoop();
    await Promise.resolve();
    expect(fetchAudio).toHaveBeenCalledOnce();
    effects.applySettings({ effects: true, music: false, speech: true });
    response.resolve(new Response(new ArrayBuffer(8)));

    await Promise.all([first, second]);
    expect(context.sources).toHaveLength(0);
  });

  it("失敗したBGMは再試行でき、停止後はsourceを解放して再開できる", async () => {
    const fetchAudio = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(new ArrayBuffer(8)));
    const { effects, context } = createEffects(undefined, fetchAudio);
    effects.applySettings({ effects: true, music: true, speech: true });
    await effects.startGardenLoop();
    await effects.startGardenLoop();
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    expect(context.sources).toHaveLength(1);
    effects.stopGardenLoop();
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    await effects.startGardenLoop();
    expect(context.sources).toHaveLength(2);
  });

  it("AudioContext、fetch、decode、playの失敗をvisual-onlyとして握りつぶす", async () => {
    const unavailable = new SoundEffects({ audioContext: null, fetchAudio: null });
    await expect(unavailable.play("success")).resolves.toBeUndefined();

    const { effects } = createEffects(undefined, vi.fn(async () => { throw new Error("offline"); }));
    await expect(effects.play("sprout")).resolves.toBeUndefined();

    const decodeFailure = createEffects();
    decodeFailure.context.decodeAudioData.mockRejectedValueOnce(new Error("decode failed"));
    await expect(decodeFailure.effects.play("tap")).resolves.toBeUndefined();

    const playFailureContext = new FakeAudioContext();
    playFailureContext.throwOnStart = true;
    const playFailure = createEffects(playFailureContext);
    await expect(playFailure.effects.play("success")).resolves.toBeUndefined();

    const suspended = new FakeAudioContext();
    suspended.state = "suspended";
    suspended.resume.mockRejectedValueOnce(new Error("resume rejected"));
    const resumeFailure = createEffects(suspended);
    await expect(resumeFailure.effects.startGardenLoop()).resolves.toBeUndefined();
    expect(suspended.sources).toHaveLength(0);
  });
});
