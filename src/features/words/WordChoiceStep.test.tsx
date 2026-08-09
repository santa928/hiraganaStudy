import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WordChoiceStep } from "./WordChoiceStep";

describe("WordChoiceStep", () => {
  it("選択肢を単語文字だけの3個に限定する", () => {
    render(<WordChoiceStep word={{ id: "w1-01", text: "いえ", stage: "W1", spokenLabel: "いえ", illustrationKey: "w1-01", writingCells: ["い", "え"] }} choices={["いえ", "かお", "かき"]} audio={{ cancel: vi.fn(), getStatus: () => "visual-only", unlock: vi.fn(), speak: vi.fn() }} speechEnabled onComplete={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /^(いえ|かお|かき)$/ })).toHaveLength(3);
    expect(screen.queryByRole("img", { name: /いえ|かお|かき/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("word-choice").querySelector("[data-layout='word-card']") as HTMLElement).queryByText("いえ")).not.toBeInTheDocument();
  });
});
