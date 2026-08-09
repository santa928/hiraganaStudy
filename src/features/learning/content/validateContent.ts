import { KANA_ORDER, type ContentIssue, type KanaEntry } from "./types";

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
