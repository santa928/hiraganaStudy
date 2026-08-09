import { measureContainment, measureRectContainment } from "./layoutMetrics";

describe("measureContainment", () => {
  it("子要素の右端・下端とHUDから教材の余白を純粋に検査する", () => {
    expect(measureContainment(
      { left: 0, top: 0, right: 390, bottom: 844 },
      {
        hud: { left: 16, top: 16, right: 374, bottom: 80 },
        guide: { left: 16, top: 88, right: 374, bottom: 112 },
        lesson: { left: 16, top: 120, right: 374, bottom: 720 },
        actions: { left: 16, top: 736, right: 374, bottom: 828 },
      },
    )).toEqual({
      withinBounds: true,
      hudLessonGap: 40,
      hasSafeHudLessonGap: true,
      hudGuideGap: 8,
      guideLessonGap: 8,
      hasSafeHudGuideGap: true,
      hasSafeGuideLessonGap: true,
    });
  });

  it("親からはみ出す要素と8px未満の余白を検出する", () => {
    expect(measureContainment(
      { left: 0, top: 0, right: 390, bottom: 844 },
      {
        hud: { left: 16, top: 16, right: 374, bottom: 80 },
        lesson: { left: 16, top: 84, right: 400, bottom: 720 },
      },
    )).toEqual({
      withinBounds: false,
      hudLessonGap: 4,
      hasSafeHudLessonGap: false,
      hudGuideGap: 4,
      guideLessonGap: null,
      hasSafeHudGuideGap: false,
      hasSafeGuideLessonGap: true,
    });
  });

  it("カード内の文字・絵・CTAの四辺を名前ごとに検査する", () => {
    expect(measureRectContainment(
      { left: 10, top: 20, right: 300, bottom: 400 },
      {
        character: { left: 36, top: 42, right: 144, bottom: 260 },
        illustration: { left: 156, top: 54, right: 278, bottom: 230 },
        primary: { left: 42, top: 300, right: 268, bottom: 372 },
      },
    )).toEqual({ withinBounds: true, overflowing: [] });
    expect(measureRectContainment(
      { left: 10, top: 20, right: 300, bottom: 400 },
      { primary: { left: 42, top: 300, right: 310, bottom: 410 } },
    )).toEqual({ withinBounds: false, overflowing: ["primary"] });
  });
});
