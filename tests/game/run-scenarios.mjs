/* global console, document, HTMLButtonElement, localStorage, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import { waitForVisualAssets } from "./assertions/wait-for-visuals.mjs";

const KANA_ORDER = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"];
const WORDS = [
  "いえ", "かお", "かき", "かさ", "くし", "こま", "さる", "しか", "すし", "たこ", "つき", "なす",
  "あひる", "いぬ", "うさぎ", "えんぴつ", "きりん", "くるま", "こあら", "さかな", "しまうま", "すいか", "たいこ", "つみき",
  "かがみ", "いちご", "ごりら", "ぞう", "ざりがに", "だるま", "でんしゃ", "どうぶつ", "ばなな", "ぶた", "ぱんだ", "ぴあの",
  "きって", "こっぷ", "らっぱ", "きっぷ", "せっけん", "はっぱ", "しっぽ", "べっど", "ろけっと", "ぽけっと", "ざっし", "がっき",
  "きゃべつ", "きゅうり", "きょうりゅう", "しゃしん", "しゅりけん", "しょうぼうしゃ", "ちゃわん", "ちゅうりっぷ", "ちょうちょ", "にんぎょう", "りゅっく", "ぎゅうにゅう",
];
const STAGES = ["intro", "shapeMatch", "soundMatch", "traceWide", "traceNarrow", "copyWithModel", "freeWrite", "reward"];
const FALLBACK_KEY = "hiragana-no-niwa:progress:v1";

/** test-onlyの開始状態を、productionの保存schemaと同じ形で作る。 */
export function createProgressFixture({ completedKanaCount = 0, currentKana = KANA_ORDER[Math.min(completedKanaCount, 45)], stage = "intro", rowReview = null } = {}) {
  const currentKanaIndex = Math.max(0, KANA_ORDER.indexOf(currentKana));
  const currentStageIndex = Math.max(0, STAGES.indexOf(stage));
  const kana = Object.fromEntries(KANA_ORDER.map((character, index) => {
    const completed = index < completedKanaCount;
    const isCurrent = index === currentKanaIndex;
    const reached = (targetStage) => completed || (isCurrent && currentStageIndex >= STAGES.indexOf(targetStage));
    return [character, {
      seen: completed || (isCurrent && stage !== "intro"),
      shapeMatched: completed || (isCurrent && (stage === "soundMatch" || currentStageIndex >= STAGES.indexOf("traceWide"))),
      soundMatched: completed,
      traceWideTried: reached("traceNarrow"),
      traceNarrowTried: reached("copyWithModel"),
      copyTried: reached("freeWrite"),
      freeWriteTried: reached("reward"),
      completedOnce: completed,
      guideCount: 0,
    }];
  }));
  const words = Object.fromEntries(WORDS.map((word, index) => [
    `w${Math.floor(index / 12) + 1}-${String((index % 12) + 1).padStart(2, "0")}`,
    { selected: false, arranged: false, writingTried: false },
  ]));

  return {
    schemaVersion: 1,
    currentKanaIndex,
    stage,
    rowReview,
    lessonAttempt: null,
    kana,
    words,
    settings: { speech: false, music: false, effects: false, reducedMotion: true },
  };
}

/** JSON scenarioを読み、最低限の識別子を検証する。 */
export async function loadScenario(path) {
  const scenario = JSON.parse(await readFile(path, "utf8"));
  if (!scenario || typeof scenario.id !== "string") throw new Error(`Scenario idがありません: ${path}`);
  if (!Array.isArray(scenario.flow) && !Array.isArray(scenario.sessions)) throw new Error(`Scenario flowがありません: ${path}`);
  return scenario;
}

/** CLI引数をproduction browser監査の設定へ変換する。 */
function parseArguments(argv) {
  const options = {
    url: "http://127.0.0.1:4173",
    outputDirectory: "test-results/game/scenarios",
    scenarioDirectory: "tests/game/scenarios",
    viewport: { width: 390, height: 844 },
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/ms-playwright/chromium-1234/chrome-linux/chrome",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--url" && value) options.url = value;
    else if (argv[index] === "--output-dir" && value) options.outputDirectory = value;
    else if (argv[index] === "--scenario-dir" && value) options.scenarioDirectory = value;
    else if (argv[index] === "--executable-path" && value) options.executablePath = value;
    else if (argv[index] === "--viewport" && value) {
      const [width, height] = value.split("x").map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) options.viewport = { width, height };
    } else continue;
    index += 1;
  }
  return options;
}

/** state hookをJSONとして取得し、未登録も明示的な失敗にする。 */
async function readGameState(page) {
  const raw = await page.evaluate(() => globalThis.render_game_to_text?.() ?? null);
  if (!raw) throw new Error("render_game_to_textが登録されていません");
  return JSON.parse(raw);
}

/** canvasへ実pointer列を送り、次操作buttonが有効になるまで待つ。 */
async function drawStroke(page) {
  const canvas = page.locator("canvas").last();
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("書字canvasの境界を取得できません");
  const start = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.25 };
  const end = { x: box.x + box.width * 0.68, y: box.y + box.height * 0.72 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 18 });
  await page.mouse.up();
  const next = page.getByRole("button", { name: "つぎへ", exact: true });
  await next.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "つぎへ");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
}

/** flowの1操作を実画面へ適用し、状態・画像・consoleを観測可能にする。 */
async function executeStep(page, step, sessionOutput, stateHistory) {
  if (step.action === "clickButton") {
    await page.getByRole("button", { name: step.name, exact: true }).click();
  } else if (step.action === "openLesson") {
    await page.getByRole("button", { name: "つづきを あそぶ", exact: true }).click();
  } else if (step.action === "clickKana") {
    await page.getByRole("button", { name: `もじ ${step.character}`, exact: true }).click();
  } else if (step.action === "clickWrongKana") {
    const state = await readGameState(page);
    const wrong = state.choices.find((choice) => choice !== step.correct);
    if (!wrong) throw new Error("誤答用の文字選択肢がありません");
    await page.getByRole("button", { name: `もじ ${wrong}`, exact: true }).click();
  } else if (step.action === "drawAndContinue") {
    await drawStroke(page);
    await page.getByRole("button", { name: "つぎへ", exact: true }).click();
  } else if (step.action === "expectButton") {
    await page.getByRole("button", { name: step.name, exact: true }).waitFor({ state: "visible" });
  } else if (step.action === "expectNoButton") {
    if (await page.getByRole("button", { name: step.name, exact: true }).count() !== 0) throw new Error(`表示してはいけないbuttonがあります: ${step.name}`);
  } else if (step.action === "expectTargetMinSize") {
    const box = await page.getByRole("button", { name: step.name, exact: true }).boundingBox();
    if (!box || box.width < step.minimum || box.height < step.minimum) {
      throw new Error(`操作領域が${step.minimum}px未満です: ${step.name} ${box ? `${box.width}x${box.height}` : "境界なし"}`);
    }
  } else if (step.action === "expectState") {
    const expected = Object.fromEntries(Object.entries(step).filter(([key]) => key !== "action"));
    try {
      await page.waitForFunction((wanted) => {
        const raw = globalThis.render_game_to_text?.();
        if (!raw) return false;
        const state = JSON.parse(raw);
        return Object.entries(wanted).every(([key, value]) => state[key] === value);
      }, expected, { timeout: 10_000 });
    } catch (error) {
      const current = await readGameState(page);
      throw new Error(`expectState timeout: expected=${JSON.stringify(expected)} current=${JSON.stringify(current)}`, { cause: error });
    }
  } else if (step.action === "expectSuccess") {
    const bloom = page.getByTestId("success-bloom");
    await bloom.waitFor({ state: "visible" });
    if (await page.locator('[data-success="true"], [data-celebrating="true"]').count() === 0) {
      throw new Error("成功対象の装飾がありません");
    }
    if (step.capture) {
      await page.screenshot({ path: join(sessionOutput, `${step.capture}.png`), fullPage: false });
    }
  } else if (step.action === "capture") {
    await waitForVisualAssets(page);
    const path = join(sessionOutput, `${step.name}.png`);
    await page.screenshot({ path, fullPage: false });
  } else {
    throw new Error(`未対応scenario action: ${step.action}`);
  }
  await page.waitForTimeout(80);
  stateHistory.push(await readGameState(page));
}

/** 1 sessionを独立browser contextで実行し、保存やService Workerを持ち越さない。 */
async function runSession(browser, options, scenario, session, consoleErrors) {
  const context = await browser.newContext({ viewport: options.viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const sessionName = session.name ?? scenario.id;
  const sessionOutput = resolve(options.outputDirectory, scenario.id, sessionName);
  const recentRequests = [];
  await mkdir(sessionOutput, { recursive: true });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({
      scenario: scenario.id,
      session: sessionName,
      type: "console",
      text: message.text(),
      location: message.location(),
      recentRequests: recentRequests.slice(-8),
    });
  });
  page.on("pageerror", (error) => consoleErrors.push({ scenario: scenario.id, session: sessionName, type: "pageerror", text: String(error) }));
  page.on("request", (request) => recentRequests.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) consoleErrors.push({
      scenario: scenario.id,
      session: sessionName,
      type: "http",
      status: response.status(),
      url: response.url(),
    });
  });

  if (session.fixture?.kind === "progress") {
    const progress = createProgressFixture(session.fixture);
    await page.addInitScript(({ key, envelope }) => localStorage.setItem(key, JSON.stringify(envelope)), {
      key: FALLBACK_KEY,
      envelope: { revision: 1, writtenAt: 1, writeId: `game-audit-${scenario.id}-${sessionName}`, progress },
    });
  }
  const cacheBuster = `${scenario.id}-${sessionName}-${Date.now()}`;
  const separator = options.url.includes("?") ? "&" : "?";
  await page.goto(`${options.url}${separator}game-audit=${encodeURIComponent(cacheBuster)}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  // 初回に先行tapがない導線でも、React effectの監査hook登録前に状態を読まない。
  await page.waitForFunction(() => typeof globalThis.render_game_to_text === "function", undefined, { timeout: 10_000 });

  const stateHistory = [];
  for (const step of session.flow) await executeStep(page, step, sessionOutput, stateHistory);
  await writeFile(join(sessionOutput, "states.json"), `${JSON.stringify(stateHistory, null, 2)}\n`, "utf8");
  await context.close();
}

/** 4つの完成導線scenarioをproduction previewへ通す。 */
export async function runScenarios(options) {
  const scenarioPaths = ["first-kana.json", "writing.json", "row-review-home.json", "word-unlock.json"]
    .map((name) => resolve(options.scenarioDirectory, name));
  const scenarios = await Promise.all(scenarioPaths.map(loadScenario));
  const browser = await chromium.launch({
    headless: true,
    executablePath: options.executablePath,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const consoleErrors = [];
  try {
    for (const scenario of scenarios) {
      const sessions = scenario.sessions ?? [{ name: scenario.id, fixture: scenario.fixture, flow: scenario.flow }];
      for (const session of sessions) await runSession(browser, options, scenario, session, consoleErrors);
    }
  } finally {
    await browser.close();
  }
  await mkdir(resolve(options.outputDirectory), { recursive: true });
  await writeFile(resolve(options.outputDirectory, "console-errors.json"), `${JSON.stringify(consoleErrors, null, 2)}\n`, "utf8");
  if (consoleErrors.length > 0) throw new Error(`未処理browser error: ${consoleErrors.length}件`);
  console.info(`Game scenarios passed: ${scenarios.map((scenario) => basename(scenario.id)).join(", ")}; console errors 0.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await runScenarios(parseArguments(process.argv));
