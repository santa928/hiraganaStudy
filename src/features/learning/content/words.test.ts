import { describe, expect, it } from "vitest";

import { WORD_ENTRIES, WORDS_BY_STAGE } from "./words";
import { validateWordEntries } from "./validateContent";

describe("単語教材", () => {
  it("W1からW5に重複なしで60語を持つ", () => {
    const words = Object.values(WORDS_BY_STAGE).flat();

    expect(words).toHaveLength(60);
    expect(new Set(words).size).toBe(60);
    expect(WORD_ENTRIES.map((entry) => entry.id)).toEqual([
      ...Array.from({ length: 12 }, (_, index) => `w1-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w2-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w3-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w4-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w5-${String(index + 1).padStart(2, "0")}`),
    ]);
  });

  it("各語を一文字ずつの書字セルへ分け、段階条件を満たす", () => {
    expect(WORD_ENTRIES.find((entry) => entry.text === "きって")?.writingCells).toEqual(["き", "っ", "て"]);
    expect(WORD_ENTRIES.find((entry) => entry.text === "きょうりゅう")?.writingCells).toEqual(["き", "ょ", "う", "り", "ゅ", "う"]);
    expect(validateWordEntries(WORD_ENTRIES)).toEqual([]);
  });

  it("W3では濁音があっても促音を許可しない", () => {
    const invalidEntries = WORD_ENTRIES.map((entry) => entry.id === "w3-01"
      ? { ...entry, text: "がっぽ", writingCells: ["が", "っ", "ぽ"] }
      : entry);

    expect(validateWordEntries(invalidEntries)).toContainEqual({ code: "invalid-word-stage", item: "w3-01" });
  });
});
