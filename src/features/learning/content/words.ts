import type { WordEntry, WordStage } from "./types";

/** 完成46文字の後に固定順で開く、ことばの花壇の60語。 */
export const WORDS_BY_STAGE = {
  W1: ["いえ", "かお", "かき", "かさ", "くし", "こま", "さる", "しか", "すし", "たこ", "つき", "なす"],
  W2: ["あひる", "いぬ", "うさぎ", "えんぴつ", "きりん", "くるま", "こあら", "さかな", "しまうま", "すいか", "たいこ", "つみき"],
  W3: ["かがみ", "いちご", "ごりら", "ぞう", "ざりがに", "だるま", "でんしゃ", "どうぶつ", "ばなな", "ぶた", "ぱんだ", "ぴあの"],
  W4: ["きって", "こっぷ", "らっぱ", "きっぷ", "せっけん", "はっぱ", "しっぽ", "べっど", "ろけっと", "ぽけっと", "ざっし", "がっき"],
  W5: ["きゃべつ", "きゅうり", "きょうりゅう", "しゃしん", "しゅりけん", "しょうぼうしゃ", "ちゃわん", "ちゅうりっぷ", "ちょうちょ", "にんぎょう", "りゅっく", "ぎゅうにゅう"],
} as const satisfies Readonly<Record<WordStage, readonly string[]>>;

const SPOKEN_LABELS: Readonly<Record<string, string>> = {
  かき: "くだものの かき",
  たこ: "うみの たこ",
  どうぶつ: "どうぶつの なかまたち",
  がっき: "みぢかな がっき",
};

/** 固定順から画像契約と同じIDを付けた、表示・保存用の単語教材を作る。 */
function createWordEntries(): readonly WordEntry[] {
  return (Object.entries(WORDS_BY_STAGE) as ReadonlyArray<readonly [WordStage, readonly string[]]>).flatMap(([stage, words], stageIndex) => (
    words.map((text, wordIndex) => ({
      id: `w${stageIndex + 1}-${String(wordIndex + 1).padStart(2, "0")}`,
      text,
      stage,
      spokenLabel: SPOKEN_LABELS[text] ?? text,
      illustrationKey: `w${stageIndex + 1}-${String(wordIndex + 1).padStart(2, "0")}`,
      writingCells: [...text],
    }))
  ));
}

/** 5段階を横断して固定順で参照する60語の教材。 */
export const WORD_ENTRIES = createWordEntries();

/** 指定IDの単語を返す。 */
export function findWord(id: string): WordEntry {
  const word = WORD_ENTRIES.find((entry) => entry.id === id);
  if (!word) throw new Error(`Word entry is missing: ${id}`);
  return word;
}
