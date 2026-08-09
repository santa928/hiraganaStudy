/** 五十音学習で扱う清音46文字の固定順。 */
export const KANA_ORDER = [
  "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
  "る", "れ", "ろ", "わ", "を", "ん",
] as const;

/** 五十音コンテンツで使用できる文字。 */
export type KanaCharacter = (typeof KANA_ORDER)[number];

type KanaRow = "a" | "ka" | "sa" | "ta" | "na" | "ha" | "ma" | "ya" | "ra" | "wa";
type RegularKanaCharacter = Exclude<KanaCharacter, "を" | "ん">;

/** 特殊用法を除く、1文字教材に共通するデータ。 */
interface KanaEntryBase {
  readonly illustrationKey: string;
  readonly spokenLabel: string;
  readonly row: KanaRow;
  readonly distractors: readonly KanaCharacter[];
}

/** 1文字の導入、選択問題、資産を結びつける教材定義。 */
export type KanaEntry =
  | (KanaEntryBase & {
    readonly character: RegularKanaCharacter;
    readonly specialUsage?: never;
  })
  | (KanaEntryBase & {
    readonly character: "を";
    readonly specialUsage: "particle";
  })
  | (KanaEntryBase & {
    readonly character: "ん";
    readonly specialUsage: "wordEnding";
  });

/** 単語コースの難易度段階。 */
export type WordStage = "W1" | "W2" | "W3" | "W4" | "W5";

/** 単語コースで表示・書字に使用する教材定義。 */
export interface WordEntry {
  readonly id: string;
  readonly text: string;
  readonly stage: WordStage;
  readonly spokenLabel: string;
  readonly illustrationKey: string;
  readonly writingCells: readonly string[];
}

/** コンテンツ監査で返す、利用者へ表示可能な問題の分類。 */
export interface ContentIssue {
  readonly code:
    | "kana-count"
    | "kana-order"
    | "invalid-distractors"
    | "invalid-special-usage"
    | "invalid-word-stage"
    | "word-count"
    | "duplicate-word"
    | "invalid-word-id"
    | "invalid-word-writing-cells"
    | "invalid-word-illustration"
    | "missing-asset"
    | "missing-stroke";
  readonly item?: string;
}
