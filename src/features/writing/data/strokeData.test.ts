import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../../learning/content/kana";
import {
  ADVANCED_WRITING_CHARACTERS,
  WRITING_CHARACTERS,
  loadStrokeTemplate,
  type StrokeTemplate,
} from "./types";
import sourceLicense from "../../../../public/licenses/fude-kana-data/LICENSE?raw";
import sourceNotice from "../../../../public/licenses/fude-kana-data/NOTICE?raw";
import thirdPartyNotices from "../../../../THIRD_PARTY_NOTICES.md?raw";

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

const BASIC_WRITING_SEQUENCE = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";
const EXPECTED_RAW_JSON_SHA256: Readonly<Record<string, string>> = {
  "03042.json": "975f23cda9699e2d049c29318e3ce367ddb3b4bdf7ee1ae4a3cf15d7ac2216ba",
  "03044.json": "0dcbe26bf135d2744fc37f01938d622500a0aa0eb60a82ccd1c86afdb8118c7e",
  "03046.json": "8e17272208b1cf8236a1b26cc9abde15701f9a9aeffff539e82fbe4dae582307",
  "03048.json": "d9fa2ea0aec21047c429653a1f567e0cc57e921a0873ab3c9e6d92b997624c87",
  "0304a.json": "9098c5780dacb3b19a9ae4d696a10bbcaf4599b4bce62f65415adafdcdf743a7",
  "0304b.json": "b4a256628bcd09424339f71830d9561c008138d11efe6c40018203050eea8327",
  "0304c.json": "dd8adb82f09bc0dda7386e4d518020aa168e53848dc860aeb3e994fc3aca54e2",
  "0304d.json": "bfc3def1a9e5c6955361ad69ec8836aba5135ce1df78c248a1704881a9596a12",
  "0304e.json": "8dbb2ba50f1c24d5d90bd3d4cb5a1ff05daf09a041405ff76d4511c871d0498a",
  "0304f.json": "d0c1c84b2c38e4dff188cdfb83edee4283732de2f85a305412ac575a5abaab01",
  "03051.json": "4f205f22fc5d36e15fbde4597787f5d2359a0e92a9dc147b14c6fbe0019b8ecd",
  "03053.json": "4dfe99556bc3572aa48a3cc3f7ee7cb3ffbb55ac95d76c0f0718a77c6239d86e",
  "03054.json": "f48632bf3670fa80708f882535e99f2c6c678a872afbe913ffb95003d8913b30",
  "03055.json": "3d5a3adedbc5487f03043f2b1cd335e7a2ab731bf59d2ca5beff62e424c5800e",
  "03056.json": "1710a741486ed1bd6b4e1ff078f0aa16bd7dc2c7378b3be569c5e962b91d972e",
  "03057.json": "23d00262879804b3ea387791ea17a0498f1f97de3699b249599aa654e2180e96",
  "03059.json": "eebc3d1a5bfe3f2af9b5200f667d95a9a2a2970c903c936548c97f2c2e900494",
  "0305b.json": "ee2e114d9868da440dbd0edb466b51292fa191b00c995f21d54ac06a66f83cde",
  "0305d.json": "6d87d628392c92f5541df8caf4d73554bc5ab2feea67d57e6cfc08cfbe3504e3",
  "0305e.json": "82131b931b24ffac13c5056144c8ebc8972373c459527197827578e49472945b",
  "0305f.json": "de02d50ccd4fa69430fa36638743b8ad4f6bcf1fdb987485aa44f1fd77b7a37c",
  "03060.json": "9470e353d2b2bd0069c329320cb117cf61c20d151025e75a1e8759045514e28d",
  "03061.json": "f7af869ce91b96fe0a1ff442c56e5983d3f861d2b3159cff74c6b8104244ef2c",
  "03063.json": "d384f495d2de3fb2b479e1cd1785ccb56e3b754efb43e8cd33fc8f83107790fe",
  "03064.json": "65e063d4dd3c5ae7d76a43b53007bc1b80d13f538a63747459f60367c39db6d5",
  "03066.json": "fc8fb285c54e63f034e0e2cb5dd133a0e9a510eafa745709a0fe6aec99d13754",
  "03067.json": "cb706c63fe24048cdf98e8d71231b85c896a42071d735fb1626ec5bc648e32b0",
  "03068.json": "f41c0e4b8c54769b3d288c85a1bd5efc8eb5530347d729bd0c4daf51c551cde7",
  "03069.json": "fb2eedf7031cddcf328836cf7c926ddd8ff37ae37e89dcb3b9ad0f59bdcba8f1",
  "0306a.json": "90e72ab367536784278b5d819e142d1ded8e7e5fe980a70e73a756a387c21585",
  "0306b.json": "d6058128d7b633c5dd869e2e0d2cfe210a442d792eaee4c35deb02a43996a970",
  "0306c.json": "2570e78bb1f908c3bdd5b05c0f9e5919c8bae0c8ca506745df7ad2e9ccb7058a",
  "0306d.json": "5c5ff68566b2d65b36e29a2fafe2e1925878e407d21cf654cc244f7e20d6e167",
  "0306e.json": "03da420f30544e2b877cda4da0cf1b90cedf9c233bf1cfcef25fb636919b5fc3",
  "0306f.json": "3dd225ef8605a629ba8ad571a784329613cb06f7402ad2137c81ad9ecb8c4ca7",
  "03070.json": "d0293f69a48ba3ee694a5fad8c7306a0b62232165dcad9cf6d6929c0f15c04ae",
  "03071.json": "09eac5724a2cc42bff07949ce509aa850bf5edbd4b2ea490612ba0e0fd3db344",
  "03072.json": "9348651fd0eba9b5383273dcaf5595b7352b08db1aeee5bbac3d6c32e4d8f4f6",
  "03074.json": "8baf6d5e52070ad033fa0c6dbefd52d2d12ee8ef46389df073e1bd6bd064b49d",
  "03075.json": "cffe7396d04957ac9b2b028204c24dfb1e223e8c207a32c4f6a987eeedfb43d2",
  "03076.json": "d34bd3d020f7e63d39afd96cf91c737c9811a4371d09d160614e8e348e8346fc",
  "03077.json": "aaee09de1a7763094b899de7d09d9b472adcecd4439676916fde184ea19b9621",
  "03078.json": "da16c6c0889d48b2c2d3bd838af1e77ce494af69546a8297e5e3f7b39c4023a5",
  "03079.json": "1f126d23619ef61ce6c09601824b9cfdf243d34cf8acdff7d1d106995e2f87a3",
  "0307b.json": "e8d8d871d45236942302b00ebbc6b1a068d91afe1707b297c7f6dea9eed338e6",
  "0307c.json": "4bed5c094f2eec3c506a485bb56621e4fc5e01c7f7ca6f3292a40a0a73775288",
  "0307e.json": "9721535d6e3789ace70cc6ef365a479f86e8d749a6ef2a5fa2340b1dcd9dc9ad",
  "0307f.json": "a0a3d9102f5e1e379f492db6261182e569cb7df4cf084d27c83c86ede15baeb7",
  "03080.json": "664219934656f28d3eda0d86a87ae6de933f5273ee004f75a9e0d70e612a4533",
  "03081.json": "5bc494376d6b795c9de2fef0283bec6a5752039153345cfd1ac4ad4e8d3f19af",
  "03082.json": "c827f04ffba23d566bb44e9673ab0907e5fddca8a6e57adec5feb30513f14984",
  "03083.json": "8dfec3b1d672df5dbccd231bcc158548ba6604eb10100dba9fe6764f52a219ae",
  "03084.json": "29b9185dd1433e61fb6542c925af7f2094b9aa59beb9a72c8087087a4de3e97b",
  "03085.json": "7bce5149f00354ec14fa8eac84e28b61f4c78b616062be921d8f26a66b2b4063",
  "03086.json": "25c25f8e192e8591602cd29a4172e0639b905dd21c717bdcf71ee51379f0a4c3",
  "03087.json": "65e05a2ca54f2f9e63bb7a1ccdca7326e938b6d17d8da1d5d71786a44730421d",
  "03088.json": "0d4205e82fae74f766ea38b5c4a8afd18987be1660f84f16a372d1e8ef50a400",
  "03089.json": "d122e9629402e4c7dacab0931cf07f94b292986145b02a91b1463496311e12ca",
  "0308a.json": "0c2e8dcdb0a1ac7ef6ff2d8be404cd4e445d986d6de64854470ea6a13b580601",
  "0308b.json": "260b80a5c424ee07b478bd0735ba433845b5db5b193e6ac1c350a769d30045c5",
  "0308c.json": "a4bf4a6c676f1c9a8c376c2074c19b7980051850df29c4d2e734172cb2c21b09",
  "0308d.json": "4b3ffcfad974d0b7b2ac449be521deec5e93b68fb350ed59995809a253ba90fc",
  "0308f.json": "1d70fc329a0093cbcce0a7b9ef9e7dcf6b239e66fe343043359c5c05fc7767be",
  "03092.json": "1edbd64786f65a01e5ff3a24f208c6bdbfe32ae6fbcf130490a607ec7b932f7e",
  "03093.json": "257e56cb06fd6f8a1b3afff9607ba79109d691e15846633daedc24aaaa580b3d",
};
const FIXED_SOURCE = "https://raw.githubusercontent.com/karimghezali/fude-kana-data/ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319";
const LICENSE_SHA256 = "0e27c33247b762f9fb0a02102f743c4e23f0cee456de5d7e1b50e837addeb92b";

const generatedModules = import.meta.glob("./generated/*.json", {
  eager: true,
  import: "default",
}) as Readonly<Record<string, unknown>>;
const rawGeneratedModules = import.meta.glob("./generated/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Readonly<Record<string, string>>;

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

/** 各文字テンプレートの丸め済み境界ボックスを返す。 */
function boundingBox(template: StrokeTemplate): { readonly width: number; readonly height: number } {
  const points = template.strokes.flatMap((stroke) => stroke.points);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** sourceと同じ下向きY軸で、正規化軌跡とdirection metadataの方向差を返す。 */
function directionDifferenceDegrees(template: StrokeTemplate, strokeIndex: number): number | null {
  const stroke = template.strokes[strokeIndex];
  if (stroke.direction.angle === null) return null;

  const [startX, startY] = stroke.points[0];
  const [endX, endY] = stroke.points.at(-1)!;
  const pathX = endX - startX;
  const pathY = endY - startY;
  const pathLength = Math.hypot(pathX, pathY);
  const directionLength = Math.hypot(stroke.direction.dx, stroke.direction.dy);
  if (pathLength < 0.15 || directionLength < 0.01) return null;

  const dot = Math.min(1, Math.max(-1, ((pathX * stroke.direction.dx) + (pathY * stroke.direction.dy)) / (pathLength * directionLength)));
  return Math.acos(dot) * (180 / Math.PI);
}

/** 生成JSONとLICENSEの内容を、Node型定義に依存せずSHA-256 hexへ変換する。 */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

  it("固定された基本46文字順を教材と書字テンプレートで共有する", () => {
    expect(KANA_ORDER.join("")).toBe(BASIC_WRITING_SEQUENCE);
    expect(WRITING_CHARACTERS.slice(0, 46).join("")).toBe(BASIC_WRITING_SEQUENCE);
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

  it("等方正規化後もsource directionとstroke端点の向きが一致する", () => {
    for (const character of WRITING_CHARACTERS) {
      const template = loadStrokeTemplate(character);
      for (let strokeIndex = 0; strokeIndex < template.strokes.length; strokeIndex += 1) {
        const difference = directionDifferenceDegrees(template, strokeIndex);
        if (difference !== null) expect(difference).toBeLessThanOrEqual(18);
      }
    }
  });

  it("縦長と横長の代表文字はsourceの縦横比を保持する", () => {
    const vertical = boundingBox(loadStrokeTemplate("く"));
    const horizontal = boundingBox(loadStrokeTemplate("へ"));

    expect(vertical.width / vertical.height).toBeCloseTo(0.3082, 3);
    expect(horizontal.width / horizontal.height).toBeCloseTo(1.8661, 3);
  });

  it("65件の生成JSON raw bytesは独立した固定SHA-256と一致する", async () => {
    const expectedFilenames = Object.values(EXPECTED_GENERATED_FILES).sort();
    expect(Object.keys(EXPECTED_RAW_JSON_SHA256).sort()).toEqual(expectedFilenames);

    for (const filename of expectedFilenames) {
      const content = rawGeneratedModules[`./generated/${filename}`];
      expect(content).toBeDefined();
      const hash = await sha256(content);
      expect(hash).toBe(EXPECTED_RAW_JSON_SHA256[filename]);
    }
  });

  it("固定sourceのLICENSEと帰属通知を改変なく保持する", async () => {
    const licenseHash = await sha256(sourceLicense);

    expect(licenseHash).toBe(LICENSE_SHA256);
    for (const content of [sourceNotice, thirdPartyNotices]) {
      expect(content).toContain("karimghezali/fude-kana-data");
      expect(content).toContain("ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319");
      expect(content).toContain(FIXED_SOURCE);
      expect(content).toContain("Ulrich Apel");
      expect(content).toContain("KanjiVG");
      expect(content).toMatch(/resampled/i);
      expect(content).toMatch(/normalised/i);
      expect(content).toMatch(/rounded/i);
      expect(content).toContain("CC BY-SA 3.0");
      expect(content).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
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
