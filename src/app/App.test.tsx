import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App, createSpeechDuckingHandler, type AppSoundEffects } from "./App";
import type { GameRuntime } from "./GameRuntime";
import { createLessonChoices } from "../features/lesson/LessonScreen";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import type { LearningProgress } from "../features/learning/model/types";
import type { ProgressRepository } from "../platform/storage/ProgressRepository";
import type { AudioGuide } from "../platform/audio/AudioGuide";
import { progressWithCompletedCount } from "../test/fixtures/progress";
import { renderApp } from "../test/renderApp";

function createRuntime(load: () => Promise<LearningProgress>): { readonly runtime: GameRuntime; readonly save: ReturnType<typeof vi.fn> } {
  const save = vi.fn<ProgressRepository["save"]>().mockResolvedValue(undefined);
  return {
    runtime: { progressRepository: { load, save, reset: vi.fn().mockResolvedValue(undefined) }, storageDegraded: false },
    save,
  };
}

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("45文字完了時はhelper経由でwordGardenを直接要求しても文字の庭に留まる", async () => {
    const incomplete = progressWithCompletedCount(45);
    const progress = { ...incomplete, kana: Object.fromEntries(Object.entries(incomplete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"] };
    renderApp({ progress, requestedRoute: "wordGarden" });
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    expect(screen.queryByTestId("word-garden")).not.toBeInTheDocument();
  });
  it("46文字完了時だけhelper経由のwordGarden直接要求を受け入れる", async () => {
    const complete = progressWithCompletedCount(46);
    const progress = { ...complete, kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"] };

    renderApp({ progress, requestedRoute: "wordGarden" });

    expect(await screen.findByTestId("word-garden")).toBeVisible();
  });
  it("45文字完了の保存ではことばのにわへ遷移せず、46文字完了の庭CTAはことばのにわを開く", async () => {
    const incomplete = progressWithCompletedCount(45);
    const complete = progressWithCompletedCount(46);
    const startedIncomplete = { ...incomplete, kana: Object.fromEntries(Object.entries(incomplete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"] };
    const startedComplete = { ...complete, kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"] };
    const first = createRuntime(() => Promise.resolve(startedIncomplete));
    const { unmount } = render(<App runtime={first.runtime} />);

    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.queryByTestId("word-garden")).not.toBeInTheDocument();
    unmount();

    const second = createRuntime(() => Promise.resolve(startedComplete));
    render(<App runtime={second.runtime} />);
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "ことばの にわへ" }));
    expect(await screen.findByTestId("word-garden")).toBeVisible();
  });
  it("ことばのにわへの案内は音声ON時だけ一度読み上げ、もじのにわへ戻れる", async () => {
    const complete = progressWithCompletedCount(46);
    const progress = {
      ...complete,
      kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"],
      settings: { ...complete.settings, speech: true },
    };
    const { runtime } = createRuntime(() => Promise.resolve(progress));
    const audio: AudioGuide = { cancel: vi.fn(), getStatus: () => "visual-only", unlock: vi.fn().mockResolvedValue("visual-only"), speak: vi.fn().mockResolvedValue(undefined) };
    render(<App runtime={runtime} audio={audio} />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "ことばの にわへ" }));
    expect(await screen.findByTestId("word-garden")).toBeVisible();
    expect(audio.speak).toHaveBeenCalledOnce();
    expect(audio.speak).toHaveBeenCalledWith("みどりの じょうろを さわって、ことばを そだてよう", { interrupt: true });
    vi.mocked(audio.cancel).mockClear();
    await userEvent.setup().click(screen.getByRole("button", { name: "もじの にわへ" }));
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    expect(audio.cancel).toHaveBeenCalledOnce();
  });
  it("production音声の開始・終了を効果音duckingへ伝える", () => {
    const setSpeechActive = vi.fn();
    const effects: AppSoundEffects = { applySettings: vi.fn(), setSpeechActive, startGardenLoop: vi.fn().mockResolvedValue(undefined), stopGardenLoop: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };

    const onSpeakingChange = createSpeechDuckingHandler(effects);
    onSpeakingChange(true);
    onSpeakingChange(false);
    expect(setSpeechActive).toHaveBeenNthCalledWith(1, true);
    expect(setSpeechActive).toHaveBeenNthCalledWith(2, false);
  });

  it("初回は音声確認とじょうろgateを挟まず、あの導入を表示する", async () => {
    const { runtime } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("あひるの あ")).toBeVisible();
    expect(screen.getByTestId("prompt-illustration")).toHaveAttribute("alt", "あひる");
    expect(screen.getByRole("button", { name: "はじめる" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "じょうろを さわる" })).not.toBeInTheDocument();
  });

  it("初回導入のはじめるを押すと文字の選択肢を表示する", async () => {
    const user = userEvent.setup();
    const { runtime } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "はじめる" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    expect(screen.getAllByRole("button", { name: /もじ/ })).toHaveLength(3);
  });

  it("load未解決中は操作を表示せず初期進捗を保存しない", async () => {
    let resolveLoad: ((progress: LearningProgress) => void) | undefined;
    const { runtime, save } = createRuntime(() => new Promise((resolve) => { resolveLoad = resolve; }));
    render(<App runtime={runtime} />);

    expect(screen.getByTestId("app-loading")).toBeVisible();
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await act(async () => { resolveLoad?.(createInitialProgress()); });
  });

  it("既習の保存進捗は音声gateを再表示せず庭を開き、じょうろで保存段階を正確に再開する", async () => {
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    render(<App runtime={runtime} />);

    const user = userEvent.setup();
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
  });

  it("一文字の成功開始時に既存成功音を一度だけ要求する", async () => {
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    const play = vi.fn().mockResolvedValue(undefined);
    const effects: AppSoundEffects = {
      applySettings: vi.fn(),
      startGardenLoop: vi.fn().mockResolvedValue(undefined),
      stopGardenLoop: vi.fn(),
      play,
    };
    render(<App runtime={runtime} effects={effects} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    play.mockClear();
    vi.useFakeTimers();

    const correct = screen.getByRole("button", { name: "もじ あ" });
    fireEvent.click(correct);
    fireEvent.click(correct);

    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("success");
    act(() => vi.advanceTimersByTime(560));
    expect(play).toHaveBeenCalledOnce();
  });

  it("通常レッスンは庭へ戻っても同じ文字と段階から再開する", async () => {
    const user = userEvent.setup();
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    await user.click(screen.getByRole("button", { name: "にわへ もどる" }));
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    expect(JSON.parse(window.render_game_to_text?.() ?? "{}")).toMatchObject({ kana: "あ", stage: "shapeMatch" });
  });

  it("状態機械の操作後に進捗を保存する", async () => {
    const user = userEvent.setup();
    const { runtime, save } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "はじめる" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      stage: "shapeMatch",
      kana: expect.objectContaining({ あ: expect.objectContaining({ seen: true }) }),
    })));
  });

  it("保存済み再開ではspeakerの明示tapでlocked音声を再試行する", async () => {
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    const unlock = vi.fn<AudioGuide["unlock"]>().mockResolvedValue("ready");
    const audio: AudioGuide = { unlock, speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "locked" };
    const user = userEvent.setup();
    render(<App runtime={runtime} audio={audio} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await user.click(await screen.findByRole("button", { name: "こえを もういちど きく" }));
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
  });

  it("text-stateは実画面と同じ決定的な選択肢順を返す", async () => {
    const progress = createInitialProgress();
    const saved: LearningProgress = {
      ...progress,
      currentKanaIndex: 1,
      stage: "shapeMatch",
      kana: { ...progress.kana, い: { ...progress.kana.い, seen: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await screen.findByTestId("lesson-stage");
    expect(JSON.parse(window.render_game_to_text?.() ?? "{}").choices).toEqual(createLessonChoices("い"));
  });

  it("報酬後は非行末を次文字の導入へ連続させ、行末だけ行復習へ進める", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const nonEnding: LearningProgress = {
      ...base,
      stage: "reward",
      kana: { ...base.kana, あ: { ...base.kana.あ, seen: true, shapeMatched: true, readCompleted: true } },
    };
    const first = createRuntime(() => Promise.resolve(nonEnding));
    const { unmount } = render(<App runtime={first.runtime} />);
    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await user.click(screen.getByRole("button", { name: "じょうろで つぎへ" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("いぬの い")).toBeVisible();
    expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
    unmount();

    const ending: LearningProgress = { ...base, currentKanaIndex: 4, stage: "reward", kana: { ...base.kana, お: { ...base.kana.お, seen: true } } };
    const second = createRuntime(() => Promise.resolve(ending));
    render(<App runtime={second.runtime} />);
    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await user.click(screen.getByRole("button", { name: "じょうろで つぎへ" }));
    expect(await screen.findByTestId("row-review")).toHaveAttribute("data-step", "shape");
    await user.click(screen.getByRole("button", { name: "もじ お" }));
    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "sound");
    await user.click(screen.getByRole("button", { name: "もじ お" }));
    expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("かさの か")).toBeVisible();
    expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
  });

  it("よむ・かくの単語書字をあとでにしても次の未読語へ進める", async () => {
    const user = userEvent.setup();
    const complete = progressWithCompletedCount(46);
    const progress: LearningProgress = {
      ...complete,
      settings: { ...complete.settings, learningMode: "readingWriting" },
      kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"],
      words: {
        ...complete.words,
        "w1-01": {
          ...complete.words["w1-01"],
          selected: true,
          arranged: true,
          readCompleted: true,
        },
      },
    };
    const { runtime } = createRuntime(() => Promise.resolve(progress));
    render(<App runtime={runtime} requestedRoute="wordGarden" />);

    await user.click(await screen.findByRole("button", { name: "いえ" }));
    expect(screen.getByTestId("word-writing")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "あとで" }));
    expect(await screen.findByTestId("word-garden")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "ことばを そだてよう" }));
    expect(screen.getByRole("button", { name: "かお" })).toBeVisible();
  });

  it("未完の単語花で書き終えると書字実績だけを保存して本線位置を保つ", async () => {
    const user = userEvent.setup();
    const complete = progressWithCompletedCount(46);
    const progress: LearningProgress = {
      ...complete,
      settings: { ...complete.settings, learningMode: "readingWriting" },
      kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"],
      words: {
        ...complete.words,
        "w1-01": {
          ...complete.words["w1-01"],
          selected: true,
          arranged: true,
          readCompleted: true,
        },
      },
    };
    const { runtime, save } = createRuntime(() => Promise.resolve(progress));
    render(<App runtime={runtime} requestedRoute="wordGarden" />);

    await user.click(await screen.findByRole("button", { name: "いえ" }));
    const firstCanvas = screen.getByRole("application", { name: "い を かく" });
    fireEvent.pointerDown(firstCanvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerUp(firstCanvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 18, clientY: 18 });
    const secondCanvas = screen.getByRole("application", { name: "え を かく" });
    fireEvent.pointerDown(secondCanvas, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerUp(secondCanvas, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: 18, clientY: 18 });

    expect(await screen.findByTestId("word-garden")).toBeVisible();
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      words: expect.objectContaining({
        "w1-01": expect.objectContaining({ readCompleted: true, writingTried: true, writingCompleted: true }),
        "w1-02": expect.objectContaining({ readCompleted: false, writingCompleted: false }),
      }),
    })));
    expect(screen.getByRole("button", { name: "いえ" }).querySelector("[data-pencil-badge]")).toBeInTheDocument();
  });

  it("読み書きモードの読み花からは庭へ戻らず最初の未完書字へ進む", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      stage: "reward",
      settings: { ...base.settings, learningMode: "readingWriting" },
      kana: {
        ...base.kana,
        あ: { ...base.kana["あ"], seen: true, shapeMatched: true, readCompleted: true },
      },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await user.click(screen.getByRole("button", { name: "かいてみよう" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide");
    expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
  });

  it("読み書きモードの書字をあとでにしても庭を挟まず次文字へ進む", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      stage: "traceWide",
      settings: { ...base.settings, learningMode: "readingWriting" },
      kana: {
        ...base.kana,
        あ: { ...base.kana.あ, seen: true, shapeMatched: true, readCompleted: true },
      },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    await user.click(screen.getByRole("button", { name: "あとで" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("いぬの い")).toBeVisible();
    expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
  });

  it("読み書きモードの未完書字花は最初の未体験段階から復習する", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 1,
      settings: { ...base.settings, learningMode: "readingWriting" },
      kana: {
        ...base.kana,
        あ: {
          ...base.kana["あ"],
          seen: true,
          shapeMatched: true,
          readCompleted: true,
          traceWideTried: true,
        },
      },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "あ を もういちど" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceNarrow");
    expect(screen.getByRole("application", { name: "あ を なぞろう" })).toBeVisible();
  });

  it("復習書字のあとでは部分実績だけを保存し、本線カーソルを変えず庭へ戻る", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 1,
      stage: "intro",
      settings: { ...base.settings, learningMode: "readingWriting" },
      kana: {
        ...base.kana,
        あ: {
          ...base.kana["あ"],
          seen: true,
          shapeMatched: true,
          readCompleted: true,
          traceWideTried: true,
          traceNarrowTried: true,
          copyTried: true,
        },
      },
    };
    const { runtime, save } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "あ を もういちど" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "freeWrite");
    await user.click(screen.getByRole("button", { name: "あとで" }));

    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      currentKanaIndex: 1,
      stage: "intro",
      rowReview: null,
      kana: expect.objectContaining({
        あ: expect.objectContaining({
          readCompleted: true,
          traceWideTried: true,
          traceNarrowTried: true,
          copyTried: true,
          freeWriteTried: false,
          writingCompleted: false,
        }),
      }),
    })));
  });

  it("庭から未体験の現在文字を始める時だけSTARTを送り、復習は本線を変えない", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 1,
      stage: "intro",
      kana: { ...base.kana, あ: { ...base.kana.あ, seen: true, readCompleted: true } },
    };
    const { runtime, save } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);
    await user.click(await screen.findByRole("button", { name: "あ を もういちど" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(JSON.parse(window.render_game_to_text?.() ?? "{}")).toMatchObject({ kana: "い", stage: "intro" });
    await user.click(screen.getByRole("button", { name: "にわへ もどる" }));
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ kana: expect.objectContaining({ い: expect.objectContaining({ seen: true }) }) })));
  });

  it("旧版の一文字音問題から再起動しても、庭を経て太いなぞりから再開する", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 1,
      stage: "soundMatch",
      kana: { ...base.kana, い: { ...base.kana.い, seen: true, shapeMatched: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));

    render(<App runtime={runtime} />);
    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide");
    expect(screen.getByRole("application", { name: "い を なぞろう" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
  });

  it("途中の行復習も再起動後はいったん庭を見せ、じょうろで同じstepを復元する", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 4,
      stage: "soundMatch",
      rowReview: { row: "a", step: "sound" },
      kana: { ...base.kana, お: { ...base.kana.お, seen: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "sound");
  });

  it("行復習も庭へ戻った後に同じstepから再開する", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 4,
      stage: "shapeMatch",
      rowReview: { row: "a", step: "shape" },
      kana: { ...base.kana, お: { ...base.kana.お, seen: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "shape");
    await user.click(screen.getByRole("button", { name: "にわへ もどる" }));
    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "shape");
  });

  it("端末音声なしの行復習は画像選択で停止せず次の文字へ進む", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      currentKanaIndex: 4,
      stage: "soundMatch",
      rowReview: { row: "a", step: "sound" },
      kana: { ...base.kana, お: { ...base.kana.お, seen: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    const audio: AudioGuide = { unlock: vi.fn().mockResolvedValue("visual-only"), speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "visual-only" };
    render(<App runtime={runtime} audio={audio} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
    expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("かさの か")).toBeVisible();
    expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
    await waitFor(() => expect(runtime.progressRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      currentKanaIndex: 5,
      rowReview: null,
    })));
  });

  it("んの行復習を終えた時だけ全文字境界として文字の庭へ戻る", async () => {
    const user = userEvent.setup();
    const complete = progressWithCompletedCount(46);
    const saved: LearningProgress = {
      ...complete,
      currentKanaIndex: 45,
      stage: "soundMatch",
      rowReview: { row: "wa", step: "sound" },
      kana: Object.fromEntries(Object.entries(complete.kana).map(([character, value]) => [character, { ...value, seen: true }])) as LearningProgress["kana"],
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    const audio: AudioGuide = { unlock: vi.fn().mockResolvedValue("visual-only"), speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "visual-only" };
    render(<App runtime={runtime} audio={audio} />);

    await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));

    expect(await screen.findByTestId("garden-screen")).toBeVisible();
    expect(screen.getByRole("button", { name: "ことばの にわへ" })).toBeVisible();
    expect(screen.queryByTestId("lesson-stage")).not.toBeInTheDocument();
  });

  it("保護者の設定は保存進捗と注入した効果音へ反映する", async () => {
    const base = createInitialProgress();
    const saved: LearningProgress = { ...base, kana: { ...base.kana, あ: { ...base.kana.あ, seen: true } } };
    const { runtime, save } = createRuntime(() => Promise.resolve(saved));
    const effects: AppSoundEffects = { applySettings: vi.fn(), startGardenLoop: vi.fn().mockResolvedValue(undefined), stopGardenLoop: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
    render(<App runtime={runtime} effects={effects} />);
    const gate = await screen.findByRole("button", { name: "おとなの せってい" });
    vi.useFakeTimers();
    fireEvent.pointerDown(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerUp(gate, { pointerId: 1 });
    vi.useRealTimers();
    expect(screen.getByText("PWA: このブラウザでは使えません")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "こうかおん" }));
    await waitFor(() => expect(effects.applySettings).toHaveBeenLastCalledWith(expect.objectContaining({ effects: false })));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ effects: false }) })));
  });

  it("書字途中でよむへ切り替えても部分実績を残し、次の読みに進める", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = {
      ...base,
      stage: "traceNarrow",
      settings: { ...base.settings, learningMode: "readingWriting" },
      kana: {
        ...base.kana,
        あ: {
          ...base.kana.あ,
          seen: true,
          shapeMatched: true,
          readCompleted: true,
          traceWideTried: true,
        },
      },
    };
    const { runtime, save } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    const gate = await screen.findByRole("button", { name: "おとなの せってい" });
    vi.useFakeTimers();
    fireEvent.pointerDown(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerUp(gate, { pointerId: 1 });
    vi.useRealTimers();
    await user.click(screen.getByRole("radio", { name: /よむ（おすすめ）/ }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      currentKanaIndex: 1,
      stage: "intro",
      settings: expect.objectContaining({ learningMode: "reading" }),
      kana: expect.objectContaining({
        あ: expect.objectContaining({
          readCompleted: true,
          traceWideTried: true,
          traceNarrowTried: false,
          writingCompleted: false,
        }),
      }),
    })));
    await user.click(screen.getByRole("button", { name: "にわへ もどる" }));
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    expect(screen.getByLabelText("いまの もじ")).toHaveTextContent("い");
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
  });

  it("保護者resetは進行中saveの完了後に実行し、古い進捗を書き戻さない", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = { ...base, kana: { ...base.kana, あ: { ...base.kana.あ, seen: true } } };
    let resolveSave: (() => void) | undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const reset = vi.fn().mockResolvedValue(undefined);
    const runtime: GameRuntime = { progressRepository: { load: vi.fn().mockResolvedValue(saved), save, reset }, storageDegraded: false };
    render(<App runtime={runtime} />);

    const gate = await screen.findByRole("button", { name: "おとなの せってい" });
    vi.useFakeTimers();
    fireEvent.pointerDown(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerUp(gate, { pointerId: 1 });
    vi.useRealTimers();
    await user.click(screen.getByRole("checkbox", { name: "こうかおん" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    expect(reset).not.toHaveBeenCalled();

    await act(async () => { resolveSave?.(); });
    await waitFor(() => expect(reset).toHaveBeenCalledOnce());
    expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.getByText("あひるの あ")).toBeVisible();
  });

  it("reset失敗後はgenerationでskipした最新進捗を保存し直す", async () => {
    const user = userEvent.setup();
    const base = createInitialProgress();
    const saved: LearningProgress = { ...base, kana: { ...base.kana, あ: { ...base.kana.あ, seen: true } } };
    let resolveFirstSave: (() => void) | undefined;
    let rejectReset: ((error: Error) => void) | undefined;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstSave = resolve; }))
      .mockResolvedValue(undefined);
    const reset = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectReset = reject; }));
    const runtime: GameRuntime = { progressRepository: { load: vi.fn().mockResolvedValue(saved), save, reset }, storageDegraded: false };
    render(<App runtime={runtime} />);

    const gate = await screen.findByRole("button", { name: "おとなの せってい" });
    vi.useFakeTimers();
    fireEvent.pointerDown(gate, { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerUp(gate, { pointerId: 1 });
    vi.useRealTimers();
    await user.click(screen.getByRole("checkbox", { name: "こえ" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("checkbox", { name: "こうかおん" }));
    await user.click(screen.getByRole("button", { name: "ひだりの は" }));
    await user.click(screen.getByRole("button", { name: "まんなかの は" }));
    await user.click(screen.getByRole("button", { name: "みぎの は" }));
    await user.click(screen.getByRole("button", { name: "ほんとうに はじめからにする" }));
    await act(async () => { resolveFirstSave?.(); });
    await waitFor(() => expect(reset).toHaveBeenCalledOnce());
    await act(async () => { rejectReset?.(new Error("storage")); });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ settings: expect.objectContaining({ speech: false, effects: false }) }));
  });
});
