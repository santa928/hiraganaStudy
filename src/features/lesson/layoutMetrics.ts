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
  readonly lesson: LayoutRect;
  readonly actions?: LayoutRect;
}

/** カード内要素の収まりと、HUDから教材までの安全余白を返す。 */
export function measureContainment(parent: LayoutRect, children: LessonLayoutRects): {
  readonly withinBounds: boolean;
  readonly hudLessonGap: number;
  readonly hasSafeHudLessonGap: boolean;
} {
  const allChildren = [children.hud, children.lesson, children.actions].filter((rect): rect is LayoutRect => rect !== undefined);
  const withinBounds = allChildren.every((rect) => (
    rect.left >= parent.left && rect.top >= parent.top && rect.right <= parent.right && rect.bottom <= parent.bottom
  ));
  const hudLessonGap = children.lesson.top - children.hud.bottom;

  return { withinBounds, hudLessonGap, hasSafeHudLessonGap: hudLessonGap >= 8 };
}
