import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  it("音合わせは曖昧な画像を出さず、音声操作と文字だけを選べる", () => {
    renderLesson({ currentKana: "い", stage: "soundMatch", audioStatus: "ready" });

    expect(screen.queryByLabelText("いまの もじ")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-character")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-illustration")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "こえを きく" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /もじ/ })).toHaveLength(3);
  });

  it("右上の再生操作は用途不明な鳥画像ではなくスピーカー記号にする", () => {
    renderLesson({ currentKana: "あ", stage: "intro" });
    const replay = screen.getByRole("button", { name: "こえを もういちど きく" });

    expect(within(replay).queryByRole("img")).not.toBeInTheDocument();
    expect(replay.querySelector("svg")).toBeInTheDocument();
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

  it.each([
    ["端末に音声がない", { audioStatus: "visual-only" as const, speechEnabled: true }],
    ["保護者が音声を切った", { audioStatus: "ready" as const, speechEnabled: false }],
  ])("%s時は成立しない音合わせを表示せず太いなぞりへ進む", async (_description, settings) => {
    const onCelebrate = vi.fn();
    renderLesson({ currentKana: "い", stage: "soundMatch", ...settings, onCelebrate });

    await waitFor(() => expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide"));
    expect(screen.queryByRole("button", { name: "もじ い" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onCelebrate).not.toHaveBeenCalled();
  });

  it("再生操作で端末音声なしと判明した時も音合わせを抜ける", async () => {
    const audio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("visual-only"),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    renderLesson({ currentKana: "い", stage: "soundMatch", audio });

    fireEvent.click(screen.getByRole("button", { name: "こえを きく" }));

    await waitFor(() => expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide"));
  });

  it("書字は一筆後だけ続ける操作を有効にし、自由書字はskipで進める", () => {
    const onCelebrate = vi.fn();
    const { rerender } = renderLesson({ currentKana: "あ", stage: "traceWide" });

    expect(screen.getByRole("button", { name: "つぎへ" })).toBeDisabled();
    fireEvent.pointerDown(screen.getByRole("application"), { pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(screen.getByRole("application"), { pointerId: 1, isPrimary: true, clientX: 50, clientY: 50 });
    expect(screen.getByRole("button", { name: "つぎへ" })).toBeEnabled();

    rerender({ currentKana: "あ", stage: "freeWrite", onCelebrate });
    fireEvent.click(screen.getByRole("button", { name: "あとで かく" }));
    expect(screen.getByTestId("reward-step")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onCelebrate).not.toHaveBeenCalled();
  });

  it("3回目の案内では正解候補を示し、正解選択で進める", () => {
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
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "soundMatch");
  });

  it("形の正解をその場で560ms祝い、一度だけ次段階へ進める", () => {
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
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "soundMatch");
  });

  it("音の正解も同じ成功演出を経て太いなぞりへ進める", () => {
    vi.useFakeTimers();
    const onCelebrate = vi.fn();
    renderLesson({ currentKana: "あ", stage: "soundMatch", audioStatus: "ready", onCelebrate });

    fireEvent.click(screen.getByRole("button", { name: "もじ あ" }));

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "soundMatch");
    expect(screen.getByRole("status")).toHaveTextContent("できたね");
    expect(onCelebrate).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(560));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "traceWide");
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

  it("形合わせの累計3回案内後も、音合わせは最初の案内から始める", () => {
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

    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "soundMatch");
    expect(screen.getByRole("button", { name: "もじ あ" })).not.toHaveAttribute("data-guided", "true");
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
    rerender({ currentKana: "あ", stage: "soundMatch", audio });
    await act(async () => {
      resolveUnlock?.("ready");
      await Promise.resolve();
    });

    expect(audio.speak).not.toHaveBeenCalledWith("おなじ かたちの あ を さがそう", { interrupt: true });
  });
});
