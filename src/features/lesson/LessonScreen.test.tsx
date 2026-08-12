import { act, fireEvent, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { renderLesson } from "../../test/renderLesson";
import { KANA_ORDER } from "../learning/content/kana";
import { createLessonChoices } from "./LessonScreen";
import type { AudioGuide } from "../../platform/audio/AudioGuide";

describe("LessonScreen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("形合わせはイラスト名と文字を結び付けて画面表示と読み上げに使う", () => {
    const audio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("ready"),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "ready",
    };

    renderLesson({ currentKana: "あ", stage: "shapeMatch", audio });

    const guide = "あひるの あ。おなじ かたちを さがそう";
    expect(screen.getByText(guide)).toBeVisible();
    expect(audio.speak).toHaveBeenCalledWith(guide, { interrupt: true });
  });

  it("形合わせは問題に絵と大きな文字を出し、選択肢を文字だけにする", () => {
    renderLesson({ currentKana: "あ", stage: "shapeMatch" });

    expect(screen.getByTestId("prompt-illustration")).toHaveAttribute("alt", "あひる");
    expect(screen.getByTestId("prompt-character")).toHaveTextContent("あ");
    expect(screen.getAllByRole("button", { name: /もじ/ })).toHaveLength(3);
    for (const option of screen.getAllByRole("button", { name: /もじ/ })) {
      expect(within(option).queryByRole("img")).not.toBeInTheDocument();
    }
  });

  it("問題画像が壊れても切り紙fallbackと選択肢を保つ", () => {
    renderLesson({ currentKana: "あ", stage: "shapeMatch" });

    fireEvent.error(screen.getByTestId("prompt-illustration"));

    expect(screen.getByTestId("illustration-fallback")).toHaveTextContent("あ");
    expect(screen.getAllByRole("button", { name: /もじ/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "イラストを もういちど よみこむ" }));
    expect(screen.getByTestId("prompt-illustration")).toBeVisible();
  });

  it("右上の再生操作は用途不明な鳥画像ではなくスピーカー記号にする", () => {
    renderLesson({ currentKana: "あ", stage: "intro" });
    const replay = screen.getByRole("button", { name: "こえを もういちど きく" });

    expect(within(replay).queryByRole("img")).not.toBeInTheDocument();
    expect(replay.querySelector("svg")).toBeInTheDocument();
  });

  it("初回のはじめるは音声解除が失敗しても形合わせへ進む", async () => {
    const audio: AudioGuide = {
      unlock: vi.fn().mockRejectedValue(new Error("speech unavailable")),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    renderLesson({ currentKana: "あ", stage: "intro", audio });

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    await act(async () => { await Promise.resolve(); });

    expect(audio.unlock).toHaveBeenCalledOnce();
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
  });

  it("初回の音声解除が終わった時は遷移後の形合わせ案内を読む", async () => {
    let resolveUnlock: ((status: "ready") => void) | undefined;
    const audio: AudioGuide = {
      unlock: vi.fn(() => new Promise<"ready">((resolve) => { resolveUnlock = resolve; })),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    renderLesson({ currentKana: "あ", stage: "intro", audio });

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    vi.mocked(audio.speak).mockClear();
    await act(async () => {
      resolveUnlock?.("ready");
      await Promise.resolve();
    });

    expect(audio.speak).toHaveBeenCalledOnce();
    expect(audio.speak).toHaveBeenCalledWith("あひるの あ。おなじ かたちを さがそう", { interrupt: true });
  });

  it("初回tapで音声が即readyになっても形合わせ案内を二重に読まない", async () => {
    let status: "locked" | "ready" = "locked";
    const audio: AudioGuide = {
      unlock: vi.fn(() => {
        status = "ready";
        return Promise.resolve<"ready">("ready");
      }),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => status,
    };
    renderLesson({ currentKana: "あ", stage: "intro", audio });
    vi.mocked(audio.speak).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    await act(async () => { await Promise.resolve(); });

    expect(audio.speak).toHaveBeenCalledOnce();
    expect(audio.speak).toHaveBeenCalledWith("あひるの あ。おなじ かたちを さがそう", { interrupt: true });
  });

  it("初回unlock待ち中の手動再生は初回補助を無効化して一度だけ読む", async () => {
    let resolveUnlock: ((status: "ready") => void) | undefined;
    const unlocking = new Promise<"ready">((resolve) => { resolveUnlock = resolve; });
    const audio: AudioGuide = {
      unlock: vi.fn(() => unlocking),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    renderLesson({ currentKana: "あ", stage: "intro", audio });

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    vi.mocked(audio.speak).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "こえを もういちど きく" }));
    await act(async () => {
      resolveUnlock?.("ready");
      await Promise.resolve();
    });

    expect(audio.speak).toHaveBeenCalledOnce();
    expect(audio.speak).toHaveBeenCalledWith("あひるの あ。おなじ かたちを さがそう", { interrupt: true });
  });

  it("初回の音声解除待ちに別の文字へ移ったら古い案内を読まない", async () => {
    let resolveUnlock: ((status: "ready") => void) | undefined;
    const audio: AudioGuide = {
      unlock: vi.fn(() => new Promise<"ready">((resolve) => { resolveUnlock = resolve; })),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    const { rerender } = renderLesson({ currentKana: "あ", stage: "intro", audio });

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    vi.mocked(audio.speak).mockClear();
    rerender({ currentKana: "い", stage: "intro", audio });
    vi.mocked(audio.speak).mockClear();
    await act(async () => {
      resolveUnlock?.("ready");
      await Promise.resolve();
    });

    expect(audio.speak).not.toHaveBeenCalled();
  });

  it("音声OFFの初回は解除を要求せず形合わせへ進む", () => {
    const audio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("ready"),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    renderLesson({ currentKana: "あ", stage: "intro", audio, speechEnabled: false });

    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));

    expect(audio.unlock).not.toHaveBeenCalled();
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
  });

  it("全画面操作を出さず、右上の家から庭へ戻る", () => {
    const onReturnToGarden = vi.fn();
    renderLesson({ currentKana: "い", stage: "shapeMatch", onReturnToGarden });

    expect(screen.queryByRole("button", { name: /がめんを/ })).not.toBeInTheDocument();
    const home = screen.getByRole("button", { name: "にわへ もどる" });
    expect(home.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(home);
    expect(onReturnToGarden).toHaveBeenCalledOnce();
  });

  it("書字は一筆後だけ続ける操作を有効にし、あとでは祝いを重ねず次の読みに進む", () => {
    const onCelebrate = vi.fn();
    const { rerender } = renderLesson({ currentKana: "あ", stage: "traceWide" });

    expect(screen.getByRole("button", { name: "つぎへ" })).toBeDisabled();
    fireEvent.pointerDown(screen.getByRole("application"), { pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(screen.getByRole("application"), { pointerId: 1, isPrimary: true, clientX: 50, clientY: 50 });
    expect(screen.getByRole("button", { name: "つぎへ" })).toBeEnabled();

    rerender({ currentKana: "あ", stage: "freeWrite", onCelebrate });
    fireEvent.click(screen.getByRole("button", { name: "あとで" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onCelebrate).not.toHaveBeenCalled();
  });

  it.each(["traceWide", "traceNarrow", "copyWithModel", "freeWrite"] as const)(
    "%sには64px主要操作として計測できるあとでを置く",
    (stage) => {
      renderLesson({ currentKana: "あ", stage, readCompleted: true, learningMode: "readingWriting" });

      const defer = screen.getByRole("button", { name: "あとで" });
      expect(defer).toHaveAttribute("data-layout", "writing-defer");
      fireEvent.click(defer);
      expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
    },
  );

  it("読み書きモードの読み花は書字案内、読みモードと書字完了花は次の読みを案内する", () => {
    const { rerender } = renderLesson({
      currentKana: "あ",
      stage: "reward",
      learningMode: "readingWriting",
      readCompleted: true,
    });

    expect(screen.getByRole("button", { name: "かいてみよう" })).toBeVisible();

    rerender({ currentKana: "あ", stage: "reward", learningMode: "reading", readCompleted: true });
    expect(screen.getByRole("button", { name: "じょうろで つぎへ" })).toBeVisible();

    rerender({
      currentKana: "あ",
      stage: "reward",
      learningMode: "readingWriting",
      readCompleted: true,
      writingCompleted: true,
    });
    expect(screen.getByRole("button", { name: "じょうろで つぎへ" })).toBeVisible();
    expect(screen.getByTestId("reward-step").querySelector("[data-pencil-badge]")).toBeInTheDocument();
  });

  it("3回目の案内では正解候補を示し、正解選択で読みの花へ進める", () => {
    vi.useFakeTimers();
    renderLesson({ currentKana: "あ", stage: "shapeMatch" });
    const choices = screen.getAllByRole("button", { name: /もじ/ });

    fireEvent.click(choices.find((choice) => choice.textContent !== "あ")!);
    expect(screen.getByText("もういちど、あひるの あ。ゆっくり みてみよう")).toBeVisible();
    fireEvent.click(choices.find((choice) => choice.textContent !== "あ")!);
    fireEvent.click(choices.find((choice) => choice.textContent !== "あ")!);

    expect(screen.getByRole("button", { name: "もじ あ" })).toHaveAttribute("data-guided", "true");
    fireEvent.click(screen.getByRole("button", { name: "もじ あ" }));
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "reward");
    expect(screen.getByTestId("reward-step")).toBeVisible();
  });

  it("形の正解をその場で560ms祝い、一度だけ読みの花へ進める", () => {
    vi.useFakeTimers();
    const onCelebrate = vi.fn();
    renderLesson({ currentKana: "あ", stage: "shapeMatch", onCelebrate });

    const correct = screen.getByRole("button", { name: "もじ あ" });
    fireEvent.click(correct);
    fireEvent.click(correct);

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    expect(correct).toHaveAttribute("data-success", "true");
    expect(screen.getByRole("status")).toHaveTextContent("できたね");
    expect(screen.getByTestId("success-bloom").closest(".choiceGrid__cell")).toContainElement(correct);
    expect(onCelebrate).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(559));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "reward");
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
  });

  it("成功予約中に外部から段階が変わったら古い演出と遷移を破棄する", () => {
    vi.useFakeTimers();
    const { rerender } = renderLesson({ currentKana: "あ", stage: "shapeMatch" });
    fireEvent.click(screen.getByRole("button", { name: "もじ あ" }));

    rerender({ currentKana: "あ", stage: "traceWide" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide");
  });

  it("成功予約中に庭へ戻ったら遅延遷移を破棄する", () => {
    vi.useFakeTimers();
    const onReturnToGarden = vi.fn();
    renderLesson({ currentKana: "あ", stage: "shapeMatch", onReturnToGarden });
    fireEvent.click(screen.getByRole("button", { name: "もじ あ" }));

    fireEvent.click(screen.getByRole("button", { name: "にわへ もどる" }));

    expect(onReturnToGarden).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
  });

  it("正解の位置を文字ごとに決定的に分散し、再描画で並び替えない", () => {
    const positions = new Set(KANA_ORDER.map((character) => {
      const choices = createLessonChoices(character);
      expect(createLessonChoices(character)).toEqual(choices);
      return choices.indexOf(character);
    }));

    expect(positions).toEqual(new Set([0, 1, 2]));
  });

  it("形合わせの累計案内を終えても音問題を挟まず読みの花へ進む", () => {
    vi.useFakeTimers();
    renderLesson({ currentKana: "あ", stage: "shapeMatch" });
    const chooseWrong = (): void => {
      fireEvent.click(screen.getAllByRole("button", { name: /もじ/ }).find((choice) => choice.textContent !== "あ")!);
    };
    chooseWrong();
    chooseWrong();
    chooseWrong();
    fireEvent.click(screen.getByRole("button", { name: "もじ あ" }));
    act(() => vi.advanceTimersByTime(560));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "reward");
    expect(screen.queryByRole("button", { name: "もじ あ" })).not.toBeInTheDocument();
  });

  it("書字段階は現在の操作に合う案内を画面へ出す", () => {
    renderLesson({ currentKana: "あ", stage: "traceWide" });

    expect(screen.getByText("ふとい みちを なぞろう")).toBeVisible();
  });

  it.each([
    ["traceWide", "traceNarrow"],
    ["traceNarrow", "copyWithModel"],
    ["copyWithModel", "freeWrite"],
    ["freeWrite", "reward"],
  ] as const)("%sの取り組みをその場で祝い、560ms後に%sへ進める", (stage, nextStage) => {
    vi.useFakeTimers();
    const onCelebrate = vi.fn();
    renderLesson({ currentKana: "あ", stage, onCelebrate });
    const canvas = screen.getByRole("application");
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 50, clientY: 50 });

    fireEvent.click(screen.getByRole("button", { name: "つぎへ" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", stage);
    expect(screen.getByTestId("writing-step")).toHaveAttribute("data-celebrating", "true");
    expect(screen.getByRole("status")).toHaveTextContent("できたね");
    expect(onCelebrate).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", nextStage);
  });

  it("書字4段階を連続しても各段階は一筆前にCTAをリセットする", () => {
    vi.useFakeTimers();
    renderLesson({ currentKana: "あ", stage: "traceWide" });
    const drawOneStroke = (): void => {
      const canvas = screen.getByRole("application");
      fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 50, clientY: 50 });
    };

    drawOneStroke();
    fireEvent.click(screen.getByRole("button", { name: "つぎへ" }));
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceNarrow");
    expect(screen.getByRole("button", { name: "つぎへ" })).toBeDisabled();

    drawOneStroke();
    fireEvent.click(screen.getByRole("button", { name: "つぎへ" }));
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "copyWithModel");
    expect(screen.getByRole("button", { name: "つぎへ" })).toBeDisabled();

    drawOneStroke();
    fireEvent.click(screen.getByRole("button", { name: "つぎへ" }));
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "freeWrite");
    expect(screen.getByRole("button", { name: "つぎへ" })).toBeDisabled();
  });

  it("自由書字は見本を隠して始め、明示tapで表示と非表示を切り替える", () => {
    renderLesson({ currentKana: "あ", stage: "freeWrite" });
    const model = screen.getByRole("button", { name: "あ の おてほんを みる" });

    expect(model).not.toHaveTextContent("あ");
    fireEvent.click(model);
    expect(screen.getByRole("button", { name: "あ の おてほんを かくす" })).toHaveTextContent("あ");
  });

  it("設定でreduced motionなら案内の強調を静的表示にする", () => {
    renderLesson({ currentKana: "あ", stage: "shapeMatch", reducedMotion: true });
    fireEvent.click(screen.getAllByRole("button", { name: /もじ/ }).find((choice) => choice.textContent !== "あ")!);
    fireEvent.click(screen.getAllByRole("button", { name: /もじ/ }).find((choice) => choice.textContent !== "あ")!);

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByRole("button", { name: "もじ あ" })).toHaveAttribute("data-guided", "true");
  });

  it("unlock待ちの再生は段階が変わったら古い案内を読み上げない", async () => {
    let resolveUnlock: ((status: "ready") => void) | undefined;
    const audio: AudioGuide = {
      unlock: vi.fn(() => new Promise<"ready">((resolve) => { resolveUnlock = resolve; })),
      speak: vi.fn(() => Promise.resolve()),
      cancel: vi.fn(),
      getStatus: vi.fn<() => "locked">(() => "locked"),
    };
    const { rerender } = renderLesson({ currentKana: "あ", stage: "shapeMatch", audio });
    vi.mocked(audio.speak).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "こえを もういちど きく" }));
    rerender({ currentKana: "あ", stage: "traceWide", audio });
    await act(async () => {
      resolveUnlock?.("ready");
      await Promise.resolve();
    });

    expect(audio.speak).not.toHaveBeenCalledWith("おなじ かたちの あ を さがそう", { interrupt: true });
  });
});
