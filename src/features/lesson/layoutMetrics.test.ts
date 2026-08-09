import { measureContainment } from "./layoutMetrics";

describe("measureContainment", () => {
  it("子要素の右端・下端とHUDから教材の余白を純粋に検査する", () => {
    expect(measureContainment(
      { left: 0, top: 0, right: 390, bottom: 844 },
      {
        hud: { left: 16, top: 16, right: 374, bottom: 80 },
        lesson: { left: 16, top: 88, right: 374, bottom: 720 },
        actions: { left: 16, top: 736, right: 374, bottom: 828 },
      },
    )).toEqual({ withinBounds: true, hudLessonGap: 8, hasSafeHudLessonGap: true });
  });

  it("親からはみ出す要素と8px未満の余白を検出する", () => {
    expect(measureContainment(
      { left: 0, top: 0, right: 390, bottom: 844 },
      {
        hud: { left: 16, top: 16, right: 374, bottom: 80 },
        lesson: { left: 16, top: 84, right: 400, bottom: 720 },
      },
    )).toEqual({ withinBounds: false, hudLessonGap: 4, hasSafeHudLessonGap: false });
  });
});
