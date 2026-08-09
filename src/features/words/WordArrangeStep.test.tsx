import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordArrangeStep } from "./WordArrangeStep";

describe("WordArrangeStep", () => {
  it("重複文字を別々のタイルとして正しい順に並べられる", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const { rerender } = render(<WordArrangeStep word="きって" onComplete={onComplete} />);

    const initialOrder = screen.getAllByRole("button", { name: /^(き|っ|て)$/ }).map((tile) => tile.getAttribute("data-tile-id"));
    expect(initialOrder).not.toEqual(["き-0", "っ-1", "て-2"]);
    rerender(<WordArrangeStep word="きって" onComplete={onComplete} />);
    expect(screen.getAllByRole("button", { name: /^(き|っ|て)$/ }).map((tile) => tile.getAttribute("data-tile-id"))).toEqual(initialOrder);

    const tiles = screen.getAllByRole("button", { name: "っ" });
    expect(tiles).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "き" }));
    await user.click(tiles[0]);
    await user.click(screen.getByRole("button", { name: "て" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("最長の7文字語でもタイル全件を操作対象として描画する", () => {
    render(<WordArrangeStep word="しょうぼうしゃ" onComplete={vi.fn()} />);

    expect(screen.getByTestId("word-arrange").querySelector("[data-layout='word-tiles']")).toHaveAttribute("data-layout", "word-tiles");
    expect(screen.getAllByRole("button", { name: /^(し|ょ|う|ぼ|ゃ)$/ })).toHaveLength(7);
  });

  it("誤タイルでは進まず、次の置き場に穏やかな案内状態を出す", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<WordArrangeStep word="いえ" onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "え" }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ならべた ことば")).toHaveAttribute("data-guide", "1");
  });
});
