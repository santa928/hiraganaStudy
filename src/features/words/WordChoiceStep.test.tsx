import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordChoiceStep } from "./WordChoiceStep";

describe("WordChoiceStep", () => {
  it("選択肢を単語文字だけの3個に限定する", () => {
    render(<WordChoiceStep word={{ id: "w1-01", text: "いえ", stage: "W1", spokenLabel: "いえ", illustrationKey: "w1-01", writingCells: ["い", "え"] }} choices={["いえ", "かお", "かき"]} audio={{ cancel: vi.fn(), getStatus: () => "visual-only", unlock: vi.fn(), speak: vi.fn() }} speechEnabled onComplete={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /^(いえ|かお|かき)$/ })).toHaveLength(3);
    expect(screen.queryByRole("img", { name: /いえ|かお|かき/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("word-choice").querySelector("[data-layout='word-card']") as HTMLElement).queryByText("いえ")).not.toBeInTheDocument();
  });

  it("誤答では進まず、音声OFFでも問題カードに穏やかな案内状態を出す", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<WordChoiceStep word={{ id: "w1-01", text: "いえ", stage: "W1", spokenLabel: "いえ", illustrationKey: "w1-01", writingCells: ["い", "え"] }} choices={["いえ", "かお", "かき"]} audio={{ cancel: vi.fn(), getStatus: () => "visual-only", unlock: vi.fn(), speak: vi.fn() }} speechEnabled={false} onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "かお" }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId("word-choice").querySelector("[data-layout='word-card']")).toHaveAttribute("data-guide", "1");
    await user.click(screen.getByRole("button", { name: "かき" }));
    expect(screen.getByTestId("word-choice").querySelector("[data-layout='word-card']")).toHaveAttribute("data-guide", "2");
  });
});
