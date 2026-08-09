# 「ひらがなのにわ」完成版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文字をまだ読めない3歳児が、五十音順に基本46文字の読み書きを体験し、完了後に60語以上の単語へ進める静的PWAを完成させる。

**Architecture:** Reactの画面層から、純粋な学習状態機械、型付きコンテンツ、書字エンジン、音声、端末保存を分離する。通常UIはHTML、書字面だけCanvas 2Dを使い、全ブラウザAPIをアダプターへ閉じ込める。GitHub Pagesのサブパスとオフライン再起動に対応する。

**Tech Stack:** React、TypeScript、Vite、CSS、Canvas 2D、IndexedDB、Web Speech API、vite-plugin-pwa、Vitest、Testing Library、Playwright client、Docker Compose。

## Global Constraints

- 開発サーバー、依存インストール、テスト、型チェック、ビルドはすべてDockerコンテナ内で実行する。
- ローカルではファイル編集、Git、生成画像の目視確認だけを行う。
- 基本46文字は「あ」から「ん」まで五十音順に1文字ずつ進める。
- 46文字すべてが `completedOnce` になるまで単語問題を解放しない。
- 形合わせの問題側には対象文字とイラストを表示し、選択肢には文字だけを表示する。
- 同じ形の選択、音からの選択、なぞり、見本書き、補助なし書きを別状態として記録する。
- 書字精度が低くても次の文字を永久にロックしない。
- 完成版には全46文字、60語以上、音声、端末保存、保護者画面、PWA、GitHub Pages用ビルドを含め、仮画像や仮音声を残さない。
- 書字中は30fps以上、タッチから軌跡表示まで50ms以内を目標とする。
- 主要タッチ対象は64 CSS px以上、補助操作は48 CSS px以上とする。
- スマートフォン `390x844`、`844x390`、タブレット `820x1180`、`1180x820` を代表viewportとする。
- ランキング、時間制限、ゲームオーバー、広告、分析、アカウント、外部ランタイム画像サービスを追加しない。
- 公開関数、公開型、主要コンポーネントには意図・前提・副作用が分かる短いTSDocを付ける。
- コミットメッセージは日本語にする。
- GitHubへのpushとGitHub Pages公開は、完成検証後にユーザーへ最終確認してから行う。

---

## File Structure

```text
.
├── .github/workflows/deploy-pages.yml       # GitHub Pagesのbuild/deploy
├── compose.yaml                             # 唯一の開発実行入口
├── package.json / package-lock.json         # 固定依存とnpm scripts
├── vite.config.ts                           # 動的base pathとPWA
├── README.md / CHANGELOG.md                  # 利用・開発・公開手順
├── THIRD_PARTY_NOTICES.md                    # 書字データの帰属
├── public/
│   ├── assets/illustrations/                 # 完成版イラストWebP
│   ├── assets/sfx/                           # 完成版効果音
│   ├── icons/                                # PWAアイコン
│   └── licenses/fude-kana-data/              # CC BY-SA 3.0原文とNOTICE
├── scripts/
│   ├── import-kana-strokes.mjs               # pin済み書字点列の変換
│   ├── optimize-images.mjs                   # 生成画像のWebP化
│   └── verify-content.mjs                    # 文字・単語・アセット整合
├── src/
│   ├── main.tsx                              # React起動のみ
│   ├── app/App.tsx                           # 画面ルートの組み立て
│   ├── app/GameRuntime.ts                    # 保存・音声・時計の依存注入
│   ├── styles/tokens.css                     # 世界観のデザイントークン
│   ├── styles/global.css                     # safe-areaと全体レイアウト
│   ├── features/learning/
│   │   ├── content/types.ts                  # KanaEntry / WordEntry
│   │   ├── content/kana.ts                   # 46文字の固定定義
│   │   ├── content/words.ts                  # 60語以上の固定定義
│   │   ├── content/validateContent.ts        # 完全性検証
│   │   ├── model/types.ts                    # LessonState / Progress
│   │   ├── model/reducer.ts                  # 純粋な状態遷移
│   │   └── model/selectors.ts                # 次の文字・解放判定
│   ├── features/lesson/                      # 導入・選択・報酬UI
│   ├── features/writing/
│   │   ├── data/generated/                   # CC BY-SAの基本46＋単語用20文字点列
│   │   ├── geometry.ts                       # 点列正規化・距離
│   │   ├── scoreStroke.ts                    # 緩やかな書字評価
│   │   └── WritingCanvas.tsx                 # Canvas入力とガイド描画
│   ├── features/garden/                      # ホームと文字花
│   ├── features/parent/                      # 保護者ゲートと状況画面
│   ├── features/words/                       # 単語選択・並べ・書字UI
│   ├── platform/audio/                       # Web Speech / 効果音アダプター
│   ├── platform/storage/                     # IndexedDBと復旧
│   ├── platform/pwa/                         # 更新状態表示
│   └── test/                                 # 共通test setupとfixture
└── tests/game/
    ├── scenarios/                            # Playwright client入力JSON
    └── assertions/                           # DOM境界・state確認script
```

---

### Task 1: Docker開発基盤とアプリシェル

**Files:**
- Create: `compose.yaml`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `eslint.config.js`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `App(): JSX.Element`、Docker内の `dev/preview/test/typecheck/lint/build` scripts、共通CSSトークン。

- [ ] **Step 1: Docker Composeと最小package scriptsを作る**

```yaml
# compose.yaml
services:
  app:
    image: node:22-bookworm-slim
    working_dir: /workspace
    ports:
      - "5173:5173"
      - "4173:4173"
    environment:
      PLAYWRIGHT_BROWSERS_PATH: /ms-playwright
    volumes:
      - .:/workspace
      - node_modules:/workspace/node_modules
      - playwright_browsers:/ms-playwright
    command: npm run dev -- --host 0.0.0.0

volumes:
  node_modules:
  playwright_browsers:
```

`package.json` のscriptsは `dev`、`preview`、`build`、`test`、`typecheck`、`lint`、`verify:content` を持たせる。

- [ ] **Step 2: 依存をDocker内でインストールする**

Run:

```bash
docker compose run --rm app npm install react react-dom idb
docker compose run --rm app npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event eslint @eslint/js typescript-eslint fake-indexeddb vite-plugin-pwa playwright sharp
```

Expected: `package-lock.json` が作られ、ホストに `node_modules` が生成されない。

- [ ] **Step 3: 失敗するシェルテストを書く**

```tsx
it("初回は音声確認を一つだけ表示する", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: "こえを きく" })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
```

- [ ] **Step 4: テストが失敗することを確認する**

Run: `docker compose run --rm app npm test -- --run src/app/App.test.tsx`

Expected: `こえを きく` が見つからずFAIL。

- [ ] **Step 5: Appと世界観トークンを最小実装する**

```tsx
/** 初回音声確認から学習画面へ接続するアプリルート。 */
export function App(): JSX.Element {
  return (
    <main className="app-shell">
      <button className="sound-gate" aria-label="こえを きく">🔊</button>
    </main>
  );
}
```

`tokens.css` に藍色文字、クリーム紙、空、草、成功、64px主要タッチ寸法、48px補助寸法、16px外周余白をCSS custom propertiesとして定義する。

- [ ] **Step 6: 最小品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
docker compose run --rm app npm run build
```

Expected: すべてexit 0、`dist/index.html` が生成される。

- [ ] **Step 7: コミットする**

```bash
git add compose.yaml package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.app.json eslint.config.js src
git commit -m "開発基盤と初回画面を追加"
```

---

### Task 2: 46文字の型付きコンテンツ

**Files:**
- Create: `src/features/learning/content/types.ts`
- Create: `src/features/learning/content/kana.ts`
- Create: `src/features/learning/content/validateContent.ts`
- Test: `src/features/learning/content/kana.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `KANA_ORDER: readonly KanaCharacter[]`、`KANA_ENTRIES: readonly KanaEntry[]`、`KanaEntry`、`WordEntry`、`findKana(character)`、`validateKanaEntries(entries): ContentIssue[]`。

- [ ] **Step 1: 公開型と失敗する完全性テストを書く**

```ts
export const KANA_ORDER = [
  "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
  "る", "れ", "ろ", "わ", "を", "ん",
] as const;

export type KanaCharacter = (typeof KANA_ORDER)[number];

export interface KanaEntry {
  readonly character: KanaCharacter;
  readonly illustrationKey: string;
  readonly spokenLabel: string;
  readonly row: "a" | "ka" | "sa" | "ta" | "na" | "ha" | "ma" | "ya" | "ra" | "wa";
  readonly distractors: readonly KanaCharacter[];
  readonly specialUsage?: "particle" | "wordEnding";
}

export type WordStage = "W1" | "W2" | "W3" | "W4" | "W5";

export interface WordEntry {
  readonly id: string;
  readonly text: string;
  readonly stage: WordStage;
  readonly spokenLabel: string;
  readonly illustrationKey: string;
  readonly writingCells: readonly string[];
}

export interface ContentIssue {
  readonly code: "kana-count" | "kana-order" | "invalid-distractors" | "invalid-word-stage" | "missing-asset" | "missing-stroke";
  readonly item?: string;
}
```

```ts
it("設計順どおり46文字を重複なく持つ", () => {
  expect(KANA_ENTRIES.map(({ character }) => character)).toEqual(KANA_ORDER);
  expect(new Set(KANA_ENTRIES.map(({ illustrationKey }) => illustrationKey)).size).toBe(46);
});

it("をとんは頭文字として偽装しない", () => {
  expect(findKana("を").specialUsage).toBe("particle");
  expect(findKana("ん").specialUsage).toBe("wordEnding");
});
```

- [ ] **Step 2: テストが未定義で失敗することを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/learning/content/kana.test.ts`

Expected: `KANA_ENTRIES` または `findKana` が未定義でFAIL。

- [ ] **Step 3: 設計書の46組をデータ化する**

`あ: あひる` から `わ: わに` までをそのまま登録し、`を` は「りんごを たべる」、`ん` は「ぱんの さいごの、ん」とする。`illustrationKey` は `kana-a-duck` のようなASCII slugへ固定する。候補文字は初回用の字形差が大きい2文字を先頭にし、似た字形を末尾に持たせる。

- [ ] **Step 4: 内容検証を実装する**

```ts
/** 文字順、重複、選択肢、特殊用法の欠落を機械検査する。 */
export function validateKanaEntries(entries: readonly KanaEntry[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (entries.length !== KANA_ORDER.length) issues.push({ code: "kana-count" });
  if (entries.map((item) => item.character).join("") !== KANA_ORDER.join("")) {
    issues.push({ code: "kana-order" });
  }
  for (const entry of entries) {
    if (entry.distractors.length < 2 || entry.distractors.includes(entry.character)) {
      issues.push({ code: "invalid-distractors", item: entry.character });
    }
  }
  return issues;
}
```

- [ ] **Step 5: テスト、型、内容検証を通す**

Run: `docker compose run --rm app npm test -- --run src/features/learning/content/kana.test.ts`

Expected: PASS、46文字、順序、特殊用法にissueなし。

- [ ] **Step 6: コミットする**

```bash
git add src/features/learning/content
git commit -m "五十音46文字の教材定義を追加"
```

---

### Task 3: 学習状態機械と単語解放条件

**Files:**
- Create: `src/features/learning/model/types.ts`
- Create: `src/features/learning/model/reducer.ts`
- Create: `src/features/learning/model/selectors.ts`
- Create: `src/test/fixtures/progress.ts`
- Test: `src/features/learning/model/reducer.test.ts`

**Interfaces:**
- Consumes: `KanaCharacter`、`KANA_ORDER`。
- Produces: `createInitialProgress()`、`reduceLesson(state, event)`、`selectRoute(progress)`、`isWordGardenUnlocked(progress)`。

`src/test/fixtures/progress.ts` は `stateAt(character, stage)`、`progressAt(character, stage)`、`progressWithCompletedCount(count)` を公開する。

- [ ] **Step 1: 状態型と失敗する固定順テストを書く**

```ts
export type LessonStage =
  | "intro" | "shapeMatch" | "soundMatch" | "traceWide" | "traceNarrow"
  | "copyWithModel" | "freeWrite" | "reward";

export interface KanaProgress {
  readonly seen: boolean;
  readonly shapeMatched: boolean;
  readonly soundMatched: boolean;
  readonly traceWideTried: boolean;
  readonly traceNarrowTried: boolean;
  readonly copyTried: boolean;
  readonly freeWriteTried: boolean;
  readonly completedOnce: boolean;
  readonly guideCount: number;
}

export interface WordProgress {
  readonly selected: boolean;
  readonly arranged: boolean;
  readonly writingTried: boolean;
}

export interface LearningProgress {
  readonly schemaVersion: 1;
  readonly currentKanaIndex: number;
  readonly stage: LessonStage;
  readonly rowReview: null | { readonly row: KanaEntry["row"]; readonly step: "shape" | "sound" };
  readonly kana: Readonly<Record<KanaCharacter, KanaProgress>>;
  readonly words: Readonly<Record<string, WordProgress>>;
  readonly settings: {
    readonly speech: boolean;
    readonly music: boolean;
    readonly effects: boolean;
    readonly reducedMotion: boolean;
  };
}

export interface LearningState {
  readonly progress: LearningProgress;
  readonly currentKana: KanaCharacter;
  readonly stage: LessonStage;
}

export type LessonEvent =
  | { readonly type: "START" }
  | { readonly type: "ANSWER_SHAPE"; readonly correct: boolean }
  | { readonly type: "ANSWER_SOUND"; readonly correct: boolean }
  | { readonly type: "COMPLETE_TRACE"; readonly width: "wide" | "narrow" }
  | { readonly type: "COMPLETE_COPY" }
  | { readonly type: "COMPLETE_FREE_WRITE" }
  | { readonly type: "SKIP_FREE_WRITE" }
  | { readonly type: "CONTINUE" }
  | { readonly type: "RESUME"; readonly progress: LearningProgress };

export type LearningRoute =
  | { readonly kind: "soundGate" }
  | { readonly kind: "garden" }
  | { readonly kind: "kanaLesson"; readonly character: KanaCharacter }
  | { readonly kind: "rowReview"; readonly row: KanaEntry["row"] }
  | { readonly kind: "wordGarden" };
```

```ts
it("あの報酬完了後は必ずいへ進む", () => {
  const result = reduceLesson(stateAt("あ", "reward"), { type: "CONTINUE" });
  expect(result.currentKana).toBe("い");
  expect(result.stage).toBe("intro");
});

it("45文字完了では単語を解放しない", () => {
  expect(isWordGardenUnlocked(progressWithCompletedCount(45))).toBe(false);
  expect(isWordGardenUnlocked(progressWithCompletedCount(46))).toBe(true);
});
```

- [ ] **Step 2: 未実装でテストが失敗することを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/learning/model/reducer.test.ts`

Expected: reducerとselector未定義でFAIL。

- [ ] **Step 3: 純粋reducerを実装する**

イベントは `START`、`ANSWER_SHAPE`、`ANSWER_SOUND`、`COMPLETE_TRACE`、`COMPLETE_COPY`、`COMPLETE_FREE_WRITE`、`SKIP_FREE_WRITE`、`CONTINUE`、`RESUME` に限定する。誤答では同じstageを保ち `guideCount` だけを増やし、3回目で正解候補を案内可能な状態へする。

- [ ] **Step 4: 行復習とルートselectorを実装する**

`selectRoute` は `soundGate`、`garden`、`kanaLesson`、`rowReview`、`wordGarden` のいずれかを返す。行末は `お/こ/そ/と/の/ほ/も/よ/ろ/ん` とし、行復習完了後だけ次の文字へ進む。

- [ ] **Step 5: reducer全分岐を通す**

Run: `docker compose run --rm app npm test -- --run src/features/learning/model`

Expected: 固定順、誤答補助、freeWriteの非ブロック、46文字ゲートがすべてPASS。

- [ ] **Step 6: コミットする**

```bash
git add src/features/learning/model
git commit -m "五十音の学習状態機械を追加"
```

---

### Task 4: 端末保存、移行、部分復旧

**Files:**
- Create: `src/platform/storage/ProgressRepository.ts`
- Create: `src/platform/storage/IndexedDbProgressRepository.ts`
- Create: `src/platform/storage/repairProgress.ts`
- Create: `src/app/GameRuntime.ts`
- Test: `src/platform/storage/IndexedDbProgressRepository.test.ts`
- Test: `src/platform/storage/repairProgress.test.ts`

**Interfaces:**
- Consumes: `LearningProgress`、`createInitialProgress()`。
- Produces: `ProgressRepository`、`createBrowserRuntime()`、`repairProgress(raw)`。

- [ ] **Step 1: repository契約と失敗する再読込テストを書く**

```ts
export interface ProgressRepository {
  load(): Promise<LearningProgress>;
  save(progress: LearningProgress): Promise<void>;
  reset(): Promise<void>;
}
```

```ts
it("保存した現在文字と段階を再読込できる", async () => {
  const repository = new IndexedDbProgressRepository("test-progress");
  await repository.save(progressAt("く", "traceNarrow"));
  expect(await repository.load()).toMatchObject({ currentKana: "く", stage: "traceNarrow" });
});
```

- [ ] **Step 2: 未実装でFAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/platform/storage`

Expected: repository未定義でFAIL。

- [ ] **Step 3: IndexedDB保存と代替保存を実装する**

DB名は `hiragana-no-niwa`、object storeは `progress`、keyは `active` とする。書込失敗時はサイズを抑えた進行データを `localStorage` の `hiragana-no-niwa:progress:v1` に保存し、ランタイムへ `storageDegraded: true` を返す。

- [ ] **Step 4: 部分復旧とスキーマ移行を実装する**

`schemaVersion: 1` を必須とし、文字単位で型不整合を検出する。正常な文字進行は保持し、壊れた文字だけ初期値へ戻す。生の筆跡、名前、年齢は保存型に含めない。

- [ ] **Step 5: 保存系テストを通す**

Run: `docker compose run --rm app npm test -- --run src/platform/storage`

Expected: 新規、再読込、代替保存、部分破損、全リセットがPASS。

- [ ] **Step 6: コミットする**

```bash
git add src/platform/storage src/app/GameRuntime.ts
git commit -m "学習記録の端末保存と復旧を追加"
```

---

### Task 5: 子ども向け日本語音声アダプター

**Files:**
- Create: `src/platform/audio/AudioGuide.ts`
- Create: `src/platform/audio/BrowserSpeechGuide.ts`
- Create: `src/platform/audio/SoundEffects.ts`
- Create: `scripts/generate-sfx.mjs`
- Create: `public/assets/sfx/tap.wav`
- Create: `public/assets/sfx/success.wav`
- Create: `public/assets/sfx/sprout.wav`
- Create: `public/assets/sfx/garden-loop.wav`
- Test: `src/platform/audio/BrowserSpeechGuide.test.ts`

**Interfaces:**
- Consumes: コンテンツの `spokenLabel`。
- Produces: `AudioGuide.unlock()`、`speak(message, options)`、`cancel()`、`getStatus()`。

- [ ] **Step 1: 音声契約と失敗するキュー試験を書く**

```ts
export interface AudioGuide {
  unlock(): Promise<"ready" | "visual-only">;
  speak(message: string, options?: { interrupt?: boolean; rate?: number }): Promise<void>;
  cancel(): void;
  getStatus(): "locked" | "ready" | "visual-only";
}
```

```ts
it("新しい案内は古い発話を中止して一つだけ再生する", async () => {
  await guide.speak("あひるの、あ");
  await guide.speak("おなじ かたちを みつけよう", { interrupt: true });
  expect(fakeSpeech.cancel).toHaveBeenCalledOnce();
  expect(fakeSpeech.spoken.at(-1)?.lang).toBe("ja-JP");
});
```

- [ ] **Step 2: FAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/platform/audio`

Expected: `BrowserSpeechGuide` 未定義でFAIL。

- [ ] **Step 3: voiceschanged対応と日本語音声選択を実装する**

`ja-JP` 完全一致、`ja` prefix、端末defaultの順で選ぶ。発話速度は初期値 `0.82`、音量は `1`、画面遷移時は必ず `cancel()` する。音声が得られない場合は例外にせず `visual-only` を返す。

- [ ] **Step 4: 完成版効果音と重なり制御を実装する**

`generate-sfx.mjs` は16bit PCMのWAVを生成する。効果音は44.1kHzとし、`tap` は523Hzのsine波45ms、`success` はC5/E5/G5を順に鳴らす420ms、`sprout` は330Hzから660Hzへ上がる280msとする。BGMは22.05kHz mono、12秒で、C4/G4/A4/F4の柔らかな2音コードを3秒ずつ鳴らし、先頭と末尾の波形を一致させた `garden-loop.wav` とする。全音に5ms以上のattackと末尾fadeを付け、peakを `-12dBFS` 以下へ抑える。

Run: `docker compose run --rm app node scripts/generate-sfx.mjs`

生成した3効果音と1ループBGMだけを静的音源として定義し、音声中は効果音gainを `0.35`、BGM gainを `0.2` に下げる。BGM、効果音、音声の設定は独立させる。BGMは完成版の初期値をオフとし、外部音源を追加しない。

- [ ] **Step 5: 音声試験を通す**

Run: `docker compose run --rm app npm test -- --run src/platform/audio`

Expected: lock解除、voice選択、割込、visual-only、設定反映がPASS。

- [ ] **Step 6: コミットする**

```bash
git add src/platform/audio scripts/generate-sfx.mjs public/assets/sfx
git commit -m "日本語音声案内と効果音制御を追加"
```

---

### Task 6: 基本46文字と単語用20文字の書き順データ取り込み

実装時補正（要件削除なし）:

| 状態 | 項目 | 理由 | 影響 |
| --- | --- | --- | --- |
| 追加 | 単語用書字文字に「ぽ」を追加 | 固定60語の `ぽけっと` を1文字ずつ書けるようにするため | 追加文字は19から20、生成テンプレート総数は65から66になる |

**Files:**
- Create: `scripts/import-kana-strokes.mjs`
- Create: `src/features/writing/data/types.ts`
- Create: `src/features/writing/data/generated/*.json`
- Create: `public/licenses/fude-kana-data/LICENSE`
- Create: `public/licenses/fude-kana-data/NOTICE`
- Create: `THIRD_PARTY_NOTICES.md`
- Test: `src/features/writing/data/strokeData.test.ts`

**Interfaces:**
- Consumes: `KANA_ORDER`。
- Produces: `loadStrokeTemplate(character): StrokeTemplate`。生成データ部分はCC BY-SA 3.0、アプリコードとは分離する。

- [ ] **Step 1: 固定ソースとライセンス条件をscriptへ明記する**

```js
const SOURCE = {
  owner: "karimghezali",
  repo: "fude-kana-data",
  commit: "ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319",
  license: "CC BY-SA 3.0",
};

const ADVANCED_WRITING_CHARACTERS = [
  "が", "ぎ", "ご", "ざ", "ぞ", "だ", "で", "ど", "ば", "ぶ",
  "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぽ", "っ", "ゃ", "ゅ", "ょ",
] as const;
```

ファイル名はUnicode codepointを5桁小文字hexにし、例として「あ」は `03042.json` を取得する。ライセンスとNOTICEも同じcommitから取得する。

- [ ] **Step 2: 失敗するデータ完全性テストを書く**

```ts
it("基本46文字と単語用20文字に正規化済みの書き順点列がある", () => {
  for (const character of [...KANA_ORDER, ...ADVANCED_WRITING_CHARACTERS]) {
    const template = loadStrokeTemplate(character);
    expect(template.character).toBe(character);
    expect(template.strokes.length).toBeGreaterThan(0);
    expect(template.strokes.flatMap(({ points }) => points)
      .every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
  }
});
```

- [ ] **Step 3: データ未作成でFAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/writing/data/strokeData.test.ts`

Expected: 生成JSONが見つからずFAIL。

- [ ] **Step 4: Docker内でpin済みデータを取得・変換する**

Run: `docker compose run --rm app node scripts/import-kana-strokes.mjs`

変換は基本46文字と単語60語で使う20文字を抽出し、各strokeを48点へ再サンプリングして小数4桁へ丸める。文字、stroke数、stroke順、direction、isCurlは保持する。`THIRD_PARTY_NOTICES.md` に原作者、KanjiVG、fude-kana-data、source commit、変換内容、CC BY-SA 3.0リンクを記載する。

- [ ] **Step 5: データとライセンスを検証する**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/writing/data/strokeData.test.ts
docker compose run --rm app npm run verify:content
```

Expected: 66件、全座標範囲、帰属ファイル、source commitがPASS。

- [ ] **Step 6: コミットする**

```bash
git add scripts/import-kana-strokes.mjs src/features/writing/data public/licenses/fude-kana-data THIRD_PARTY_NOTICES.md
git commit -m "ひらがなの書き順データを追加"
```

---

### Task 7: 書字幾何、緩やかな判定、Canvas入力

**Files:**
- Create: `src/features/writing/geometry.ts`
- Create: `src/features/writing/scoreStroke.ts`
- Create: `src/features/writing/WritingCanvas.tsx`
- Create: `src/features/writing/WritingCanvas.css`
- Create: `src/test/fixtures/strokes.ts`
- Test: `src/features/writing/geometry.test.ts`
- Test: `src/features/writing/scoreStroke.test.ts`
- Test: `src/features/writing/WritingCanvas.test.tsx`

**Interfaces:**
- Consumes: `StrokeTemplate`。
- Produces: `resample(points, count)`、`normalizeWriting(strokes)`、`scoreWriting(input, template)`、`WritingCanvas`。

`src/test/fixtures/strokes.ts` は `templateFor(character)`、`jitter(template, amount)`、`reverseAndShift(template, amount)` を固定seedで生成する。

- [ ] **Step 1: 判定型と失敗する許容試験を書く**

```ts
export interface WritingScore {
  readonly strokeCountMatch: boolean;
  readonly pathSimilarity: number;
  readonly directionSimilarity: number;
  readonly guide: "strongGuide" | "gentleGuide" | "independent";
}
```

```ts
it("参照線を少し揺らした3歳児相当の点列を否定しない", () => {
  const score = scoreWriting(jitter(templateFor("あ"), 0.035), templateFor("あ"));
  expect(score.guide).not.toBe("strongGuide");
});

it("逆方向かつ遠い線では補助を強める", () => {
  const score = scoreWriting(reverseAndShift(templateFor("あ"), 0.4), templateFor("あ"));
  expect(score.guide).toBe("strongGuide");
});
```

- [ ] **Step 2: 未実装でFAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/writing`

Expected: geometryとscore未定義でFAIL。

- [ ] **Step 3: 幾何helperとscoreを実装する**

各入力strokeを32点へ再サンプリングし、書字全体を単位正方形へ正規化する。対応点の平均距離、開始点距離、終点距離、方向内積、stroke数を使う。`pathSimilarity >= 0.68` かつ `directionSimilarity >= 0.55` なら `independent`、いずれかが `0.42` 未満なら `strongGuide`、中間は `gentleGuide` とする。値は子どもへ合否表示せず補助段階だけに使う。

- [ ] **Step 4: Pointer Events対応Canvasを実装する**

CanvasはCSS表示寸法と `devicePixelRatio` を分離し、`pointerdown/move/up/cancel`、`setPointerCapture`、coalesced eventsを処理する。CSSへ `touch-action: none` を指定する。描画はrequestAnimationFrameでまとめ、33.3msを超える処理をperformance markerへ記録する。

- [ ] **Step 5: 決定的時間フックを追加する**

```ts
declare global {
  interface Window { advanceTime?: (ms: number) => void; }
}

window.advanceTime = (ms: number) => writingClock.advance(ms);
```

テスト時計ではガイドアニメーションと成功演出を手動前進できるようにする。

- [ ] **Step 6: 書字試験を通す**

Run: `docker compose run --rm app npm test -- --run src/features/writing`

Expected: 揺れ許容、逆方向補助、pointer cancel、DPR resize、スクロール抑止がPASS。

- [ ] **Step 7: コミットする**

```bash
git add src/features/writing
git commit -m "なぞり書きと書字補助を追加"
```

---

### Task 8: 世界観アセットと46文字イラスト

**Files:**
- Create: `assets-source/illustration-sheets/*.png`
- Create: `scripts/optimize-images.mjs`
- Create: `public/assets/illustrations/kana/*.webp`
- Create: `public/assets/illustrations/world/*.webp`
- Create: `src/features/learning/content/assetCatalog.ts`
- Test: `src/features/learning/content/assets.test.ts`

**Interfaces:**
- Consumes: 46件の `illustrationKey`。
- Produces: `getIllustration(key): { src; width; height; alt }`、完成版WebPアセット。

- [ ] **Step 1: image generationで基準となる世界観画像を作る**

Use `imagegen` with this exact art direction:

```text
3歳児向け日本語学習ゲーム「ひらがなのにわ」の絵本アート。
朝の明るい庭、クリーム色の切り紙、クレヨンの柔らかな質感、
濃い藍色の太い輪郭、丸みのある単純な形、暖色中心、怖さなし。
主役は小さな黄色い「こえのことり」と緑のじょうろ。
文字、数字、ロゴ、透かし、UI、吹き出しは描かない。
背景と主役を明確に分離し、スマートフォン縦画面で中央が空く構図。
```

生成結果を目視し、世界観辞書の背景、文字面、HUD、成功演出と矛盾しないものだけを基準画像にする。

- [ ] **Step 2: 46対象を6枚の規則的な4x2シートで生成する**

各シートは「白い余白、4列x2行、各セルに一つの対象、文字とラベルなし」と指定する。順序は設計書の表を維持する。最後のシートは `る、れ、ろ、わ、りんごをたべる、ぱん` の6対象とする。各シートを目視し、対象の取り違え、複数主役、セル越境があれば該当対象だけを個別再生成する。

- [ ] **Step 3: 失敗するアセット整合試験を書く**

```ts
it("46文字すべての問題イラストを持つ", () => {
  for (const kana of KANA_ENTRIES) {
    expect(ASSET_CATALOG[kana.illustrationKey]).toMatchObject({ width: 512, height: 512 });
  }
});
```

- [ ] **Step 4: Docker内で切り出しとWebP最適化を行う**

`optimize-images.mjs` はsheet座標を固定manifestから読み、各対象を正方形へ切り出し、透明余白を整え、512x512、WebP quality 82へ変換する。元画像は `assets-source` へ保存し、完成アプリは `public/assets` のWebPだけを読む。

Run: `docker compose run --rm app node scripts/optimize-images.mjs`

- [ ] **Step 5: 全画像を目視してから試験を通す**

46対象をcontact sheetへ再結合し、文字との対応、曖昧さ、背景残り、輪郭欠けを目視する。

Run: `docker compose run --rm app npm test -- --run src/features/learning/content/assets.test.ts`

Expected: 46件すべて存在し、寸法、容量、manifest参照がPASS。

- [ ] **Step 6: コミットする**

```bash
git add assets-source scripts/optimize-images.mjs public/assets/illustrations src/features/learning/content/assetCatalog.ts src/features/learning/content/assets.test.ts
git commit -m "ひらがなの庭の完成版イラストを追加"
```

---

### Task 9: 文字導入、形合わせ、音合わせ、報酬画面

**Files:**
- Create: `src/features/lesson/LessonScreen.tsx`
- Create: `src/features/lesson/PromptCard.tsx`
- Create: `src/features/lesson/ChoiceGrid.tsx`
- Create: `src/features/lesson/WritingStep.tsx`
- Create: `src/features/lesson/RewardStep.tsx`
- Create: `src/features/lesson/LessonScreen.css`
- Create: `src/features/lesson/layoutMetrics.ts`
- Create: `src/app/gameTestHooks.ts`
- Create: `src/platform/fullscreen/useFullscreen.ts`
- Create: `src/test/renderLesson.tsx`
- Test: `src/features/lesson/LessonScreen.test.tsx`
- Test: `src/features/lesson/layoutMetrics.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `LearningState`、`reduceLesson`、`KanaEntry`、`AudioGuide`、`WritingCanvas`。
- Produces: `LessonScreen({ state, dispatch, audio })`、`measureContainment(parent, children)`。

`src/test/renderLesson.tsx` は `renderLesson({ currentKana, stage })` を公開し、memory storage、fake audio、固定clockを注入する。

- [ ] **Step 1: イラストと文字の主従を固定する失敗テストを書く**

```tsx
it("形合わせは問題に絵と文字を出し、選択肢は文字だけにする", () => {
  renderLesson({ currentKana: "あ", stage: "shapeMatch" });
  expect(screen.getByTestId("prompt-illustration")).toHaveAttribute("alt", "あひる");
  expect(screen.getByTestId("prompt-character")).toHaveTextContent("あ");
  for (const option of screen.getAllByRole("button", { name: /もじ/ })) {
    expect(within(option).queryByRole("img")).not.toBeInTheDocument();
  }
});

it("問題画像が壊れても文字学習を続けられる", () => {
  renderLesson({ currentKana: "あ", stage: "shapeMatch" });
  fireEvent.error(screen.getByTestId("prompt-illustration"));
  expect(screen.getByTestId("illustration-fallback")).toHaveTextContent("あ");
  expect(screen.getAllByRole("button", { name: /もじ/ })).toHaveLength(3);
});
```

- [ ] **Step 2: FAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/lesson`

Expected: lesson components未定義でFAIL。

- [ ] **Step 3: 1画面1CTAのLessonScreenを実装する**

`intro` は大きな文字と小さなイラスト、`shapeMatch` は同じ形、`soundMatch` は見本文字を隠してイラストと音声、書字stageはWritingCanvas、`reward` は文字花とイラストを表示する。文字領域は問題カード内でイラスト面積より常に大きくする。

問題画像の `error` 時は、対象文字を含む切り紙風の再試行表示へ置換し、選択肢と音声を維持する。画像失敗だけでstageを戻したり進行を破棄したりしない。

- [ ] **Step 4: 誤答3段階と案内文の整合を実装する**

1回目は音声再生、2回目は見本と正解候補を脈動、3回目は正解候補を案内して進める。画面文言と音声文言を同じcontent keyから取得し、操作可能性と矛盾させない。

- [ ] **Step 5: アンカーと境界helperを実装する**

portraitは上部HUD、中央教材、下部操作のCSS Grid、landscapeは左教材・右操作へ切り替える。`measureContainment` は子要素の `bottom/right` が親を越えていないことと、HUD下端から教材上端まで8px以上あることを返す。

キーボード利用時は `f` でfullscreenを切り替え、`Esc` はブラウザ標準のfullscreen終了を使う。fullscreen変更時はCanvas寸法とpointer座標変換を再計算する。

- [ ] **Step 6: text-state hookを追加する**

```ts
window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "DOM viewport: origin top-left, x right, y down",
  route: route.kind,
  kana: state.currentKana,
  stage: state.stage,
  promptHasIllustration: state.stage === "shapeMatch" || state.stage === "soundMatch",
  choices: visibleChoices,
  guideCount: currentProgress.guideCount,
  wordsUnlocked: isWordGardenUnlocked(progress),
});
```

- [ ] **Step 7: UI試験を通す**

Run: `docker compose run --rm app npm test -- --run src/features/lesson src/app/App.test.tsx`

Expected: 初回、形、音、書字接続、報酬、イラスト非混入、文言、境界helperがPASS。

- [ ] **Step 8: コミットする**

```bash
git add src/features/lesson src/app/App.tsx
git commit -m "ひらがな一文字の学習画面を追加"
```

---

### Task 10: 庭、行復習、保護者画面

**Files:**
- Create: `src/features/garden/GardenScreen.tsx`
- Create: `src/features/garden/KanaFlower.tsx`
- Create: `src/features/garden/RowReviewScreen.tsx`
- Create: `src/features/garden/GardenScreen.css`
- Create: `src/features/parent/ParentGate.tsx`
- Create: `src/features/parent/ParentDashboard.tsx`
- Create: `src/features/parent/ParentDashboard.css`
- Create: `src/test/renderGarden.tsx`
- Test: `src/features/garden/GardenScreen.test.tsx`
- Test: `src/features/garden/RowReviewScreen.test.tsx`
- Test: `src/features/parent/ParentDashboard.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `LearningProgress`、`selectRoute`、`ProgressRepository`、音声設定。
- Produces: 続きから開始、文字花復習、2秒長押し保護者ゲート、二段階リセット。

`src/test/renderGarden.tsx` は `renderGarden(progress)` を公開し、保存副作用をmemory repositoryへ隔離する。

- [ ] **Step 1: 失敗する導線テストを書く**

```tsx
it("中央のじょうろで未完了の次文字へ進む", async () => {
  renderGarden(progressAt("せ", "intro"));
  await user.click(screen.getByRole("button", { name: "つづきを あそぶ" }));
  expect(screen.getByTestId("prompt-character")).toHaveTextContent("せ");
});

it("短いタップでは保護者画面を開かない", async () => {
  renderGarden(createInitialProgress());
  await user.click(screen.getByRole("button", { name: "おとなの せってい" }));
  expect(screen.queryByRole("heading", { name: "おとなのかたへ" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: FAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/garden src/features/parent`

Expected: garden/parent components未定義でFAIL。

- [ ] **Step 3: 庭と文字花を実装する**

完了文字だけに花とイラストを表示し、未完了文字は小さな土の区画として扱う。主要CTAは中央じょうろ一つ。完了文字の花をタップすると、その文字の `intro` から復習するが固定進行位置は巻き戻さない。

- [ ] **Step 4: 各行の文字だけを使う復習を実装する**

行復習は形合わせ1回、音合わせ1回。単語、絵を答える選択肢、時間制限を入れない。や行とわ行は3文字として処理する。

- [ ] **Step 5: 保護者ゲートとdashboardを実装する**

Pointerを2秒保持したときだけ開き、46文字の `seen/shape/sound/trace/copy/freeWrite/completedOnce`、再案内回数、音声・BGM・効果音・reduced motion、保存とPWA状態を表示する。全リセットは「3つの葉を順に押す」読み取り確認と最終確認の二段階にする。

- [ ] **Step 6: 庭と保護者試験を通す**

Run: `docker compose run --rm app npm test -- --run src/features/garden src/features/parent`

Expected: 続き、復習非破壊、行境界、長押し、設定、二段階リセットがPASS。

- [ ] **Step 7: コミットする**

```bash
git add src/features/garden src/features/parent src/app/App.tsx
git commit -m "文字の庭と保護者画面を追加"
```

---

### Task 11: 60語の単語コース

**Files:**
- Create: `src/features/learning/content/words.ts`
- Create: `src/features/words/WordGardenScreen.tsx`
- Create: `src/features/words/WordChoiceStep.tsx`
- Create: `src/features/words/WordArrangeStep.tsx`
- Create: `src/features/words/WordWritingStep.tsx`
- Create: `src/features/words/WordLesson.css`
- Create: `public/assets/illustrations/words/*.webp`
- Create: `src/test/renderApp.tsx`
- Test: `src/features/learning/content/words.test.ts`
- Test: `src/features/words/WordGardenScreen.test.tsx`
- Modify: `src/features/learning/content/validateContent.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `WordEntry`、基本46＋単語用20文字の書字データ、`isWordGardenUnlocked`。
- Produces: W1〜W5の各12語、選択・並べ・文字セル書字。

`src/test/renderApp.tsx` は `renderApp({ progress, requestedRoute })` を公開し、不正なroute要求を含むアプリ全体のtestに使う。

- [ ] **Step 1: exact 60-word catalogと失敗する検証テストを書く**

```ts
export const WORDS_BY_STAGE = {
  W1: ["いえ", "かお", "かき", "かさ", "くし", "こま", "さる", "しか", "すし", "たこ", "つき", "なす"],
  W2: ["あひる", "いぬ", "うさぎ", "えんぴつ", "きりん", "くるま", "こあら", "さかな", "しまうま", "すいか", "たいこ", "つみき"],
  W3: ["かがみ", "いちご", "ごりら", "ぞう", "ざりがに", "だるま", "でんしゃ", "どうぶつ", "ばなな", "ぶた", "ぱんだ", "ぴあの"],
  W4: ["きって", "こっぷ", "らっぱ", "きっぷ", "せっけん", "はっぱ", "しっぽ", "べっど", "ろけっと", "ぽけっと", "ざっし", "がっき"],
  W5: ["きゃべつ", "きゅうり", "きょうりゅう", "しゃしん", "しゅりけん", "しょうぼうしゃ", "ちゃわん", "ちゅうりっぷ", "ちょうちょ", "にんぎょう", "りゅっく", "ぎゅうにゅう"],
} as const;
```

各 `WordEntry` は `id`、`text`、`stage`、`spokenLabel`、`illustrationKey`、`writingCells` を持つ。

```ts
it("W1からW5に重複なしで60語を持つ", () => {
  const words = Object.values(WORDS_BY_STAGE).flat();
  expect(words).toHaveLength(60);
  expect(new Set(words).size).toBe(60);
});
```

- [ ] **Step 2: catalog未実装でFAILを確認する**

Run: `docker compose run --rm app npm test -- --run src/features/learning/content/words.test.ts`

Expected: `WORDS_BY_STAGE` 未定義でFAIL。

- [ ] **Step 3: 単語データと段階validatorを実装する**

W1は清音2文字、W2は清音中心、W3は濁音・半濁音、W4は小さい「っ」、W5は小さい「ゃゅょ」を必須とする。各段階の検査関数は不適切な文字を `ContentIssue` として返す。

- [ ] **Step 4: 単語UIの失敗テストを書く**

```tsx
it("46文字完了前はURLや状態注入でも単語画面を出さない", () => {
  renderApp({ progress: progressWithCompletedCount(45), requestedRoute: "wordGarden" });
  expect(screen.queryByTestId("word-garden")).not.toBeInTheDocument();
  expect(screen.getByTestId("kana-garden")).toBeVisible();
});
```

- [ ] **Step 5: 単語選択、並べ、書字を実装する**

選択問題は問題側の完成イラストと音声、選択肢側の単語文字だけを表示する。並べ問題は1文字ごとの64px以上のタイルを使う。書字は1文字ずつ独立セルで行い、既存の46文字および濁音・小文字のstroke templateを読む。

- [ ] **Step 6: 60語イラストを生成・最適化する**

Task 8と同じ画風・シート規約で、既存46対象を再利用できる語は同じasset keyを参照する。新規対象だけを4x2シートで生成し、個別WebPへ変換する。60語の全problem画面をcontact sheetで目視し、意味が曖昧な画像を再生成する。

- [ ] **Step 7: 単語コース試験を通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/features/learning/content/words.test.ts src/features/words
docker compose run --rm app npm run verify:content
```

Expected: 60語、段階条件、46文字ゲート、選択肢の文字限定、並べ、書字セル、全assetがPASS。

- [ ] **Step 8: コミットする**

```bash
git add src/features/learning/content src/features/words src/app/App.tsx public/assets/illustrations/words assets-source
git commit -m "60語のことばの庭を追加"
```

---

### Task 12: PWA、GitHub Pages、利用文書

**Files:**
- Modify: `vite.config.ts`
- Create: `src/platform/pwa/PwaStatus.ts`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Test: `src/platform/pwa/PwaStatus.test.ts`

**Interfaces:**
- Consumes: build時の `BASE_PATH`。
- Produces: installable manifest、versioned service worker、Pages artifact、保護者画面へ渡す更新状態。

- [ ] **Step 1: GitHub Pagesサブパスの失敗ビルド試験を追加する**

`vite.config.ts` の `base` を `process.env.BASE_PATH ?? "/"` から読む。テストscript `build:pages` は `BASE_PATH=/hiraganaStudy/` でbuildし、生成HTML内のasset URLが同prefixを持つことを検査する。

- [ ] **Step 2: PWA設定と更新状態を実装する**

manifestは `name: ひらがなのにわ`、`short_name: ひらがな`、`display: standalone`、`orientation: any`、背景色とテーマ色はCSS tokenと一致させる。Workboxはアプリシェル、46文字画像、60語画像、効果音をrevision付きでcacheし、更新時に旧版と混在させない。

- [ ] **Step 3: PWAアイコンを基準画像から生成する**

「こえのことり」と芽を中央へ置き、文字を入れない。192、512、maskable 512をDocker内のSharpで生成し、maskable safe zone内へ主役を収める。

- [ ] **Step 4: Pages workflowを実装する**

workflowは `actions/checkout@v7`、`actions/setup-node@v7`、`actions/configure-pages@v6`、`npm ci`、`npm test -- --run`、`npm run typecheck`、`npm run lint`、動的 `BASE_PATH=/${repository-name}/` build、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5` の順とする。deploy jobへ `pages: write` と `id-token: write`、`environment: github-pages`、build jobへの `needs` を設定する。公開は `main` push時だが、workflow追加後の実pushはユーザー最終承認まで行わない。

- [ ] **Step 5: READMEとCHANGELOGを書く**

READMEへ概要、対象、Docker起動、操作、保護者画面、端末保存、音声依存、オフライン、テスト、GitHub Pages設定、第三者ライセンスを記載する。CHANGELOGへ完成版開発中の収録範囲を記載する。

- [ ] **Step 6: buildとPWA試験を通す**

Run:

```bash
docker compose run --rm app npm test -- --run src/platform/pwa
docker compose run --rm -e BASE_PATH=/hiraganaStudy/ app npm run build
```

Expected: manifest、service worker、正しいbase path、3種icon、offline asset manifestが生成される。

- [ ] **Step 7: コミットする**

```bash
git add vite.config.ts src/platform/pwa .github/workflows/deploy-pages.yml public/icons README.md CHANGELOG.md
git commit -m "PWAとGitHub Pages公開構成を追加"
```

---

### Task 13: 統合試験、代表viewport、完成監査

**Files:**
- Create: `tests/game/scenarios/first-kana.json`
- Create: `tests/game/scenarios/writing.json`
- Create: `tests/game/scenarios/word-unlock.json`
- Create: `tests/game/assertions/check-containment.mjs`
- Create: `scripts/verify-content.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `window.render_game_to_text`、`window.advanceTime`、全完成機能。
- Produces: 主要導線のスクリーンショット、text-state、console error、境界値、content audit結果。

- [ ] **Step 1: 内容監査scriptを完成させる**

`verify-content.mjs` は46文字順、60語、全illustration、基本46＋単語用20文字の全stroke template、PWA icon、効果音、第三者ライセンスを検査し、欠落時に対象keyを列挙してexit 1にする。

- [ ] **Step 2: 主要導線scenarioを作る**

`first-kana.json` は音声gate、じょうろ、導入、形合わせ誤答1回、正解、音合わせまで進む。`writing.json` は「あ」の太線、細線、見本書き、freeWrite、報酬を進む。`word-unlock.json` はtest-only fixtureで45文字時の未解放と46文字時の解放を別セッションで確認する。

- [ ] **Step 3: Docker内でproduction buildとserverを起動する**

Run:

```bash
docker compose run --rm -e BASE_PATH=/ app npm run build
docker compose run --rm --service-ports app npm run preview -- --host 0.0.0.0
```

副作用: preview serverを起動する。確認終了後はコンテナを停止する。

- [ ] **Step 4: Playwright clientで4 viewportを確認する**

まず `docker compose run --rm app npx playwright install --with-deps chromium webkit` でブラウザをnamed volumeへ用意する。次に既存clientをDocker内から実行する。

```bash
docker compose run --rm \
  -v /Users/santa/.codex/skills/develop-web-game:/codex-game-skill:ro \
  app node /codex-game-skill/scripts/web_game_playwright_client.js \
  --url http://host.docker.internal:4173 \
  --actions-file /workspace/tests/game/scenarios/first-kana.json \
  --screenshot-dir /workspace/test-results/game/first-kana \
  --iterations 3 --pause-ms 300
```

同じ形式でwritingとword-unlockを実行し、各burstの間に意図的なpauseを入れ、最新スクリーンショット、`render_game_to_text`、console errorを取得する。既存clientにはviewport引数がないため、4代表viewportの設定と境界採取だけは `check-containment.mjs` がPlaywrightの `page.setViewportSize()` を使う。これはゲーム操作clientの代替にせず、レイアウト数値とスクリーンショットの補助に限定する。

- [ ] **Step 5: スクリーンショットを必ず目視する**

4 viewportすべてで、問題文字がイラストより大きいこと、選択肢に画像がないこと、HUDと教材が8px以上離れること、下端・右端が親を越えないこと、横画面で左教材・右操作になることを確認する。Service Worker検証前はcache-busting URLまたはcache削除を使う。

- [ ] **Step 6: 境界と性能を数値確認する**

`check-containment.mjs` で各親子の `bottom/right`、HUD下端、教材上端、touch target寸法を採取する。書字中のperformance markersから33.3ms超過の継続有無と、pointer eventからpaintまで50ms超過の継続有無を確認する。Docker測定だけを実機性能認証には使わない。

- [ ] **Step 7: 全品質ゲートを通す**

Run:

```bash
docker compose run --rm app npm test -- --run
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
docker compose run --rm app npm run verify:content
docker compose run --rm -e BASE_PATH=/hiraganaStudy/ app npm run build
```

Expected: 全コマンドexit 0、未処理console error 0、46文字、60語、全asset、全licenseが揃う。

- [ ] **Step 8: 最終差分と公開前セキュリティを確認する**

秘密情報を含むファイル、外部分析URL、仮アセット参照、`console.log`、未使用の移行・フォールバック参照を `rg` とstaged diffで確認する。削除を伴った場合は参照残りとproduction previewを再確認する。

- [ ] **Step 9: 完成監査をコミットする**

```bash
git add tests scripts/verify-content.mjs package.json README.md
git commit -m "完成版の統合検証を追加"
```

- [ ] **Step 10: 公開許可を得る**

全検証結果、スクリーンショット、既知の端末依存、remote未設定またはpush対象commitをユーザーへ提示する。明示許可後だけGitHub remote設定、push、Pages公開確認を行う。push依頼をPR作成へ拡張しない。

---

## Spec Coverage Check

| 設計要件 | 実装Task |
|---|---|
| 初期登録なし・子どもだけで開始 | 1, 5, 9 |
| 五十音順46文字 | 2, 3, 9 |
| 問題側イラスト・選択肢文字のみ | 2, 8, 9 |
| なぞりから補助なし書き | 6, 7, 9 |
| 行復習 | 3, 10 |
| 46文字後に60語以上 | 3, 11 |
| 濁音・半濁音・促音・拗音 | 11 |
| 庭と報酬 | 8, 9, 10 |
| 保護者画面 | 4, 5, 10 |
| 端末保存と部分復旧 | 4 |
| 音声とvisual-only | 5, 9 |
| スマホ・タブレット縦横 | 9, 13 |
| PWA・オフライン・GitHub Pages | 12, 13 |
| 30fps・50ms目標 | 7, 13 |
| 個人情報、広告、分析なし | 4, 12, 13 |
| 代表導線検証 | 13 |

## Execution Notes

- 各Taskは前Taskの公開interfaceだけを使い、内部実装を直接参照しない。
- 1 Taskにつき、失敗するtest、最小実装、対象test、型・lint、独立コミットの順を守る。
- UI変更Task 8〜13は、スクリーンショット生成だけでなく画像そのものを目視する。
- image generationで基準画像を採用した後は、簡易emojiやCSS図形へ縮退させない。
- `progress.md` は実装開始時に作成するが `.gitignore` 済みのため公開物へ含めない。
