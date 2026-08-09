import { render } from "@testing-library/react";

import { LessonScreen } from "../features/lesson/LessonScreen";
import { KANA_ORDER } from "../features/learning/content/kana";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import type { LearningState, LessonStage } from "../features/learning/model/types";
import type { AudioGuide, AudioGuideStatus } from "../platform/audio/AudioGuide";

/** renderLessonへ指定できる、文字・段階とテスト用音声状態。 */
export interface RenderLessonOptions {
  readonly currentKana: LearningState["currentKana"];
  readonly stage: LessonStage;
  readonly audioStatus?: AudioGuideStatus;
  readonly reducedMotion?: boolean;
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
      [next.currentKana]: { ...progress.kana[next.currentKana], seen: next.stage !== "intro" },
    };
    return {
      progress: { ...progress, currentKanaIndex, stage: next.stage, kana, settings: { ...progress.settings, reducedMotion: next.reducedMotion ?? false } },
      currentKana: next.currentKana,
      stage: next.stage,
    };
  };
  let state = createState(options);
  const audio = new FakeAudioGuide(options.audioStatus ?? "ready");
  const renderResult: { current: ReturnType<typeof render> | null } = { current: null };
  const draw = (): React.JSX.Element => <LessonScreen state={state} audio={audio} dispatch={(event) => {
    state = reduceLesson(state, event);
    renderResult.current?.rerender(draw());
  }} />;
  renderResult.current = render(draw());

  return {
    rerender: (next) => {
      state = createState(next);
      renderResult.current?.rerender(draw());
    },
  };
}
