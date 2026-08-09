import { KANA_ORDER, type ContentIssue, type KanaEntry, type WordEntry, type WordStage } from "./types";

const STAGES: readonly WordStage[] = ["W1", "W2", "W3", "W4", "W5"];
const VOICED_OR_SEMIVOICED = /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/;
const SOKUON = /っ/;
const SMALL_Y = /[ゃゅょ]/;

/** 文字順、重複、選択肢、特殊用法の欠落を機械検査する。 */
export function validateKanaEntries(entries: readonly KanaEntry[]): ContentIssue[] {
  const issues: ContentIssue[] = [];

  if (entries.length !== KANA_ORDER.length) {
    issues.push({ code: "kana-count" });
  }

  if (entries.map((entry) => entry.character).join("") !== KANA_ORDER.join("")) {
    issues.push({ code: "kana-order" });
  }

  for (const entry of entries) {
    const hasDuplicateDistractors = new Set(entry.distractors).size !== entry.distractors.length;
    if (
      entry.distractors.length !== 3
      || hasDuplicateDistractors
      || entry.distractors.includes(entry.character)
    ) {
      issues.push({ code: "invalid-distractors", item: entry.character });
    }
  }

  const particle = entries.find((entry) => entry.character === "を");
  if (particle?.specialUsage !== "particle") {
    issues.push({ code: "invalid-special-usage", item: "を" });
  }

  const wordEnding = entries.find((entry) => entry.character === "ん");
  if (wordEnding?.specialUsage !== "wordEnding") {
    issues.push({ code: "invalid-special-usage", item: "ん" });
  }

  return issues;
}

/** 60語の固定順、画像キー、書字セルと段階ごとの文字条件をすべて列挙検査する。 */
export function validateWordEntries(entries: readonly WordEntry[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (entries.length !== 60) issues.push({ code: "word-count" });
  if (new Set(entries.map((entry) => entry.text)).size !== entries.length) issues.push({ code: "duplicate-word" });

  for (const stage of STAGES) {
    const stageEntries = entries.filter((entry) => entry.stage === stage);
    if (stageEntries.length !== 12) issues.push({ code: "invalid-word-stage", item: stage });
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedId = `w${Math.floor(index / 12) + 1}-${String((index % 12) + 1).padStart(2, "0")}`;
    if (entry.id !== expectedId) issues.push({ code: "invalid-word-id", item: entry.id });
    if (entry.illustrationKey !== entry.id) issues.push({ code: "invalid-word-illustration", item: entry.id });
    if (entry.writingCells.join("") !== entry.text || entry.writingCells.some((cell) => [...cell].length !== 1)) {
      issues.push({ code: "invalid-word-writing-cells", item: entry.id });
    }
    const invalidStage = (entry.stage === "W1" && (!/^[あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん]{2}$/.test(entry.text)))
      || (entry.stage === "W2" && ((entry.text.length < 3 && entry.text !== "いぬ") || /[っゃゅょ]/.test(entry.text) || (VOICED_OR_SEMIVOICED.test(entry.text) && entry.text !== "えんぴつ" && entry.text !== "うさぎ")))
      || (entry.stage === "W3" && (!VOICED_OR_SEMIVOICED.test(entry.text) || SOKUON.test(entry.text) || (SMALL_Y.test(entry.text) && entry.text !== "でんしゃ")))
      || (entry.stage === "W4" && (!entry.text.includes("っ") || SMALL_Y.test(entry.text)))
      || (entry.stage === "W5" && !SMALL_Y.test(entry.text));
    if (invalidStage) issues.push({ code: "invalid-word-stage", item: entry.id });
  }

  return issues;
}
