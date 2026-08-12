import { render } from "@testing-library/react";

import { LessonScreen } from "../features/lesson/LessonScreen";
import { KANA_ORDER } from "../features/learning/content/kana";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import type { LearningMode, LearningState, LessonStage } from "../features/learning/model/types";
import type { AudioGuide, AudioGuideStatus } from "../platform/audio/AudioGuide";

/** renderLessonへ指定できる、文字・段階とテスト用音声状態。 */
export interface RenderLessonOptions {
  readonly currentKana: LearningState["currentKana"];
  readonly stage: LessonStage;
  readonly audioStatus?: AudioGuideStatus;
  readonly reducedMotion?: boolean;
  readonly learningMode?: LearningMode;
  readonly readCompleted?: boolean;
  readonly writingCompleted?: boolean;
  readonly traceWideTried?: boolean;
  readonly speechEnabled?: boolean;
  readonly audio?: AudioGuide;
  readonly onReturnToGarden?: () => void;
  readonly onCelebrate?: () => void;
}

/** 状態遷移を実際のreducerへ通す、例外を出さないテスト用音声。 */
class FakeAudioGuide implements AudioGuide {
  public constructor(private readonly status: AudioGuideStatus) {}
  public unlock(): Promise<Exclude<AudioGuideStatus, "locked">> { return Promise.resolve(this.status === "locked" ? "visual-only" : this.status); }
  public speak(): Promise<void> { return Promise.resolve(); }
  public cancel(): void {}
  public getStatus(): AudioGuideStatus { return this.status; }
}

/** 指定の一文字・段階を、実際のLessonScreenと状態機械で描画する。 */
export function renderLesson(options: RenderLessonOptions): { rerender: (next: RenderLessonOptions) => void } {
  const createState = (next: RenderLessonOptions): LearningState => {
    const progress = createInitialProgress();
    const currentKanaIndex = KANA_ORDER.indexOf(next.currentKana);
    const kana = {
      ...progress.kana,
      [next.currentKana]: {
        ...progress.kana[next.currentKana],
        seen: next.stage !== "intro",
        readCompleted: next.readCompleted ?? false,
        writingCompleted: next.writingCompleted ?? false,
        traceWideTried: next.traceWideTried ?? false,
      },
    };
    return {
      progress: {
        ...progress,
        currentKanaIndex,
        stage: next.stage,
        kana,
        settings: {
          ...progress.settings,
          learningMode: next.learningMode ?? progress.settings.learningMode,
          speech: next.speechEnabled ?? true,
          reducedMotion: next.reducedMotion ?? false,
        },
      },
      currentKana: next.currentKana,
      stage: next.stage,
    };
  };
  let state = createState(options);
  let speechEnabled = options.speechEnabled ?? true;
  let onReturnToGarden = options.onReturnToGarden ?? (() => {});
  let onCelebrate = options.onCelebrate ?? (() => {});
  const audio = options.audio ?? new FakeAudioGuide(options.audioStatus ?? "ready");
  const renderResult: { current: ReturnType<typeof render> | null } = { current: null };
  let pendingDraw = false;
  const draw = (): React.JSX.Element => <LessonScreen state={state} audio={audio} speechEnabled={speechEnabled} onReturnToGarden={onReturnToGarden} onCelebrate={onCelebrate} dispatch={(event) => {
    state = reduceLesson(state, event);
    if (renderResult.current) renderResult.current.rerender(draw());
    else pendingDraw = true;
  }} />;
  renderResult.current = render(draw());
  if (pendingDraw) {
    renderResult.current.rerender(draw());
  }

  return {
    rerender: (next) => {
      state = createState(next);
      speechEnabled = next.speechEnabled ?? true;
      onReturnToGarden = next.onReturnToGarden ?? (() => {});
      onCelebrate = next.onCelebrate ?? (() => {});
      renderResult.current?.rerender(draw());
    },
  };
}
