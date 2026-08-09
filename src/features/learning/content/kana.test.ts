import { describe, expect, expectTypeOf, it } from "vitest";

import { KANA_ENTRIES, KANA_ORDER, findKana } from "./kana";
import type { KanaCharacter, KanaEntry } from "./types";
import { validateKanaEntries } from "./validateContent";

/** 不正な外部コンテンツを監査するため、テストでだけ型境界を越える。 */
function asKanaEntriesForAudit(entries: readonly unknown[]): readonly KanaEntry[] {
  return entries as readonly KanaEntry[];
}

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

  it("設計書どおり全46文字の読み上げ、asset key、行を持つ", () => {
    expect(KANA_ENTRIES.map(({ character, spokenLabel, illustrationKey, row }) => ({
      character,
      spokenLabel,
      illustrationKey,
      row,
    }))).toEqual([
      { character: "あ", spokenLabel: "あひる", illustrationKey: "kana-a-duck", row: "a" },
      { character: "い", spokenLabel: "いぬ", illustrationKey: "kana-i-dog", row: "a" },
      { character: "う", spokenLabel: "うさぎ", illustrationKey: "kana-u-rabbit", row: "a" },
      { character: "え", spokenLabel: "えんぴつ", illustrationKey: "kana-e-pencil", row: "a" },
      { character: "お", spokenLabel: "おにぎり", illustrationKey: "kana-o-rice-ball", row: "a" },
      { character: "か", spokenLabel: "かさ", illustrationKey: "kana-ka-umbrella", row: "ka" },
      { character: "き", spokenLabel: "きりん", illustrationKey: "kana-ki-giraffe", row: "ka" },
      { character: "く", spokenLabel: "くるま", illustrationKey: "kana-ku-car", row: "ka" },
      { character: "け", spokenLabel: "けいと", illustrationKey: "kana-ke-yarn", row: "ka" },
      { character: "こ", spokenLabel: "こあら", illustrationKey: "kana-ko-koala", row: "ka" },
      { character: "さ", spokenLabel: "さかな", illustrationKey: "kana-sa-fish", row: "sa" },
      { character: "し", spokenLabel: "しまうま", illustrationKey: "kana-shi-zebra", row: "sa" },
      { character: "す", spokenLabel: "すいか", illustrationKey: "kana-su-watermelon", row: "sa" },
      { character: "せ", spokenLabel: "せみ", illustrationKey: "kana-se-cicada", row: "sa" },
      { character: "そ", spokenLabel: "そら", illustrationKey: "kana-so-sky", row: "sa" },
      { character: "た", spokenLabel: "たいこ", illustrationKey: "kana-ta-drum", row: "ta" },
      { character: "ち", spokenLabel: "ちょうちょ", illustrationKey: "kana-chi-butterfly", row: "ta" },
      { character: "つ", spokenLabel: "つみき", illustrationKey: "kana-tsu-blocks", row: "ta" },
      { character: "て", spokenLabel: "てぶくろ", illustrationKey: "kana-te-gloves", row: "ta" },
      { character: "と", spokenLabel: "とまと", illustrationKey: "kana-to-tomato", row: "ta" },
      { character: "な", spokenLabel: "なす", illustrationKey: "kana-na-eggplant", row: "na" },
      { character: "に", spokenLabel: "にんじん", illustrationKey: "kana-ni-carrot", row: "na" },
      { character: "ぬ", spokenLabel: "ぬいぐるみ", illustrationKey: "kana-nu-stuffed-toy", row: "na" },
      { character: "ね", spokenLabel: "ねこ", illustrationKey: "kana-ne-cat", row: "na" },
      { character: "の", spokenLabel: "のりもの", illustrationKey: "kana-no-vehicles", row: "na" },
      { character: "は", spokenLabel: "はな", illustrationKey: "kana-ha-flower", row: "ha" },
      { character: "ひ", spokenLabel: "ひよこ", illustrationKey: "kana-hi-chick", row: "ha" },
      { character: "ふ", spokenLabel: "ふうせん", illustrationKey: "kana-fu-balloon", row: "ha" },
      { character: "へ", spokenLabel: "へび", illustrationKey: "kana-he-snake", row: "ha" },
      { character: "ほ", spokenLabel: "ほし", illustrationKey: "kana-ho-star", row: "ha" },
      { character: "ま", spokenLabel: "まくら", illustrationKey: "kana-ma-pillow", row: "ma" },
      { character: "み", spokenLabel: "みかん", illustrationKey: "kana-mi-mandarin", row: "ma" },
      { character: "む", spokenLabel: "むし", illustrationKey: "kana-mu-insect", row: "ma" },
      { character: "め", spokenLabel: "めがね", illustrationKey: "kana-me-glasses", row: "ma" },
      { character: "も", spokenLabel: "もも", illustrationKey: "kana-mo-peach", row: "ma" },
      { character: "や", spokenLabel: "やま", illustrationKey: "kana-ya-mountain", row: "ya" },
      { character: "ゆ", spokenLabel: "ゆきだるま", illustrationKey: "kana-yu-snowman", row: "ya" },
      { character: "よ", spokenLabel: "よっと", illustrationKey: "kana-yo-yacht", row: "ya" },
      { character: "ら", spokenLabel: "らいおん", illustrationKey: "kana-ra-lion", row: "ra" },
      { character: "り", spokenLabel: "りんご", illustrationKey: "kana-ri-apple", row: "ra" },
      { character: "る", spokenLabel: "るーれっと", illustrationKey: "kana-ru-roulette", row: "ra" },
      { character: "れ", spokenLabel: "れもん", illustrationKey: "kana-re-lemon", row: "ra" },
      { character: "ろ", spokenLabel: "ろうそく", illustrationKey: "kana-ro-candle", row: "ra" },
      { character: "わ", spokenLabel: "わに", illustrationKey: "kana-wa-crocodile", row: "wa" },
      { character: "を", spokenLabel: "りんごを たべる", illustrationKey: "kana-wo-apple-eating", row: "wa" },
      { character: "ん", spokenLabel: "ぱんの さいごの、ん", illustrationKey: "kana-n-bread-ending", row: "wa" },
    ]);
  });

  it("特殊用法は文字ごとに型で制約する", () => {
    expectTypeOf<{
      character: "を";
      illustrationKey: string;
      spokenLabel: string;
      row: "wa";
      distractors: readonly KanaCharacter[];
      specialUsage: "wordEnding";
    }>().not.toMatchTypeOf<KanaEntry>();
    expectTypeOf<{
      character: "あ";
      illustrationKey: string;
      spokenLabel: string;
      row: "a";
      distractors: readonly KanaCharacter[];
      specialUsage: "particle";
    }>().not.toMatchTypeOf<KanaEntry>();
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

  it("各文字の候補は正解を含まない3文字で、初回用から再挑戦用の順に並ぶ", () => {
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
    const entriesWithInvalidSpecialUsage = asKanaEntriesForAudit(KANA_ENTRIES.map((entry) => {
      if (entry.character === "を") return { ...entry, specialUsage: undefined };
      if (entry.character === "ん") return { ...entry, specialUsage: "particle" as const };
      return entry;
    }));

    expect(validateKanaEntries(entriesWithInvalidSpecialUsage)).toEqual([
      { code: "invalid-special-usage", item: "を" },
      { code: "invalid-special-usage", item: "ん" },
    ]);
  });

  it("候補がちょうど3件でない、または重複する場合は内容issueとして返す", () => {
    const entriesWithTwoDistractors = asKanaEntriesForAudit(KANA_ENTRIES.map((entry) => (
      entry.character === "あ" ? { ...entry, distractors: ["い", "う"] } : entry
    )));
    const entriesWithFourDistractors = asKanaEntriesForAudit(KANA_ENTRIES.map((entry) => (
      entry.character === "あ" ? { ...entry, distractors: ["い", "う", "え", "お"] } : entry
    )));
    const entriesWithDuplicateDistractors = asKanaEntriesForAudit(KANA_ENTRIES.map((entry) => (
      entry.character === "あ" ? { ...entry, distractors: ["い", "い", "う"] } : entry
    )));

    expect(validateKanaEntries(entriesWithTwoDistractors)).toEqual([
      { code: "invalid-distractors", item: "あ" },
    ]);
    expect(validateKanaEntries(entriesWithFourDistractors)).toEqual([
      { code: "invalid-distractors", item: "あ" },
    ]);
    expect(validateKanaEntries(entriesWithDuplicateDistractors)).toEqual([
      { code: "invalid-distractors", item: "あ" },
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
