import { KANA_ORDER, type KanaCharacter, type KanaEntry } from "./types";

export { KANA_ORDER };

/** 五十音順で管理する、46文字の導入教材。 */
export const KANA_ENTRIES: readonly KanaEntry[] = [
  { character: "あ", illustrationKey: "kana-a-duck", spokenLabel: "あひる", row: "a", distractors: ["さ", "ゆ", "お"] },
  { character: "い", illustrationKey: "kana-i-dog", spokenLabel: "いぬ", row: "a", distractors: ["た", "ほ", "り"] },
  { character: "う", illustrationKey: "kana-u-rabbit", spokenLabel: "うさぎ", row: "a", distractors: ["か", "へ", "ろ"] },
  { character: "え", illustrationKey: "kana-e-pencil", spokenLabel: "えんぴつ", row: "a", distractors: ["す", "ま", "わ"] },
  { character: "お", illustrationKey: "kana-o-rice-ball", spokenLabel: "おにぎり", row: "a", distractors: ["き", "む", "あ"] },
  { character: "か", illustrationKey: "kana-ka-umbrella", spokenLabel: "かさ", row: "ka", distractors: ["ひ", "め", "な"] },
  { character: "き", illustrationKey: "kana-ki-giraffe", spokenLabel: "きりん", row: "ka", distractors: ["へ", "む", "さ"] },
  { character: "く", illustrationKey: "kana-ku-car", spokenLabel: "くるま", row: "ka", distractors: ["あ", "せ", "へ"] },
  { character: "け", illustrationKey: "kana-ke-yarn", spokenLabel: "けいと", row: "ka", distractors: ["う", "そ", "は"] },
  { character: "こ", illustrationKey: "kana-ko-koala", spokenLabel: "こあら", row: "ka", distractors: ["い", "つ", "に"] },
  { character: "さ", illustrationKey: "kana-sa-fish", spokenLabel: "さかな", row: "sa", distractors: ["う", "へ", "ち"] },
  { character: "し", illustrationKey: "kana-shi-zebra", spokenLabel: "しまうま", row: "sa", distractors: ["あ", "け", "つ"] },
  { character: "す", illustrationKey: "kana-su-watermelon", spokenLabel: "すいか", row: "sa", distractors: ["い", "た", "む"] },
  { character: "せ", illustrationKey: "kana-se-cicada", spokenLabel: "せみ", row: "sa", distractors: ["う", "ま", "そ"] },
  { character: "そ", illustrationKey: "kana-so-sky", spokenLabel: "そら", row: "sa", distractors: ["き", "ぬ", "を"] },
  { character: "た", illustrationKey: "kana-ta-drum", spokenLabel: "たいこ", row: "ta", distractors: ["う", "へ", "に"] },
  { character: "ち", illustrationKey: "kana-chi-butterfly", spokenLabel: "ちょうちょ", row: "ta", distractors: ["あ", "け", "さ"] },
  { character: "つ", illustrationKey: "kana-tsu-blocks", spokenLabel: "つみき", row: "ta", distractors: ["い", "ほ", "し"] },
  { character: "て", illustrationKey: "kana-te-gloves", spokenLabel: "てぶくろ", row: "ta", distractors: ["う", "め", "と"] },
  { character: "と", illustrationKey: "kana-to-tomato", spokenLabel: "とまと", row: "ta", distractors: ["あ", "さ", "の"] },
  { character: "な", illustrationKey: "kana-na-eggplant", spokenLabel: "なす", row: "na", distractors: ["い", "す", "め"] },
  { character: "に", illustrationKey: "kana-ni-carrot", spokenLabel: "にんじん", row: "na", distractors: ["う", "ほ", "れ"] },
  { character: "ぬ", illustrationKey: "kana-nu-stuffed-toy", spokenLabel: "ぬいぐるみ", row: "na", distractors: ["あ", "か", "め"] },
  { character: "ね", illustrationKey: "kana-ne-cat", spokenLabel: "ねこ", row: "na", distractors: ["う", "さ", "れ"] },
  { character: "の", illustrationKey: "kana-no-vehicles", spokenLabel: "のりもの", row: "na", distractors: ["き", "へ", "め"] },
  { character: "は", illustrationKey: "kana-ha-flower", spokenLabel: "はな", row: "ha", distractors: ["い", "そ", "ほ"] },
  { character: "ひ", illustrationKey: "kana-hi-chick", spokenLabel: "ひよこ", row: "ha", distractors: ["う", "け", "り"] },
  { character: "ふ", illustrationKey: "kana-fu-balloon", spokenLabel: "ふうせん", row: "ha", distractors: ["あ", "さ", "へ"] },
  { character: "へ", illustrationKey: "kana-he-snake", spokenLabel: "へび", row: "ha", distractors: ["い", "ぬ", "く"] },
  { character: "ほ", illustrationKey: "kana-ho-star", spokenLabel: "ほし", row: "ha", distractors: ["う", "さ", "は"] },
  { character: "ま", illustrationKey: "kana-ma-pillow", spokenLabel: "まくら", row: "ma", distractors: ["い", "け", "め"] },
  { character: "み", illustrationKey: "kana-mi-mandarin", spokenLabel: "みかん", row: "ma", distractors: ["あ", "せ", "ぬ"] },
  { character: "む", illustrationKey: "kana-mu-insect", spokenLabel: "むし", row: "ma", distractors: ["い", "た", "め"] },
  { character: "め", illustrationKey: "kana-me-glasses", spokenLabel: "めがね", row: "ma", distractors: ["う", "さ", "ぬ"] },
  { character: "も", illustrationKey: "kana-mo-peach", spokenLabel: "もも", row: "ma", distractors: ["い", "た", "わ"] },
  { character: "や", illustrationKey: "kana-ya-mountain", spokenLabel: "やま", row: "ya", distractors: ["い", "す", "わ"] },
  { character: "ゆ", illustrationKey: "kana-yu-snowman", spokenLabel: "ゆきだるま", row: "ya", distractors: ["あ", "け", "よ"] },
  { character: "よ", illustrationKey: "kana-yo-yacht", spokenLabel: "よっと", row: "ya", distractors: ["い", "す", "わ"] },
  { character: "ら", illustrationKey: "kana-ra-lion", spokenLabel: "らいおん", row: "ra", distractors: ["あ", "せ", "る"] },
  { character: "り", illustrationKey: "kana-ri-apple", spokenLabel: "りんご", row: "ra", distractors: ["う", "た", "い"] },
  { character: "る", illustrationKey: "kana-ru-roulette", spokenLabel: "るーれっと", row: "ra", distractors: ["あ", "せ", "ろ"] },
  { character: "れ", illustrationKey: "kana-re-lemon", spokenLabel: "れもん", row: "ra", distractors: ["い", "た", "ね"] },
  { character: "ろ", illustrationKey: "kana-ro-candle", spokenLabel: "ろうそく", row: "ra", distractors: ["あ", "け", "る"] },
  { character: "わ", illustrationKey: "kana-wa-crocodile", spokenLabel: "わに", row: "wa", distractors: ["い", "す", "れ"] },
  { character: "を", illustrationKey: "kana-wo-apple-eating", spokenLabel: "りんごを たべる", row: "wa", distractors: ["あ", "け", "そ"], specialUsage: "particle" },
  { character: "ん", illustrationKey: "kana-n-bread-ending", spokenLabel: "ぱんの さいごの、ん", row: "wa", distractors: ["あ", "け", "そ"], specialUsage: "wordEnding" },
];

/**
 * 指定文字の教材定義を返す。
 * @throws 指定文字の教材定義が存在しない場合に例外を投げる。
 */
export function findKana(character: KanaCharacter): KanaEntry {
  const entry = KANA_ENTRIES.find((item) => item.character === character);

  if (!entry) {
    throw new Error(`Kana entry is missing: ${character}`);
  }

  return entry;
}

/** イラストの語と学習文字を、頭文字でない「を」「ん」も含め自然に結び付ける。 */
export function kanaAssociationLabel(entry: KanaEntry): string {
  if (entry.specialUsage === "particle") return `${entry.spokenLabel}。もじの ${entry.character}`;
  if (entry.specialUsage === "wordEnding") return entry.spokenLabel;
  return `${entry.spokenLabel}の ${entry.character}`;
}
