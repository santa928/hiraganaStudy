import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialProgress } from "../learning/model/reducer";
import { WordLessonScreen } from "./WordLessonScreen";

const audio = { cancel: vi.fn(), getStatus: () => "visual-only" as const, unlock: vi.fn().mockResolvedValue("visual-only"), speak: vi.fn().mockResolvedValue(undefined) };

describe("WordLessonScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完了語の復習は選ぶ・並べる・書くを保存変更なしで通る", async () => {
    const user = userEvent.setup();
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      settings: { ...initial.settings, learningMode: "readingWriting" as const },
      words: {
        ...initial.words,
        "w1-01": {
          selected: true,
          arranged: true,
          writingTried: true,
          readCompleted: true,
          writingCompleted: true,
        },
      },
    };
    const onSelected = vi.fn();
    const onArranged = vi.fn();
    const onWritten = vi.fn();
    render(<WordLessonScreen progress={progress} wordId="w1-01" audio={audio} reviewMode onSelected={onSelected} onArranged={onArranged} onWritten={onWritten} onDeferred={vi.fn()} onReturnToGarden={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "いえ" }));
    expect(screen.getByTestId("word-arrange")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "い" }));
    await user.click(screen.getByRole("button", { name: "え" }));
    await user.click(screen.getByRole("button", { name: "かいてみよう" }));
    const firstCanvas = screen.getByRole("application", { name: "い を かく" });
    fireEvent.pointerDown(firstCanvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerUp(firstCanvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 18, clientY: 18 });
    const secondCanvas = screen.getByRole("application", { name: "え を かく" });
    fireEvent.pointerDown(secondCanvas, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerUp(secondCanvas, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: 18, clientY: 18 });
    expect(screen.getByText("いえ の はなが さいたよ")).toBeVisible();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onArranged).not.toHaveBeenCalled();
    expect(onWritten).not.toHaveBeenCalled();
  });

  it("画像失敗時も問題カードに正答語を出さない", () => {
    const initial = createInitialProgress();
    render(<WordLessonScreen progress={initial} wordId="w1-01" audio={audio} onSelected={vi.fn()} onArranged={vi.fn()} onWritten={vi.fn()} onDeferred={vi.fn()} onReturnToGarden={vi.fn()} />);

    fireEvent.error(document.querySelector(".wordLesson__illustration") as HTMLImageElement);
    const card = screen.getByTestId("word-choice").querySelector("[data-layout='word-card']") as HTMLElement;
    expect(within(card).queryByText("いえ")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "いえ" })).toHaveLength(1);
  });

  it("並べ終えた案内音声を止めてから書字へ進む", async () => {
    const user = userEvent.setup();
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      words: {
        ...initial.words,
        "w1-01": {
          selected: true,
          arranged: false,
          writingTried: false,
          readCompleted: false,
          writingCompleted: false,
        },
      },
    };
    const onArranged = vi.fn();
    render(<WordLessonScreen progress={progress} wordId="w1-01" audio={audio} onSelected={vi.fn()} onArranged={onArranged} onWritten={vi.fn()} onDeferred={vi.fn()} onReturnToGarden={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "い" }));
    await user.click(screen.getByRole("button", { name: "え" }));

    expect(audio.cancel).toHaveBeenCalledOnce();
    expect(onArranged).toHaveBeenCalledWith("w1-01");
  });

  it("よむでは読み花から庭へ戻り、単語書字を表示しない", async () => {
    const user = userEvent.setup();
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      words: {
        ...initial.words,
        "w1-01": { ...initial.words["w1-01"], selected: true, arranged: true, readCompleted: true },
      },
    };
    const onReturnToGarden = vi.fn();
    render(<WordLessonScreen progress={progress} wordId="w1-01" audio={audio} onSelected={vi.fn()} onArranged={vi.fn()} onWritten={vi.fn()} onDeferred={vi.fn()} onReturnToGarden={onReturnToGarden} />);

    expect(screen.getByText("いえ の はなが さいたよ")).toBeVisible();
    expect(screen.queryByTestId("word-writing")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ことばの にわへ" }));
    expect(onReturnToGarden).toHaveBeenCalledOnce();
  });

  it("よむ・かくでは読み花の後に書字へ進め、あとで庭へ戻せる", async () => {
    const user = userEvent.setup();
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      settings: { ...initial.settings, learningMode: "readingWriting" as const },
      words: {
        ...initial.words,
        "w1-01": { ...initial.words["w1-01"], selected: true, arranged: true, readCompleted: true },
      },
    };
    const onDeferred = vi.fn();
    render(<WordLessonScreen progress={progress} wordId="w1-01" audio={audio} onSelected={vi.fn()} onArranged={vi.fn()} onWritten={vi.fn()} onDeferred={onDeferred} onReturnToGarden={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "かいてみよう" }));
    expect(screen.getByTestId("word-writing")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "あとで" }));
    expect(onDeferred).toHaveBeenCalledWith("w1-01");
  });

  it("よむ・かくの未完書字花は選択をやり直さず書字から再開する", () => {
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      settings: { ...initial.settings, learningMode: "readingWriting" as const },
      words: {
        ...initial.words,
        "w1-01": { ...initial.words["w1-01"], selected: true, arranged: true, readCompleted: true },
      },
    };
    render(<WordLessonScreen progress={progress} wordId="w1-01" audio={audio} reviewMode onSelected={vi.fn()} onArranged={vi.fn()} onWritten={vi.fn()} onDeferred={vi.fn()} onReturnToGarden={vi.fn()} />);

    expect(screen.getByTestId("word-writing")).toBeVisible();
    expect(screen.queryByTestId("word-choice")).not.toBeInTheDocument();
  });
});
