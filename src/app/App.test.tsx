import { render, screen } from "@testing-library/react";

import { App } from "./App";

describe("App", () => {
  it("初回は音声確認を一つだけ表示する", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "こえを きく" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
