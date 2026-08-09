import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";
import type { GameRuntime } from "./GameRuntime";
import { createLessonChoices } from "../features/lesson/LessonScreen";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import type { LearningProgress } from "../features/learning/model/types";
import type { ProgressRepository } from "../platform/storage/ProgressRepository";
import type { AudioGuide } from "../platform/audio/AudioGuide";

function createRuntime(load: () => Promise<LearningProgress>): { readonly runtime: GameRuntime; readonly save: ReturnType<typeof vi.fn> } {
  const save = vi.fn<ProgressRepository["save"]>().mockResolvedValue(undefined);
  return {
    runtime: { progressRepository: { load, save, reset: vi.fn().mockResolvedValue(undefined) }, storageDegraded: false },
    save,
  };
}

describe("App", () => {
  it("初回は復元完了後に音声確認を一つだけ表示する", async () => {
    const { runtime } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    expect(await screen.findByRole("button", { name: "こえを きく" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(JSON.parse(window.render_game_to_text?.() ?? "{}")).toMatchObject({ promptHasIllustration: false });
  });

  it("音声確認後はじょうろを一つだけ表示し、触ると導入を始める", async () => {
    const user = userEvent.setup();
    const { runtime } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "こえを きく" }));

    await user.click(screen.getByRole("button", { name: "じょうろを さわる" }));
    expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
  });

  it("load未解決中は操作を表示せず初期進捗を保存しない", async () => {
    let resolveLoad: ((progress: LearningProgress) => void) | undefined;
    const { runtime, save } = createRuntime(() => new Promise((resolve) => { resolveLoad = resolve; }));
    render(<App runtime={runtime} />);

    expect(screen.getByTestId("app-loading")).toBeVisible();
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await act(async () => { resolveLoad?.(createInitialProgress()); });
  });

  it("既習の保存進捗は音声gateを再表示せず保存段階のlessonを開く", async () => {
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    render(<App runtime={runtime} />);

    expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
    expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
  });

  it("状態機械の操作後に進捗を保存する", async () => {
    const user = userEvent.setup();
    const { runtime, save } = createRuntime(() => Promise.resolve(createInitialProgress()));
    render(<App runtime={runtime} />);

    await user.click(await screen.findByRole("button", { name: "こえを きく" }));
    await user.click(screen.getByRole("button", { name: "じょうろを さわる" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      stage: "intro",
      kana: expect.objectContaining({ あ: expect.objectContaining({ seen: true }) }),
    })));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ stage: "shapeMatch" })));
  });

  it("保存済み再開ではspeakerの明示tapでlocked音声を再試行する", async () => {
    const started = reduceLesson(
      { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
      { type: "START" },
    );
    const saved = reduceLesson(started, { type: "CONTINUE" });
    const { runtime } = createRuntime(() => Promise.resolve(saved.progress));
    const unlock = vi.fn<AudioGuide["unlock"]>().mockResolvedValue("ready");
    const audio: AudioGuide = { unlock, speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "locked" };
    const user = userEvent.setup();
    render(<App runtime={runtime} audio={audio} />);

    await user.click(await screen.findByRole("button", { name: "こえを もういちど きく" }));
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
  });

  it("text-stateは実画面と同じ決定的な選択肢順を返す", async () => {
    const progress = createInitialProgress();
    const saved: LearningProgress = {
      ...progress,
      currentKanaIndex: 1,
      stage: "shapeMatch",
      kana: { ...progress.kana, い: { ...progress.kana.い, seen: true } },
    };
    const { runtime } = createRuntime(() => Promise.resolve(saved));
    render(<App runtime={runtime} />);

    await screen.findByTestId("lesson-stage");
    expect(JSON.parse(window.render_game_to_text?.() ?? "{}").choices).toEqual(createLessonChoices("い"));
  });
});
