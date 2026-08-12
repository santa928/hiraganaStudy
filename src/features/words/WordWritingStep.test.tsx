import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordWritingStep } from "./WordWritingStep";

describe("WordWritingStep", () => {
  it("pointercancelした未完の一筆では次の書字セルへ進めない", () => {
    const onComplete = vi.fn();
    render(<WordWritingStep cells={["あ", "い"]} onComplete={onComplete} onDefer={vi.fn()} />);

    const canvas = screen.getByRole("application", { name: "あ を かく" });
    fireEvent.pointerDown(canvas, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 12, clientY: 12 });
    fireEvent.pointerCancel(canvas, { pointerId: 1, isPrimary: true, pointerType: "touch" });
    expect(screen.getByRole("application", { name: "あ を かく" })).toBeVisible();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("単語書字を止めずに後回しにできる64px主要操作を置く", async () => {
    const onComplete = vi.fn();
    const onDefer = vi.fn();
    render(<WordWritingStep cells={["あ", "い"]} onComplete={onComplete} onDefer={onDefer} />);

    const defer = screen.getByRole("button", { name: "あとで" });
    expect(defer).toHaveAttribute("data-layout", "word-writing-defer");
    await userEvent.setup().click(defer);
    expect(onDefer).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
