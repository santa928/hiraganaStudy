import { render, screen } from "@testing-library/react";

import { SuccessBloom } from "./SuccessBloom";

describe("SuccessBloom", () => {
  it("6枚の装飾花びらと読み上げ可能な達成通知を分離する", () => {
    const { container } = render(<SuccessBloom character="あ" />);

    expect(screen.getByRole("status")).toHaveTextContent("できたね");
    expect(screen.getByTestId("success-character")).toHaveTextContent("あ");
    expect(screen.getByTestId("success-character")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".successBloom__petal")).toHaveLength(6);
    expect(container.querySelector(".successBloom__petals")).toHaveAttribute("aria-hidden", "true");
  });
});
