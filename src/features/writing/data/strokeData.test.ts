import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../../learning/content/kana";
import {
  ADVANCED_WRITING_CHARACTERS,
  WRITING_CHARACTERS,
  loadStrokeTemplate,
  type StrokeTemplate,
} from "./types";

const EXPECTED_GENERATED_FILES: Readonly<Record<string, string>> = {
  "あ": "03042.json", "い": "03044.json", "う": "03046.json", "え": "03048.json", "お": "0304a.json",
  "か": "0304b.json", "き": "0304d.json", "く": "0304f.json", "け": "03051.json", "こ": "03053.json",
  "さ": "03055.json", "し": "03057.json", "す": "03059.json", "せ": "0305b.json", "そ": "0305d.json",
  "た": "0305f.json", "ち": "03061.json", "つ": "03064.json", "て": "03066.json", "と": "03068.json",
  "な": "0306a.json", "に": "0306b.json", "ぬ": "0306c.json", "ね": "0306d.json", "の": "0306e.json",
  "は": "0306f.json", "ひ": "03072.json", "ふ": "03075.json", "へ": "03078.json", "ほ": "0307b.json",
  "ま": "0307e.json", "み": "0307f.json", "む": "03080.json", "め": "03081.json", "も": "03082.json",
  "や": "03084.json", "ゆ": "03086.json", "よ": "03088.json", "ら": "03089.json", "り": "0308a.json",
  "る": "0308b.json", "れ": "0308c.json", "ろ": "0308d.json", "わ": "0308f.json", "を": "03092.json", "ん": "03093.json",
  "が": "0304c.json", "ぎ": "0304e.json", "ご": "03054.json", "ざ": "03056.json", "ぞ": "0305e.json",
  "だ": "03060.json", "で": "03067.json", "ど": "03069.json", "ば": "03070.json", "ぶ": "03076.json",
  "べ": "03079.json", "ぼ": "0307c.json", "ぱ": "03071.json", "ぴ": "03074.json", "ぷ": "03077.json",
  "っ": "03063.json", "ゃ": "03083.json", "ゅ": "03085.json", "ょ": "03087.json",
};

const generatedModules = import.meta.glob("./generated/*.json", {
  eager: true,
  import: "default",
}) as Readonly<Record<string, unknown>>;

/** テンプレートが描画・採点に必要な有限の正規化点列を持つことを検証する。 */
function expectValidTemplate(template: StrokeTemplate, character: string): void {
  expect(template.character).toBe(character);
  expect(template.strokes.length).toBeGreaterThan(0);

  for (const stroke of template.strokes) {
    expect(stroke.points).toHaveLength(48);
    expect(Number.isFinite(stroke.direction.dx)).toBe(true);
    expect(Number.isFinite(stroke.direction.dy)).toBe(true);
    expect(stroke.direction.angle === null || Number.isFinite(stroke.direction.angle)).toBe(true);
    expect(typeof stroke.isCurl).toBe("boolean");

    for (const [x, y] of stroke.points) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  }
}

describe("書き順テンプレート", () => {
  it("基本46文字と単語用19文字の65件を重複なく公開する", () => {
    expect(ADVANCED_WRITING_CHARACTERS).toEqual([
      "が", "ぎ", "ご", "ざ", "ぞ", "だ", "で", "ど", "ば", "ぶ",
      "べ", "ぼ", "ぱ", "ぴ", "ぷ", "っ", "ゃ", "ゅ", "ょ",
    ]);
    expect(WRITING_CHARACTERS).toEqual([...KANA_ORDER, ...ADVANCED_WRITING_CHARACTERS]);
    expect(new Set(WRITING_CHARACTERS)).toHaveLength(65);
  });

  it("対象65文字だけの5桁小文字codepoint JSONを生成する", () => {
    const generatedFileNames = Object.keys(generatedModules)
      .map((path) => path.split("/").at(-1))
      .sort();
    const expectedFileNames = Object.values(EXPECTED_GENERATED_FILES).sort();

    expect(generatedFileNames).toEqual(expectedFileNames);
    expect(Object.keys(EXPECTED_GENERATED_FILES)).toHaveLength(65);
  });

  it("各生成ファイルは対応文字の48点ストロークを持つ", () => {
    for (const character of WRITING_CHARACTERS) {
      const filename = EXPECTED_GENERATED_FILES[character];
      expect(filename).toBeDefined();
      expect(generatedModules[`./generated/${filename}`]).toBeDefined();
      expectValidTemplate(loadStrokeTemplate(character), character);
    }
  });

  it("ぷの閉ループstrokeはsourceのnull角度と零ベクトルを改変せず保持する", () => {
    expect(loadStrokeTemplate("ぷ").strokes[4].direction).toEqual({ dx: 0, dy: 0, angle: null });
  });

  it("loaderは同じ凍結済みテンプレートを返し、利用側から書き換えられない", () => {
    const template = loadStrokeTemplate("あ");

    expect(loadStrokeTemplate("あ")).toBe(template);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(template.strokes)).toBe(true);
    expect(Object.isFrozen(template.strokes[0])).toBe(true);
    expect(Object.isFrozen(template.strokes[0].points)).toBe(true);
    expect(Object.isFrozen(template.strokes[0].points[0])).toBe(true);
    expect(() => {
      (template.strokes[0].points[0] as unknown as [number, number])[0] = 2;
    }).toThrow(TypeError);
  });
});
