import { describe, expect, it } from "vitest";

import { KANA_ENTRIES, KANA_ORDER, findKana } from "./kana";
import { validateKanaEntries } from "./validateContent";

describe("五十音コンテンツ", () => {
  it("設計順どおり46文字を重複なく持つ", () => {
    expect(KANA_ENTRIES.map(({ character }) => character)).toEqual([
      "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
      "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
      "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
      "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
      "る", "れ", "ろ", "わ", "を", "ん",
    ]);
    expect(new Set(KANA_ENTRIES.map(({ illustrationKey }) => illustrationKey)).size).toBe(46);
  });

  it("をとんは頭文字として偽装しない", () => {
    expect(findKana("を")).toMatchObject({
      spokenLabel: "りんごを たべる",
      specialUsage: "particle",
    });
    expect(findKana("ん")).toMatchObject({
      spokenLabel: "ぱんの さいごの、ん",
      specialUsage: "wordEnding",
    });
  });

  it("各文字の初回候補は正解を含まず2文字以上ある", () => {
    expect(KANA_ENTRIES.map(({ character, distractors }) => ({ character, distractors }))).toEqual([
      { character: "あ", distractors: ["さ", "ゆ", "お"] },
      { character: "い", distractors: ["た", "ほ", "り"] },
      { character: "う", distractors: ["か", "へ", "ろ"] },
      { character: "え", distractors: ["す", "ま", "わ"] },
      { character: "お", distractors: ["き", "む", "あ"] },
      { character: "か", distractors: ["ひ", "め", "な"] },
      { character: "き", distractors: ["へ", "む", "さ"] },
      { character: "く", distractors: ["あ", "せ", "へ"] },
      { character: "け", distractors: ["う", "そ", "は"] },
      { character: "こ", distractors: ["い", "つ", "に"] },
      { character: "さ", distractors: ["う", "へ", "ち"] },
      { character: "し", distractors: ["あ", "け", "つ"] },
      { character: "す", distractors: ["い", "た", "む"] },
      { character: "せ", distractors: ["う", "ま", "そ"] },
      { character: "そ", distractors: ["き", "ぬ", "を"] },
      { character: "た", distractors: ["う", "へ", "に"] },
      { character: "ち", distractors: ["あ", "け", "さ"] },
      { character: "つ", distractors: ["い", "ほ", "し"] },
      { character: "て", distractors: ["う", "め", "と"] },
      { character: "と", distractors: ["あ", "さ", "の"] },
      { character: "な", distractors: ["い", "す", "め"] },
      { character: "に", distractors: ["う", "ほ", "れ"] },
      { character: "ぬ", distractors: ["あ", "か", "め"] },
      { character: "ね", distractors: ["う", "さ", "れ"] },
      { character: "の", distractors: ["き", "へ", "め"] },
      { character: "は", distractors: ["い", "そ", "ほ"] },
      { character: "ひ", distractors: ["う", "け", "り"] },
      { character: "ふ", distractors: ["あ", "さ", "へ"] },
      { character: "へ", distractors: ["い", "ぬ", "く"] },
      { character: "ほ", distractors: ["う", "さ", "は"] },
      { character: "ま", distractors: ["い", "け", "め"] },
      { character: "み", distractors: ["あ", "せ", "ぬ"] },
      { character: "む", distractors: ["い", "た", "め"] },
      { character: "め", distractors: ["う", "さ", "ぬ"] },
      { character: "も", distractors: ["い", "た", "わ"] },
      { character: "や", distractors: ["い", "す", "わ"] },
      { character: "ゆ", distractors: ["あ", "け", "よ"] },
      { character: "よ", distractors: ["い", "す", "わ"] },
      { character: "ら", distractors: ["あ", "せ", "る"] },
      { character: "り", distractors: ["う", "た", "い"] },
      { character: "る", distractors: ["あ", "せ", "ろ"] },
      { character: "れ", distractors: ["い", "た", "ね"] },
      { character: "ろ", distractors: ["あ", "け", "る"] },
      { character: "わ", distractors: ["い", "す", "れ"] },
      { character: "を", distractors: ["あ", "け", "そ"] },
      { character: "ん", distractors: ["あ", "け", "そ"] },
    ]);
  });

  it("不正な件数、順序、候補を内容issueとして返す", () => {
    expect(validateKanaEntries([])).toEqual([
      { code: "kana-count" },
      { code: "kana-order" },
      { code: "invalid-special-usage", item: "を" },
      { code: "invalid-special-usage", item: "ん" },
    ]);
    expect(validateKanaEntries([
      {
        character: "あ",
        illustrationKey: "test",
        spokenLabel: "あ",
        row: "a",
        distractors: ["あ"],
      },
    ])).toEqual([
      { code: "kana-count" },
      { code: "kana-order" },
      { code: "invalid-distractors", item: "あ" },
      { code: "invalid-special-usage", item: "を" },
      { code: "invalid-special-usage", item: "ん" },
    ]);
  });

  it("をとんの特殊用法が欠けた場合は内容issueとして返す", () => {
    const entriesWithInvalidSpecialUsage = KANA_ENTRIES.map((entry) => {
      if (entry.character === "を") return { ...entry, specialUsage: undefined };
      if (entry.character === "ん") return { ...entry, specialUsage: "particle" as const };
      return entry;
    });

    expect(validateKanaEntries(entriesWithInvalidSpecialUsage)).toEqual([
      { code: "invalid-special-usage", item: "を" },
      { code: "invalid-special-usage", item: "ん" },
    ]);
  });

  it("完成した46文字は内容issueを持たない", () => {
    expect(validateKanaEntries(KANA_ENTRIES)).toEqual([]);
    expect(KANA_ORDER).toEqual([
      "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
      "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
      "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
      "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
      "る", "れ", "ろ", "わ", "を", "ん",
    ]);
  });
});
