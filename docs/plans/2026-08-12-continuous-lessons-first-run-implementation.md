# 連続レッスンと初回導線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一文字成功後に庭で止まらず次の教材へ進み、新規利用者が無説明の中間画面なしで「あ / intro」から始められるようにする。

**Architecture:** Reducerを学習進捗の唯一の遷移元として維持し、Appはイベント結果を「次文字lesson / rowReview / 46文字完了のgarden」へ正しく写像する。音声unlockはLessonScreenのintro CTAへ吸収し、非同期完了時に現在文字・段階を再確認してから案内する。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Playwright、Docker Compose

## Global Constraints

- 新規起動は「あ / intro」を直接表示する。
- 音声準備の失敗、音声OFF、visual-onlyでも学習を止めない。
- 読みモードは非行末reward後に次文字introへ進む。
- よむ・かくは書字を維持し、完了または「あとで」の後に次文字introへ進む。
- 行末は行復習、46文字完了は文字の庭を境界にする。
- 家ボタンの保存・再開契約を変えない。
- npm、テスト、ビルド、ブラウザ実行はDocker内で行う。
- pushとGitHub Pages公開はこの計画に含めない。

---

### Task 1: 学習routeとApp画面遷移

**Files:**
- Modify: `src/features/learning/model/types.ts`
- Modify: `src/features/learning/model/selectors.ts`
- Test: `src/features/learning/model/reducer.test.ts`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `reduceLesson(state, event): LearningState`、`selectRoute(progress): LearningRoute`
- Produces: 初期route=`kanaLesson`、イベント後の`lesson / rowReview / garden`画面写像

- [ ] **Step 1: 失敗するrouteテストを書く**

`reducer.test.ts`の初期route期待を次へ変更する。

```ts
expect(selectRoute(createInitialProgress())).toEqual({ kind: "kanaLesson", character: "あ" });
```

非行末の読み完了後も次文字routeを期待する。

```ts
const next = reduceLesson(readCompletedStateAt("あ", "reward"), { type: "CONTINUE" });
expect(selectRoute(next.progress)).toEqual({ kind: "kanaLesson", character: "い" });
```

- [ ] **Step 2: routeテストのREDを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/learning/model/reducer.test.ts`

Expected: 初期値が`soundGate`、次文字が`garden`でFAIL。

- [ ] **Step 3: 初期・未読文字をkanaLesson routeへする**

`LearningRoute`から`soundGate`を削除し、`selectRoute`は行復習、全46文字完了を先に判定した後、現在文字を`kanaLesson`として返す。保存済み再起動で庭を先に表示するApp方針は変更しない。

- [ ] **Step 4: Appの統合REDテストを書く**

`App.test.tsx`で次を実DOMへ期待する。

```ts
it("読みモードの非行末reward後は庭を挟まず次文字introへ進む", async () => {
  // あ=readCompleted, stage=reward, learningMode=readingをload
  await user.click(await screen.findByRole("button", { name: "つづきを あそぶ" }));
  await user.click(screen.getByRole("button", { name: "じょうろで つぎへ" }));
  expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
  expect(screen.getByText("あひるの あ", { exact: false })).not.toBeInTheDocument();
  expect(screen.getByText("いぬの い", { exact: false })).toBeVisible();
  expect(screen.queryByTestId("garden-screen")).not.toBeInTheDocument();
});
```

同じテスト群へ、よむ・かくの`DEFER_WRITING`後、行末reward、行復習完了、46文字完了の期待を分けて追加する。

- [ ] **Step 5: App統合テストのREDを確認する**

Run: `docker compose run --rm app npm test -- --run src/app/App.test.tsx`

Expected: 非行末reward後に`garden-screen`が表示されFAIL。

- [ ] **Step 6: 画面写像を最小実装する**

`handleMainDispatch`でReducer結果を使い、次を明示する。

```ts
function screenAfterLessonBoundary(next: LearningState): EntryScreen {
  if (next.progress.rowReview) return "rowReview";
  if (isWordGardenUnlocked(next.progress)) return "garden";
  return "lesson";
}
```

`CONTINUE` at reward、`DEFER_WRITING`、`SKIP_FREE_WRITE`、行復習sound完了だけに適用する。rewardから未完書字へ進む場合はLessonScreenを維持する。

- [ ] **Step 7: Task 1をGREENにする**

Run: `docker compose run --rm app npm test -- --run src/features/learning/model/reducer.test.ts src/app/App.test.tsx`

Expected: 対象2 suites PASS。

---

### Task 2: 初回introと音声unlock

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Modify: `src/features/lesson/LessonScreen.tsx`
- Test: `src/features/lesson/LessonScreen.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `AudioGuide.unlock()`、`AudioGuide.speak()`、`LessonEvent.CONTINUE`
- Produces: `intro`の1タップ開始、stale-safe音声再試行、旧gate DOMの撤去

- [ ] **Step 1: 初回導線の統合REDテストを書く**

```ts
it("新規進捗は音声とじょうろgateを挟まずあの導入を表示する", async () => {
  render(<App runtime={runtime} audio={audio} />);
  expect(await screen.findByTestId("lesson-stage")).toHaveAttribute("data-stage", "intro");
  expect(screen.getByText("あひるの あ", { exact: false })).toBeVisible();
  expect(screen.queryByRole("button", { name: "こえを きく" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "じょうろを さわる" })).not.toBeInTheDocument();
});
```

reset後も同じintroへ戻るテストを追加する。

- [ ] **Step 2: 初回導線のREDを確認する**

Run: `docker compose run --rm app npm test -- --run src/app/App.test.tsx`

Expected: `こえを きく`だけが表示されFAIL。

- [ ] **Step 3: intro音声のcomponent REDテストを書く**

```ts
it("初回はじめるはunlockを待たず形問題へ進み、失敗しても停止しない", async () => {
  const audio = { unlock: vi.fn().mockRejectedValue(new Error("blocked")), ... };
  renderLesson({ currentKana: "あ", stage: "intro", audio });
  await user.click(screen.getByRole("button", { name: "はじめる" }));
  expect(audio.unlock).toHaveBeenCalledOnce();
  expect(screen.getByTestId("lesson-stage")).toHaveAttribute("data-stage", "shapeMatch");
});
```

deferred unlock中に庭へ戻る／次文字へ変わると古い案内を話さないテストと、ready完了時だけ現在shape guideを話すテストを追加する。

- [ ] **Step 4: 音声REDを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/lesson/LessonScreen.test.tsx`

Expected: intro CTAが`unlock`を呼ばずFAIL。

- [ ] **Step 5: intro CTAへunlockを統合する**

`LessonScreen`のintro CTAは、`speechEnabled`時だけ`audio.unlock()`を開始してから、直ちに`CONTINUE`をdispatchする。Promise完了時はmount、request ID、文字、現在stage=`shapeMatch`を確認し、readyなら現在guideを読み上げる。rejectとvisual-onlyは無視する。

`App`は初期screenとreset後screenを`lesson`にし、初回stateのintro CTAを通じてseenを保存する。soundGate/wateringのrender分岐、handler、EntryScreen語彙を削除する。

- [ ] **Step 6: START契約をintro CTAへ接続する**

Reducerのintro `CONTINUE`で現在文字を`seen: true`にしながら`shapeMatch`へ進める。既存`START`は庭から未読文字を開く互換イベントとして残す。

- [ ] **Step 7: 不要CSSと参照を削除する**

`global.css`の`.sound-gate*`と`.watering-gate*`だけを削除する。教材内のwatering-can画像、庭CTA、reward CTAは削除しない。

- [ ] **Step 8: Task 2をGREENにする**

Run: `docker compose run --rm app npm test -- --run src/app/App.test.tsx src/features/lesson/LessonScreen.test.tsx src/features/learning/model/reducer.test.ts`

Expected: 対象3 suites PASS。

---

### Task 3: 文書・再発防止・全体検証

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `progress.md`（gitignore対象）

**Interfaces:**
- Consumes: Task 1/2の完成UI
- Produces: 公開利用者向け説明、同種の画面／状態乖離を防ぐproject rule、検証証跡

- [ ] **Step 1: 文書を同期する**

READMEの初回操作を「最初から絵付き導入」「はじめるで音声準備」へ変更し、非行末は次文字へ連続することを追記する。CHANGELOGへ公開後修正を追加する。

- [ ] **Step 2: project再発防止ruleを追加する**

`AGENTS.md`の幼児教材ルールへ次を1項目で追加する。

```md
- Reducerが次の文字・段階へ進む操作は、App統合テストで画面の文字・段階も同じ結果へ進むことを確認する。初回や成功後に、説明のない単独アイコン画面や自動ホーム帰還を挟まない。
```

- [ ] **Step 3: 参照残りと対象テストを確認する**

Run: `rg -n "soundGate|watering-gate|sound-gate|じょうろを さわる|こえを きく" src`

Expected: 初回gateのproduction参照なし。教材speakerや庭watering CTAは別名称のため維持。

- [ ] **Step 4: 全品質ゲートを実行する**

Run:

```bash
docker compose run --rm app npm test -- --run --maxWorkers=1 --reporter=dot
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
docker compose run --rm app npm run build:pages
```

Expected: 全てexit 0。

- [ ] **Step 5: 共通web-game clientを実行する**

Docker内Playwrightから`~/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`を使い、新規起動のスクリーンショットと`render_game_to_text`を取得する。初期stateが`screen=lesson,kana=あ,stage=intro`であることを確認する。

- [ ] **Step 6: 実ブラウザで重要導線を検証する**

390x844と844x390で次を通す。

1. 新規起動 → あintro → はじめる → shapeMatch
2. 読みモードのあ正解 → reward → いintro
3. よむ・かくのreward → traceWide → あとで → いintro
4. おreward → 行復習 → かintro
5. 音声unlock rejectでもshapeMatch

各画面を原寸目視し、CTA >= 64px、教材カード内包、家の操作可能、console error 0を数値と画像で確認する。

- [ ] **Step 7: 差分レビューとコミット**

Run: `git diff --check && git status --short`

意図したファイルだけをstageし、日本語コミットを作成する。pushと公開は行わない。

