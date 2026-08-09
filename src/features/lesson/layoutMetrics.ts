/** DOMRectのうち、画面内配置の検査に必要な境界だけを表す。 */
export interface LayoutRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** レッスン各領域の実測境界。HUDと教材は安全余白も検査する。 */
export interface LessonLayoutRects {
  readonly hud: LayoutRect;
  readonly guide?: LayoutRect;
  readonly lesson: LayoutRect;
  readonly actions?: LayoutRect;
}

/** 任意の親要素に対し、名前付き子要素の四辺が収まるかを純粋に検査する。 */
export function measureRectContainment(
  parent: LayoutRect,
  children: Readonly<Record<string, LayoutRect | undefined>>,
): { readonly withinBounds: boolean; readonly overflowing: readonly string[] } {
  const overflowing = Object.entries(children)
    .filter((entry): entry is [string, LayoutRect] => entry[1] !== undefined)
    .filter(([, rect]) => (
      rect.left < parent.left || rect.top < parent.top || rect.right > parent.right || rect.bottom > parent.bottom
    ))
    .map(([name]) => name);

  return { withinBounds: overflowing.length === 0, overflowing };
}

/** カード内要素の収まりと、HUDから教材までの安全余白を返す。 */
export function measureContainment(parent: LayoutRect, children: LessonLayoutRects): {
  readonly withinBounds: boolean;
  readonly hudLessonGap: number;
  readonly hasSafeHudLessonGap: boolean;
  readonly hudGuideGap: number;
  readonly guideLessonGap: number | null;
  readonly hasSafeHudGuideGap: boolean;
  readonly hasSafeGuideLessonGap: boolean;
} {
  const { withinBounds } = measureRectContainment(parent, {
    hud: children.hud,
    guide: children.guide,
    lesson: children.lesson,
    actions: children.actions,
  });
  const hudLessonGap = children.lesson.top - children.hud.bottom;
  const hudGuideGap = (children.guide ?? children.lesson).top - children.hud.bottom;
  const guideLessonGap = children.guide ? children.lesson.top - children.guide.bottom : null;

  return {
    withinBounds,
    hudLessonGap,
    hasSafeHudLessonGap: hudLessonGap >= 8,
    hudGuideGap,
    guideLessonGap,
    hasSafeHudGuideGap: hudGuideGap >= 8,
    hasSafeGuideLessonGap: guideLessonGap === null || guideLessonGap >= 8,
  };
}
