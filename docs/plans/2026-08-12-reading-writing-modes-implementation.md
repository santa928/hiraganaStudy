# 読み・書きモード分離 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Each behavior change follows `superpowers:test-driven-development`; do not write production code before observing the relevant test fail.

**Goal:** 読みの達成と書字の体験を別々に保存し、保護者が「よむ」と「よむ・かく」を選べるようにする。書字がまだ難しい3歳児も、読めた花を失わず五十音順と単語コースを進められる完成品質の体験にする。

**Architecture:** 保存スキーマをv2へ上げ、Reducerを唯一のモード別遷移元、Selectorを読み達成基準の解放判定元、保存修復層をv1移行元にする。既存の `reward` 段階を「読めた花／書字の鉛筆印」の共通確認画面として再利用し、新しい永続stageは増やさない。通常復習はephemeralのまま保ち、未完書字の復習だけ文字別書字フラグを本線へ限定マージする。

**Tech Stack:** React、TypeScript、Vite、CSS、Canvas 2D、IndexedDB、Vitest、Testing Library、Playwright client、Docker Compose。

## 世界観辞書

- 舞台: 朝のひらがなの庭
- 読みの達成: 文字の花が咲く
- 書字の達成: 花へ小さな鉛筆印が付く
- 設定名: 難易度ではなく「まなびかた」
- 読みモード: 「よむ（おすすめ）」
- 読み書きモード: 「よむ・かく」
- 後回し操作: 右向き三角を添えた「あとで」
- 禁止: 点数、上手・下手、書字未完で花を枯らす、子どもへ毎文字モードを選ばせる

## Global Constraints

- 開発サーバー、テスト、型チェック、Lint、ビルドはDockerコンテナ内だけで実行する。
- ローカルではファイル編集、Git、生成済みスクリーンショットの目視確認だけを行う。
- `main` 上の既存変更を戻さず、読み書き分離に必要な最小差分だけを加える。
- 新規保存はschema v2かつ `reading`、v1移行だけは既存体験維持のため `readingWriting` とする。
- 花、次文字、行復習、単語解放は `readCompleted` だけを基準にする。
- 鉛筆印は採点ではなく4段階書字を体験した印とし、既存Canvasの採点閾値や30fps上限を変更しない。
- 書字段階の「あとで」は全段階に置き、64 CSS px以上の主要操作にする。
- モード変更、後回し、復習書字で本線カーソルを巻き戻さない。
- 主要な公開型、pure helper、責務を持つコンポーネントには短いTSDocを付ける。
- UI変更は `390x844`、`844x390`、`820x1180` でスクリーンショットと内部境界値を確認する。
- GitHubへのpushとGitHub Pages公開は、完成検証後にユーザーへ明示許可を得てから行う。

## 永続モデルと遷移契約

```ts
export type LearningMode = "reading" | "readingWriting";

export type WritingStage = Extract<
  LessonStage,
  "traceWide" | "traceNarrow" | "copyWithModel" | "freeWrite"
>;

export interface KanaProgress {
  readonly seen: boolean;
  readonly shapeMatched: boolean;
  readonly soundMatched: boolean;
  readonly traceWideTried: boolean;
  readonly traceNarrowTried: boolean;
  readonly copyTried: boolean;
  readonly freeWriteTried: boolean;
  readonly readCompleted: boolean;
  readonly writingCompleted: boolean;
  readonly guideCount: number;
}

export interface WordProgress {
  readonly selected: boolean;
  readonly arranged: boolean;
  readonly writingTried: boolean;
  readonly readCompleted: boolean;
  readonly writingCompleted: boolean;
}
```

通常文字の確定遷移は次のとおりとする。

```text
intro → shapeMatch → reward(readCompleted=true)
  reading        ───────────────→ 次の未読文字 / 行復習
  readingWriting → 最初の未完書字 → reward(writingCompleted=true) → 次へ
                         └─ あとで ──────────────────────────────→ 次へ
```

- `ANSWER_SHAPE(correct)` は `readCompleted=true` にして `reward` へ進める。
- `CONTINUE` が `reward` で呼ばれた時、`readingWriting` かつ書字未完なら最初の未体験書字段階へ進め、それ以外は次の未読文字または行復習へ進める。
- `COMPLETE_FREE_WRITE` は `writingCompleted=true` にして `reward` へ戻す。
- `DEFER_WRITING` はどの書字段階からでも既存フラグを保ったまま次の未読文字または行復習へ進める。
- `CHANGE_LEARNING_MODE` で `readingWriting → reading` に変わり現在が書字段階なら、書字を終了して次の読みへ進める。逆方向では過去文字へ戻らない。

---

### Task 1: schema v2の型とv1保存移行

**Files:**
- Modify: `src/features/learning/model/types.ts`
- Modify: `src/features/learning/model/reducer.ts`
- Modify: `src/platform/storage/repairProgress.ts`
- Modify: `src/platform/storage/repairProgress.test.ts`
- Modify: `src/platform/storage/IndexedDbProgressRepository.test.ts`
- Modify: `src/test/fixtures/progress.ts`

**Interfaces:**
- Produces: `LearningMode`、`WritingStage`、schema v2の `LearningProgress`、v1→v2 migration。
- Consumes: v1の `completedOnce`、既存stage、段階別書字フラグ、単語の `arranged` / `writingTried`。

- [ ] **Step 1: v2初期値とv1移行の失敗テストを書く**

追加する主要ケース:

```ts
it("新規進捗はschema v2の読みモードで始まる", () => {
  const progress = createInitialProgress();
  expect(progress.schemaVersion).toBe(2);
  expect(progress.settings.learningMode).toBe("reading");
  expect(progress.kana["あ"]).toMatchObject({ readCompleted: false, writingCompleted: false });
});

it("v1の書字途中を読み書きモードの同じ段階へ移行する", () => {
  const repaired = repairProgress(v1WritingFixture);
  expect(repaired.settings.learningMode).toBe("readingWriting");
  expect(repaired.stage).toBe("traceNarrow");
  expect(repaired.kana["あ"]).toMatchObject({
    readCompleted: true,
    traceWideTried: true,
    writingCompleted: false,
  });
});
```

このほか、v1未完、v1全完了、v2正常、不正mode、保存不能fallbackを固定する。旧fixtureの `completedOnce` 期待はv1入力専用に閉じ込める。

- [ ] **Step 2: 対象テストがREDになることを確認する**

Run:

```bash
docker compose run --rm app npm test -- --run src/platform/storage/repairProgress.test.ts src/platform/storage/IndexedDbProgressRepository.test.ts src/features/learning/model/reducer.test.ts --maxWorkers=1
```

Expected: schemaVersion、learningMode、readCompletedが未定義でFAIL。

- [ ] **Step 3: 型と初期値をv2へ変更する**

`types.ts` に `LearningMode` / `WritingStage` を追加し、`completedOnce` を公開v2型から除く。イベントunionへ次を追加する。

```ts
| { readonly type: "DEFER_WRITING" }
| { readonly type: "CHANGE_LEARNING_MODE"; readonly mode: LearningMode }
```

`createInitialProgress()` はschema 2、`learningMode: "reading"`、全文字・全単語の読み書き達成falseを生成する。

- [ ] **Step 4: repairProgressをv1/v2分岐にする**

v1の変換規則:

```text
learningMode       = readingWriting
kana.readCompleted = completedOnce || shapeMatched
kana.writingCompleted = traceWideTried && traceNarrowTried && copyTried && freeWriteTried
word.readCompleted = arranged
word.writingCompleted = writingTried
```

v1で書字途中なら、最初の未読文字へ正規化する前に保存済みindex/stageを維持する。v2の不正modeだけは `reading`、不正なbooleanだけはfalseへ部分修復する。単語prefixは `readCompleted` を基準にする。

- [ ] **Step 5: fixturesとrepository期待値をv2へ更新する**

`createProgressFixture()` は省略値としてschema 2 / readingを生成し、必要なテストだけ `learningMode` を上書きできるようにする。Repositoryのround-tripは読み・書きフィールドを両方保持することを検証する。

- [ ] **Step 6: 対象品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/platform/storage/repairProgress.test.ts src/platform/storage/IndexedDbProgressRepository.test.ts src/features/learning/model/reducer.test.ts --maxWorkers=1
docker compose run --rm app npm run typecheck
```

Expected: 対象テストと型チェックがPASS。

- [ ] **Step 7: Task 1をコミットする**

```bash
git add src/features/learning/model/types.ts src/features/learning/model/reducer.ts src/platform/storage/repairProgress.ts src/platform/storage/repairProgress.test.ts src/platform/storage/IndexedDbProgressRepository.test.ts src/test/fixtures/progress.ts
git commit -m "読み書き進捗を保存形式v2へ移行"
```

---

### Task 2: 文字のモード別状態遷移とpure helper

**Files:**
- Create: `src/features/learning/model/writingProgress.ts`
- Create: `src/features/learning/model/writingProgress.test.ts`
- Modify: `src/features/learning/model/reducer.ts`
- Modify: `src/features/learning/model/reducer.test.ts`
- Modify: `src/features/learning/model/selectors.ts`

**Interfaces:**

```ts
/** stageが4段階書字のいずれかかを判定する。 */
export function isWritingStage(stage: LessonStage): stage is WritingStage;

/** 最初に未体験の書字段階を返す。全完了ならnull。 */
export function firstIncompleteWritingStage(progress: KanaProgress): WritingStage | null;

/** モードと文字実績から花タップ時の開始stageを決める。 */
export function selectKanaReviewStage(
  progress: LearningProgress,
  character: KanaCharacter,
): LessonStage;

/** 復習書字の実績だけを本線へ反映し、カーソルを保持する。 */
export function mergeKanaWritingPractice(
  progress: LearningProgress,
  character: KanaCharacter,
  reviewed: KanaProgress,
): LearningProgress;
```

- [ ] **Step 1: pure helperとReducerのモード境界テストを書く**

固定する表:

| 状態 | 操作 | 期待 |
|---|---|---|
| reading / shapeMatch | 正解 | readCompleted=true, reward |
| reading / reward | つぎへ | 次の未読文字 |
| readingWriting / reward / 書字0段階 | つぎへ | traceWide |
| readingWriting / reward / traceWide済 | つぎへ | traceNarrow |
| readingWriting / 任意書字段階 | あとで | 次の未読文字、既存フラグ保持 |
| readingWriting / freeWrite完了 | 完了 | writingCompleted=true, reward |
| writing中 | readingへ変更 | 次の未読文字、既存フラグ保持 |
| readingからreadingWritingへ変更 | 変更 | 現在の未読文字を維持 |

行末の「あ行→行復習」と最終「ん→wordGarden」も同じ表で回帰させる。

- [ ] **Step 2: REDを確認する**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/learning/model/writingProgress.test.ts src/features/learning/model/reducer.test.ts --maxWorkers=1
```

Expected: helper importまたは新しい遷移期待でFAIL。

- [ ] **Step 3: writingProgress helperを実装する**

書字フラグ対応は一か所へ固定する。

```ts
const WRITING_STAGES = ["traceWide", "traceNarrow", "copyWithModel", "freeWrite"] as const;

const STAGE_FLAG = {
  traceWide: "traceWideTried",
  traceNarrow: "traceNarrowTried",
  copyWithModel: "copyTried",
  freeWrite: "freeWriteTried",
} as const;
```

`mergeKanaWritingPractice` は `traceWideTried`、`traceNarrowTried`、`copyTried`、`freeWriteTried`、`writingCompleted` だけをマージし、readCompleted、currentKanaIndex、stage、rowReview、words、settingsを変更しない。

- [ ] **Step 4: Reducer遷移を読み達成基準へ変える**

旧 `continueAfterReward` を「rewardから書字へ」または「読み完了後の次課題へ」の2責務に分ける。`DEFER_WRITING` は書字段階以外でno-op、`CHANGE_LEARNING_MODE` は同値ならidentityを返す。

- [ ] **Step 5: selectorをreadCompleted基準へ変える**

- 全46文字の単語解放
- 次の未読文字
- 行完了
- 次の未読単語

すべてを `readCompleted` に統一し、writingCompletedを条件へ混ぜない。

- [ ] **Step 6: 対象品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/learning/model/writingProgress.test.ts src/features/learning/model/reducer.test.ts src/features/learning/content/words.test.ts --maxWorkers=1
docker compose run --rm app npm run typecheck
```

Expected: 全境界がPASS。

- [ ] **Step 7: Task 2をコミットする**

```bash
git add src/features/learning/model/writingProgress.ts src/features/learning/model/writingProgress.test.ts src/features/learning/model/reducer.ts src/features/learning/model/reducer.test.ts src/features/learning/model/selectors.ts
git commit -m "読み達成を基準に文字コースを分岐"
```

---

### Task 3: Appのモード変更と復習書字の限定保存

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/test/renderApp.tsx`

**Interfaces:**
- Consumes: `CHANGE_LEARNING_MODE`、`selectKanaReviewStage`、`mergeKanaWritingPractice`。
- Produces: 保護者設定の即時反映、未完書字への復習入口、本線を動かさない復習書字保存。

- [ ] **Step 1: App統合の失敗テストを書く**

主要ケース:

```ts
it("読みモードの花タップは導入から復習する", async () => { /* introを表示 */ });
it("読み書きモードの未完書字花は最初の未完段階から開く", async () => { /* traceNarrow */ });
it("復習書字完了は書字実績だけを保存する", async () => {
  // currentKanaIndex / stage / rowReview / word進捗が不変
});
it("書字中に読みモードへ変えると次の未読文字へ正規化する", async () => { /* 保存queueも検証 */ });
it("reset中の設定変更は既存どおり無視する", async () => { /* 競合回帰 */ });
```

- [ ] **Step 2: REDを確認する**

Run:

```bash
docker compose run --rm app npm test -- --run src/app/App.test.tsx --maxWorkers=1
```

- [ ] **Step 3: 設定変更をReducerイベントへ接続する**

`changeSettings` の `learningMode` 変更だけは `CHANGE_LEARNING_MODE` をdispatchし、audio/effects/reducedMotionの既存適用と保存queueを壊さない。リセット世代管理とreset失敗時の再保存も維持する。

- [ ] **Step 4: beginReviewをモード対応にする**

`selectKanaReviewStage` が返すstageでephemeral `reviewState` を作る。読み復習は従来どおり本線へ保存しない。未完書字復習は各書字段階の結果だけreviewStateへ蓄積し、完了時に `mergeKanaWritingPractice` で本線へ保存する。「あとで」は部分書字をマージして庭へ戻る。

- [ ] **Step 5: reward遷移を画面ルートと分離する**

`CONTINUE` 後もReducerがlesson内の書字段階を返した場合はlessonを維持し、次文字・行復習・庭・wordGardenへ進んだ時だけ `screenForRoute` を適用する。

- [ ] **Step 6: 対象品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/app/App.test.tsx src/features/learning/model/writingProgress.test.ts --maxWorkers=1
docker compose run --rm app npm run typecheck
```

- [ ] **Step 7: Task 3をコミットする**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/test/renderApp.tsx
git commit -m "学び方変更と復習書字の保存を接続"
```

---

### Task 4: 文字レッスン・庭・保護者UI

**Files:**
- Modify: `src/features/lesson/LessonScreen.tsx`
- Modify: `src/features/lesson/LessonScreen.css`
- Modify: `src/features/lesson/LessonScreen.test.tsx`
- Modify: `src/features/lesson/WritingStep.tsx`
- Modify: `src/features/lesson/RewardStep.tsx`
- Modify: `src/features/garden/GardenScreen.tsx`
- Modify: `src/features/garden/GardenScreen.css`
- Modify: `src/features/garden/GardenScreen.test.tsx`
- Modify: `src/features/garden/KanaFlower.tsx`
- Modify: `src/features/parent/ParentDashboard.tsx`
- Modify: `src/features/parent/ParentDashboard.css`
- Modify: `src/features/parent/ParentDashboard.test.tsx`
- Modify: `src/features/lesson/layoutMetrics.ts`
- Modify: `src/features/lesson/layoutMetrics.test.ts`

**Interfaces:**
- `LessonScreen` receives mode-aware callbacks without deciding persistence.
- `WritingStep` receives `onDefer` for all four stages.
- `KanaFlower` receives `writingCompleted` and renders a decorative pencil badge without shrinking its button.

- [ ] **Step 1: UI契約の失敗テストを書く**

固定する項目:

- 保護者設定にradio group「まなびかた」と2択説明文がある。
- 現在値がchecked、変更時に `learningMode` を含むsettingsを通知する。
- 表の見出しは「よめた」「かいた」で、真偽を別表示する。
- 4つすべての書字段階に「あとで」があり、押すと `onDefer` が一度だけ呼ばれる。
- 後回しボタンのruntime heightは64px以上、カード四辺内へ収まる。
- `writingCompleted` の花だけ鉛筆印があり、aria-labelは文字と読めた／書いた状態を伝える。
- reward CTAは読み書き未完なら「かいてみよう」、それ以外は「じょうろで つぎへ」。

- [ ] **Step 2: REDを確認する**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/parent/ParentDashboard.test.tsx src/features/garden/GardenScreen.test.tsx src/features/lesson/LessonScreen.test.tsx src/features/lesson/layoutMetrics.test.ts --maxWorkers=1
```

- [ ] **Step 3: 保護者のradioと進捗表を実装する**

radioのラベル:

```text
よむ（おすすめ）
まずは もじを みて おぼえる

よむ・かく
よんだあと ゆびで かく
```

fieldset / legendで意味を束ね、各label全体を48px以上の操作面にする。説明文と選択肢は背景が透けないクリーム紙カードへ収める。

- [ ] **Step 4: 花と鉛筆印を実装する**

花buttonを基準に鉛筆badgeを右下へanchorし、文字・花弁・タップ領域へ重ねない。`prefers-reduced-motion` と設定のreducedMotionでは鉛筆印を静的表示にする。

- [ ] **Step 5: 全書字段階の「あとで」を実装する**

`WritingStep` に `onDefer` を必須化し、既存のfreeWrite専用skipを置き換える。カードは固定高さで押し込まず、canvas領域、gap、64px副操作の実寸から収まる高さを決める。Canvasのガイドscale、採点、30fps制御は変更しない。

- [ ] **Step 6: rewardの文言と正解演出をモード対応にする**

形合わせ、各書字段階の既存成功演出を維持する。読み花の次が書字なら「かいてみよう」、書字完了またはreadingなら「じょうろで つぎへ」を表示し、実際の次操作と文言を一致させる。

- [ ] **Step 7: 対象品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/parent/ParentDashboard.test.tsx src/features/garden/GardenScreen.test.tsx src/features/lesson/LessonScreen.test.tsx src/features/lesson/layoutMetrics.test.ts --maxWorkers=1
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
```

- [ ] **Step 8: Task 4をコミットする**

```bash
git add src/features/lesson src/features/garden src/features/parent
git commit -m "学び方設定と書字のあとで導線を追加"
```

---

### Task 5: 単語コースの読み・書き分離

**Files:**
- Modify: `src/features/learning/model/reducer.ts`
- Modify: `src/features/learning/model/reducer.test.ts`
- Modify: `src/features/words/WordGardenScreen.tsx`
- Modify: `src/features/words/WordGardenScreen.test.tsx`
- Modify: `src/features/words/WordLessonScreen.tsx`
- Modify: `src/features/words/WordLessonScreen.test.tsx`
- Modify: `src/features/words/WordWritingStep.tsx`
- Modify: `src/features/words/WordWritingStep.test.tsx`
- Modify: `src/features/words/WordLesson.css`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- `COMPLETE_WORD_ARRANGE` sets `readCompleted=true`.
- `COMPLETE_WORD_WRITING` sets `writingTried=true` and `writingCompleted=true` without changing which word is unlocked.
- `WordLessonScreen` receives `learningMode` and `onDeferred(wordId)`.

- [ ] **Step 1: 単語境界の失敗テストを書く**

ケース:

| mode | 状態 | 期待 |
|---|---|---|
| reading | arrange完了 | 単語の花、次の未読単語を解放、書字なし |
| readingWriting | arrange完了 | 読み花の後に書字へ進める |
| readingWriting | 書字であとで | readCompletedを保ち次語へ進める |
| readingWriting | 未完書字の花タップ | 単語書字から再開 |
| any | 復習書字完了 | 対象語のwritingだけ保存、本線の次語不変 |
| any | 60語すべてreadCompleted | ことばの庭へ戻れる完了表示 |

- [ ] **Step 2: REDを確認する**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/learning/model/reducer.test.ts src/features/words/WordGardenScreen.test.tsx src/features/words/WordLessonScreen.test.tsx src/features/words/WordWritingStep.test.tsx src/app/App.test.tsx --maxWorkers=1
```

- [ ] **Step 3: 単語ReducerをreadCompleted基準へ変える**

`findNextWordId` と解放条件はwritingを参照しない。`COMPLETE_WORD_WRITING` はreadCompleted済みの語だけ更新可能にし、未解放語への直接イベントはno-opを維持する。

- [ ] **Step 4: WordLessonScreenをmode対応にする**

readingではchoice→arrange→単語の花で終了する。readingWritingでは読み花を成立させた後にwritingへ進め、writingの「あとで」でAppへ戻す。画面local stateは保存済みprogressから再構成できる範囲に限定する。

- [ ] **Step 5: 単語花の復習書字を保存する**

word review modeでも未完書字ならwritingから開始し、完了時は対象wordのwriting fieldsだけ本線へ反映する。choice/arrangeの通常復習は本線を書き換えない。

- [ ] **Step 6: 単語書字の64px「あとで」と境界を実装する**

最長語でも書字canvas、進行表示、完了／あとでの各操作がカード内へ収まるよう、既存tile auto-fitを維持しつつactionsの実寸からレイアウトする。

- [ ] **Step 7: 対象品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/learning/model/reducer.test.ts src/features/words/WordGardenScreen.test.tsx src/features/words/WordLessonScreen.test.tsx src/features/words/WordWritingStep.test.tsx src/app/App.test.tsx --maxWorkers=1
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
```

- [ ] **Step 8: Task 5をコミットする**

```bash
git add src/features/learning/model/reducer.ts src/features/learning/model/reducer.test.ts src/features/words src/app/App.tsx src/app/App.test.tsx
git commit -m "単語コースの読みと書字を分離"
```

---

### Task 6: 文書同期・全品質ゲート・実ブラウザ検証

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/specs/2026-08-12-reading-writing-modes-design.md` only if implementation reveals an approved wording clarification; do not silently change requirements.
- Create locally/ignored: `test-results/reading-writing-modes/`

- [ ] **Step 1: READMEとCHANGELOGを更新する**

READMEの操作方法に保護者設定の「まなびかた」、花／鉛筆印、「あとで」、v1自動移行を追記する。CHANGELOGへschema v2とユーザー体験の変更を記録する。

- [ ] **Step 2: 古い完了条件の参照残りを検査する**

Run locally (read-only):

```bash
rg -n "completedOnce|schemaVersion:\s*1|words.*writingTried.*unlock" src README.md docs
```

Expected: `completedOnce` はv1 migration fixture/型ガードだけ、schema 1はmigration testだけに残る。

- [ ] **Step 3: Dockerの全品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run --maxWorkers=1
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
docker compose run --rm app npm run verify:content
docker compose run --rm app npm run verify:images
docker compose run --rm -e BASE_PATH=/hiraganaStudy/ app npm run build:pages
```

Expected: 全コマンドexit 0。既存94教材画像・音声・PWA成果物の検証も維持する。

- [ ] **Step 4: cache-bustingした実ブラウザで3 viewportを撮る**

Docker内dev/preview serverとPlaywright clientを使い、service worker/cacheを削除してから次を取得する。

```text
390x844  : 保護者のradio、文字traceWideのあとで、読み花＋鉛筆印
844x390  : 文字freeWriteのあとで、単語書字のあとで
820x1180 : 保護者表、文字の庭、ことばの庭
```

各画面で画像decodeとCanvas paint readinessを待つ。スクリーンショットは `test-results/reading-writing-modes/` へ保存する。

- [ ] **Step 5: ランタイム境界を数値確認する**

viewportごとに以下をJSONへ記録する。

- radio labelが親カード四辺内
- 「あとで」button height >= 64
- 書字canvas / actionsがwriting card四辺内
- pencil badgeがflower button四辺内かつ文字bboxと非重複
- header / guide / lesson cardのgap >= 8
- 横画面で主要CTAがviewport内

- [ ] **Step 6: スクリーンショットを原寸目視する**

コード上の期待ではなく、画像自体を開いて次を確認する。

- 背景と案内札が混ざらない
- 花、文字、鉛筆印の意味が一目で分かる
- 「あとで」と家ボタンが別操作に見える
- 書字枠が指で書ける余白を維持している
- 390px幅と横画面で文言が不自然に分断されない
- 単語最長語でもボタンやtileが欠けない

- [ ] **Step 7: 差分と秘密情報を確認する**

Run locally:

```bash
git diff --check
git status --short
git diff --stat
```

公開前には `pre-push-security-check` を別途実行する。ignoredのスクリーンショットや一時capture scriptをコミットしない。

- [ ] **Step 8: Task 6をコミットする**

```bash
git add README.md CHANGELOG.md
git commit -m "読み書きモードの利用方法を文書化"
```

- [ ] **Step 9: 公開前ゲートへ進む**

全検証結果、変更コミット、未解決リスク、公開対象branchをユーザーへ提示する。push / deployは実行せず、明示許可を待つ。

## 受け入れ条件トレーサビリティ

| 設計要件 | 主な実装Task | 自動検証 |
|---|---|---|
| REQ-001 読み／書字別保存 | 1, 2 | repair/reducer tests |
| REQ-002/003 設定と新規reading | 1, 4 | reducer/Parent tests |
| REQ-004 v1はreadingWriting | 1 | repair/repository tests |
| REQ-005 花・次文字・単語解放 | 2, 5 | reducer/selectors/App tests |
| REQ-006 全書字のあとで | 2, 4, 5 | Lesson/Word tests + runtime metrics |
| REQ-007 途中切替で保持 | 2, 3 | reducer/App tests |
| REQ-008 花から復習書字 | 2, 3, 5 | helper/App/Word tests |
| REQ-009 単語も分離 | 5 | reducer/Word/App tests |
| REQ-010 正解演出維持 | 4, 5 | Lesson/SuccessBloom/Word tests |
| REQ-011 戻る・音声・30fps維持 | 4, 6 | existing regression + browser validation |

## 非対象

- 筆跡の上手さや習得度を判定する新しい採点
- 誤答率や年齢からの自動モード変更
- 複数の子どもプロフィール
- 完了済み書字の反復専用ドリル
- 庭を読み／書きで分割する大規模な画面再設計

## リスクと対策

- v1書字途中を未読探索が飛ばす: migrationでactive writing stageを先に保護する。
- reward再利用で無限ループする: `writingCompleted` と `firstIncompleteWritingStage` をpure helperで一意にし、read reward / write rewardを表形式テストする。
- 復習が本線を巻き戻す: 書字5フィールドだけをmergeするhelperを単体テストする。
- mode変更とreset/saveが競合する: 既存generation queueの成功・失敗回帰をApp testに残す。
- UI追加で書字面が狭くなる: 固定高さを避け、64px操作を含む子要素実寸と3 viewportの境界値で検証する。
- 単語の読み花後に書字が再び必須化する: 次語解放selectorからwritingを完全に除外する。

## 性能目標

- mode判定、migration、次課題選択は同期pure処理とし、ネットワークアクセスを追加しない。
- Canvasの30fps上限、Pointer Events、DPR対応、採点閾値を維持する。
- 保存は既存の端末内JSON一件をschema v2へ拡張するだけとし、追加データベースや分析送信を導入しない。
- mode変更から表示更新まで既存React同期更新範囲に収め、体感待ちを追加しない。
