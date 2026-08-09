import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WordWritingStep } from "./WordWritingStep";

describe("WordWritingStep", () => {
  it("pointercancelした未完の一筆では次の書字セルへ進めない", () => {
    const onComplete = vi.fn();
    render(<WordWritingStep cells={["あ", "い"]} onComplete={onComplete} />);

    const canvas = screen.getByRole("application", { name: "あ を かく" });
    fireEvent.pointerDown(canvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerCancel(canvas, { pointerId: 1, isPrimary: true, pointerType: "touch" });
    expect(screen.getByRole("application", { name: "あ を かく" })).toBeVisible();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
