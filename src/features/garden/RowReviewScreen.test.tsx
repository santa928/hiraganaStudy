import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RowReviewScreen, createRowReviewChoices } from "./RowReviewScreen";
import { createInitialProgress } from "../learning/model/reducer";
import type { LearningState } from "../learning/model/types";
import type { AudioGuide } from "../../platform/audio/AudioGuide";

const audio: AudioGuide = { unlock: vi.fn().mockResolvedValue("ready"), speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "ready" };
const returnToGarden = vi.fn();

function reviewState(character: LearningState["currentKana"], row: "a" | "ka" | "sa" | "ta" | "na" | "ha" | "ma" | "ya" | "ra" | "wa", step: "shape" | "sound"): LearningState {
  const progress = createInitialProgress();
  return {
    progress: { ...progress, currentKanaIndex: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".indexOf(character), stage: step === "shape" ? "shapeMatch" : "soundMatch", rowReview: { row, step } },
    currentKana: character,
    stage: step === "shape" ? "shapeMatch" : "soundMatch",
  };
}

describe("RowReviewScreen", () => {
  it("行復習も右上の家から庭へ戻る", async () => {
    const onReturnToGarden = vi.fn();
    render(<RowReviewScreen state={reviewState("よ", "ya", "shape")} dispatch={vi.fn()} audio={audio} onReturnToGarden={onReturnToGarden} />);

    await userEvent.click(screen.getByRole("button", { name: "にわへ もどる" }));
    expect(onReturnToGarden).toHaveBeenCalledOnce();
  });

  it("や行では行内3文字だけを決定的な三択で表示する", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const { rerender } = render(<RowReviewScreen state={reviewState("よ", "ya", "shape")} dispatch={dispatch} audio={audio} onReturnToGarden={returnToGarden} />);

    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "shape");
    expect(screen.getByText("よっとの よ。おなじ かたちを さがそう")).toBeVisible();
    expect(screen.getByTestId("prompt-character")).toHaveTextContent("よ");
    expect(screen.getAllByRole("button", { name: /^もじ / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "もじ や" })).toBeVisible();
    expect(screen.getByRole("button", { name: "もじ ゆ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "もじ よ" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "もじ よ" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "ANSWER_SHAPE", correct: true });

    rerender(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={dispatch} audio={audio} onReturnToGarden={returnToGarden} />);
    expect(screen.queryByTestId("prompt-character")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-illustration")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "こえを きく" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^もじ / }).map((button) => button.textContent)).toEqual(["や", "ゆ", "よ"]);
  });

  it("あ行の音復習は正解を含む2択から始め、形復習は3択を保つ", () => {
    expect(createRowReviewChoices("お", "sound")).toEqual(["あ", "お"]);
    expect(createRowReviewChoices("お", "sound")).toContain("お");
    expect(createRowReviewChoices("お", "shape")).toHaveLength(3);
  });

  it("か行以後の音復習と、3文字だけのわ行は決定的な3択にする", () => {
    expect(createRowReviewChoices("こ", "sound")).toHaveLength(3);
    expect(createRowReviewChoices("ん", "sound")).toEqual(["わ", "を", "ん"]);
  });

  it("音復習は正解しなくても、つぎへから任意に飛ばせる", async () => {
    const dispatch = vi.fn();
    render(<RowReviewScreen state={reviewState("お", "a", "sound")} dispatch={dispatch} audio={audio} onReturnToGarden={returnToGarden} />);

    expect(screen.getAllByRole("button", { name: /^もじ / })).toHaveLength(2);
    expect(screen.getByLabelText("もじを えらぶ")).toHaveAttribute("data-choice-count", "2");
    await userEvent.click(screen.getByRole("button", { name: "こえの おさらいを とばす" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_SOUND_MATCH" });
  });

  it("形復習には音復習のskipを出さない", () => {
    render(<RowReviewScreen state={reviewState("お", "a", "shape")} dispatch={vi.fn()} audio={audio} onReturnToGarden={returnToGarden} />);

    expect(screen.queryByRole("button", { name: "こえの おさらいを とばす" })).not.toBeInTheDocument();
  });

  it("音復習も画面から正解語を隠し、関連語は読み上げだけに残す", () => {
    const localAudio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("ready"),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "ready",
    };

    render(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={vi.fn()} audio={localAudio} onReturnToGarden={returnToGarden} />);

    const guide = document.querySelector(".lessonScreen__guide");
    expect(guide?.textContent).toBe("こえを きいて\nおなじ もじを さがそう");
    expect(guide).not.toHaveTextContent("よっとの よ");
    expect(localAudio.speak).toHaveBeenCalledWith(
      "よっとの よ。こえを きいて、おなじ もじを さがそう",
      { interrupt: true },
    );
  });

  it("こえを切った時も再生中の案内を必ず停止する", () => {
    const silentAudio: AudioGuide = { unlock: vi.fn(), speak: vi.fn(), cancel: vi.fn(), getStatus: () => "ready" };
    const state = reviewState("よ", "ya", "shape");
    render(<RowReviewScreen state={{ ...state, progress: { ...state.progress, settings: { ...state.progress.settings, speech: false } } }} dispatch={vi.fn()} audio={silentAudio} onReturnToGarden={returnToGarden} />);

    expect(silentAudio.cancel).toHaveBeenCalled();
    expect(silentAudio.speak).not.toHaveBeenCalled();
  });

  it.each([
    ["音声設定OFF", { speech: false, status: "ready" as const }],
    ["端末音声なし", { speech: true, status: "visual-only" as const }],
  ])("%sの音復習は成立しない選択を出さずskipする", async (_description, condition) => {
    const state = reviewState("よ", "ya", "sound");
    const dispatch = vi.fn();
    const unavailableAudio: AudioGuide = { unlock: vi.fn(), speak: vi.fn(), cancel: vi.fn(), getStatus: () => condition.status };
    render(<RowReviewScreen state={{ ...state, progress: { ...state.progress, settings: { ...state.progress.settings, speech: condition.speech } } }} dispatch={dispatch} audio={unavailableAudio} onReturnToGarden={returnToGarden} />);

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_SOUND_MATCH" }));
  });

  it("再生操作で端末音声なしと判明した音復習もskipする", async () => {
    const dispatch = vi.fn();
    const lockedAudio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("visual-only"),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    render(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={dispatch} audio={lockedAudio} onReturnToGarden={returnToGarden} />);

    await userEvent.click(screen.getByRole("button", { name: "こえを きく" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_SOUND_MATCH" }));
  });

  it("音声のunlockが失敗した音復習も停止せずskipする", async () => {
    const dispatch = vi.fn();
    const failingAudio: AudioGuide = {
      unlock: vi.fn().mockRejectedValue(new Error("voice unavailable")),
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getStatus: () => "locked",
    };
    render(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={dispatch} audio={failingAudio} onReturnToGarden={returnToGarden} />);

    await userEvent.click(screen.getByRole("button", { name: "こえを きく" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_SOUND_MATCH" }));
  });

  it("音声の読み上げが失敗した音復習も停止せずskipする", async () => {
    const dispatch = vi.fn();
    const failingAudio: AudioGuide = {
      unlock: vi.fn().mockResolvedValue("ready"),
      speak: vi.fn().mockRejectedValue(new Error("speech failed")),
      cancel: vi.fn(),
      getStatus: () => "ready",
    };

    render(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={dispatch} audio={failingAudio} onReturnToGarden={returnToGarden} />);

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_SOUND_MATCH" }));
  });
});
