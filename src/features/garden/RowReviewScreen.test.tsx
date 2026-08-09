import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RowReviewScreen, createRowReviewChoices } from "./RowReviewScreen";
import { createInitialProgress } from "../learning/model/reducer";
import type { LearningState } from "../learning/model/types";
import type { AudioGuide } from "../../platform/audio/AudioGuide";

const audio: AudioGuide = { unlock: vi.fn().mockResolvedValue("ready"), speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "ready" };

function reviewState(character: LearningState["currentKana"], row: "a" | "ka" | "sa" | "ta" | "na" | "ha" | "ma" | "ya" | "ra" | "wa", step: "shape" | "sound"): LearningState {
  const progress = createInitialProgress();
  return {
    progress: { ...progress, currentKanaIndex: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".indexOf(character), stage: step === "shape" ? "shapeMatch" : "soundMatch", rowReview: { row, step } },
    currentKana: character,
    stage: step === "shape" ? "shapeMatch" : "soundMatch",
  };
}

describe("RowReviewScreen", () => {
  it("や行では行内3文字だけを決定的な三択で表示する", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const { rerender } = render(<RowReviewScreen state={reviewState("よ", "ya", "shape")} dispatch={dispatch} audio={audio} />);

    expect(screen.getByTestId("row-review")).toHaveAttribute("data-step", "shape");
    expect(screen.getByTestId("prompt-character")).toHaveTextContent("よ");
    expect(screen.getAllByRole("button", { name: /^もじ / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "もじ や" })).toBeVisible();
    expect(screen.getByRole("button", { name: "もじ ゆ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "もじ よ" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "もじ よ" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "ANSWER_SHAPE", correct: true });

    rerender(<RowReviewScreen state={reviewState("よ", "ya", "sound")} dispatch={dispatch} audio={audio} />);
    expect(screen.queryByTestId("prompt-character")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^もじ / }).map((button) => button.textContent)).toEqual(["や", "ゆ", "よ"]);
  });

  it("わ行も3文字だけを候補にし、行外の文字を混ぜない", () => {
    expect(createRowReviewChoices("ん")).toEqual(["わ", "を", "ん"]);
  });

  it("こえを切った時も再生中の案内を必ず停止する", () => {
    const silentAudio: AudioGuide = { unlock: vi.fn(), speak: vi.fn(), cancel: vi.fn(), getStatus: () => "ready" };
    const state = reviewState("よ", "ya", "shape");
    render(<RowReviewScreen state={{ ...state, progress: { ...state.progress, settings: { ...state.progress.settings, speech: false } } }} dispatch={vi.fn()} audio={silentAudio} />);

    expect(silentAudio.cancel).toHaveBeenCalled();
    expect(silentAudio.speak).not.toHaveBeenCalled();
  });
});
