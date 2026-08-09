import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createInitialProgress } from "../learning/model/reducer";
import { WordGardenScreen, findNextWordId } from "./WordGardenScreen";

const createAudio = () => ({
  cancel: vi.fn(),
  getStatus: () => "ready" as const,
  unlock: vi.fn().mockResolvedValue("ready" as const),
  speak: vi.fn().mockResolvedValue(undefined),
});

describe("WordGardenScreen", () => {
  it("本線は最初の未完了語を維持し、完了語は別の復習口にする", async () => {
    const user = userEvent.setup();
    const initial = createInitialProgress();
    const progress = { ...initial, words: { ...initial.words, "w1-01": { selected: true, arranged: true, writingTried: true } } };
    const onStart = vi.fn();
    const onReview = vi.fn();
    render(<WordGardenScreen progress={progress} audio={createAudio()} onStart={onStart} onReview={onReview} onBackToGarden={vi.fn()} />);

    expect(findNextWordId(progress)).toBe("w1-02");
    await user.click(screen.getByRole("button", { name: "いえ" }));
    expect(onReview).toHaveBeenCalledWith("w1-01");
    await user.click(screen.getByRole("button", { name: "ことばを そだてよう" }));
    expect(onStart).toHaveBeenCalledWith("w1-02");
  });

  it("もじのにわへ戻る補助操作を48px以上で提供する", async () => {
    const user = userEvent.setup();
    const onBackToGarden = vi.fn();
    render(<WordGardenScreen progress={createInitialProgress()} audio={createAudio()} onStart={vi.fn()} onReview={vi.fn()} onBackToGarden={onBackToGarden} />);

    const back = screen.getByRole("button", { name: "もじの にわへ" });
    await user.click(back);
    expect(onBackToGarden).toHaveBeenCalledOnce();
  });

  it("花壇だけをスクロール対象にし、root・戻る操作・CTAを計測可能にする", () => {
    render(<WordGardenScreen progress={createInitialProgress()} audio={createAudio()} onStart={vi.fn()} onReview={vi.fn()} onBackToGarden={vi.fn()} />);

    expect(screen.getByTestId("word-garden")).toHaveAttribute("data-layout", "word-garden-root");
    expect(screen.getByLabelText("5つの ことばの はなだん")).toHaveAttribute("data-layout", "word-garden-beds");
    expect(screen.getByRole("button", { name: "もじの にわへ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ことばを そだてよう" })).toBeVisible();
  });

  it("文字が読めなくても次の操作を絵・音声・穏やかな誘導で示す", async () => {
    const audio = createAudio();
    const onStart = vi.fn();
    const { unmount } = render(<WordGardenScreen progress={createInitialProgress()} audio={audio} onStart={onStart} onReview={vi.fn()} onBackToGarden={vi.fn()} />);

    const start = screen.getByRole("button", { name: "ことばを そだてよう" });
    expect(start.querySelector("img")).toBeInTheDocument();
    expect(start).toHaveAttribute("data-guide", "true");
    expect(audio.speak).toHaveBeenCalledWith("みどりの じょうろを さわって、ことばを そだてよう", { interrupt: true });

    await userEvent.setup().click(start);
    expect(audio.cancel).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith("w1-01");
    unmount();
  });

  it("音声と動きを減らす設定を尊重する", () => {
    const progress = createInitialProgress();
    const quietProgress = { ...progress, settings: { ...progress.settings, speech: false, reducedMotion: true } };
    const audio = createAudio();
    render(<WordGardenScreen progress={quietProgress} audio={audio} onStart={vi.fn()} onReview={vi.fn()} onBackToGarden={vi.fn()} />);

    expect(audio.speak).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ことばを そだてよう" })).not.toHaveAttribute("data-guide");
  });
});
