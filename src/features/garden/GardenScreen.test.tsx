import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GardenScreen } from "./GardenScreen";
import { createInitialProgress } from "../learning/model/reducer";

describe("GardenScreen", () => {
  it("完了した文字だけを復習できる花として表示し、じょうろで続きを呼び出す", async () => {
    const user = userEvent.setup();
    const progress = createInitialProgress();
    const completed = {
      ...progress,
      kana: { ...progress.kana, あ: { ...progress.kana.あ, readCompleted: true } },
    };
    const onContinue = vi.fn();
    const onReview = vi.fn();
    render(<GardenScreen progress={completed} resumeRoute={{ kind: "kanaLesson", character: "い" }} onContinue={onContinue} onReview={onReview} onOpenParent={vi.fn()} />);

    expect(screen.getByRole("button", { name: "あ を もういちど" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "い を もういちど" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
    await user.click(screen.getByRole("button", { name: "あ を もういちど" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledWith("あ");
  });

  it("完成花の画像が読めなくても文字花を残して再試行できる", async () => {
    const user = userEvent.setup();
    const progress = createInitialProgress();
    const completed = { ...progress, kana: { ...progress.kana, あ: { ...progress.kana.あ, readCompleted: true } } };
    render(<GardenScreen progress={completed} resumeRoute={{ kind: "kanaLesson", character: "あ" }} onContinue={vi.fn()} onReview={vi.fn()} onOpenParent={vi.fn()} />);
    fireEvent.error(screen.getByRole("button", { name: "あ を もういちど" }).querySelector("img")!);
    expect(screen.getByRole("button", { name: "イラストを もういちど よみこむ" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "イラストを もういちど よみこむ" }));
    expect(screen.getByRole("button", { name: "あ を もういちど" })).toHaveTextContent("あ");
  });

  it("46文字完了後だけ、ことばのにわへの明確な入口を表示する", () => {
    render(<GardenScreen progress={createInitialProgress()} resumeRoute={{ kind: "wordGarden" }} onContinue={vi.fn()} onReview={vi.fn()} onOpenParent={vi.fn()} />);
    expect(screen.getByRole("button", { name: "ことばの にわへ" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "つづきを あそぶ" })).not.toBeInTheDocument();
  });

  it("読み達成の花は保ち、4段階書字を体験した花だけ鉛筆印を付ける", () => {
    const initial = createInitialProgress();
    const progress = {
      ...initial,
      kana: {
        ...initial.kana,
        あ: { ...initial.kana["あ"], readCompleted: true },
        い: { ...initial.kana["い"], readCompleted: true, writingCompleted: true },
      },
    };

    render(<GardenScreen progress={progress} resumeRoute={{ kind: "kanaLesson", character: "う" }} onContinue={vi.fn()} onReview={vi.fn()} onOpenParent={vi.fn()} />);

    expect(screen.getByRole("button", { name: "あ を もういちど" })).not.toHaveAccessibleDescription("かく れんしゅうも した");
    expect(screen.getByRole("button", { name: "い を もういちど" })).toHaveAccessibleDescription("かく れんしゅうも した");
    expect(screen.getByRole("button", { name: "い を もういちど" }).querySelector("[data-pencil-badge]")).toBeInTheDocument();
  });
});
