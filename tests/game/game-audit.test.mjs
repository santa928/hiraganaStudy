/* global process */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeWritingSamples, findContainmentIssues, findGuideReadabilityIssues, findSuccessOverlayIssues } from "./assertions/check-containment.mjs";
import { backgroundImageUrl } from "./assertions/wait-for-visuals.mjs";
import { createProgressFixture, loadScenario } from "./run-scenarios.mjs";

const REPOSITORY_ROOT = resolve(process.cwd());

describe("完成版browser監査の固定scenario", () => {
  it("CSS背景のurlを画像decode待機の対象として抽出する", () => {
    expect(backgroundImageUrl('url("https://example.test/garden-background.webp")'))
      .toBe("https://example.test/garden-background.webp");
    expect(backgroundImageUrl("url('/hiraganaStudy/assets/world/garden-background.webp')"))
      .toBe("/hiraganaStudy/assets/world/garden-background.webp");
    expect(backgroundImageUrl("none")).toBeNull();
  });

  it("初回・書字・行復習・45/46解放の4 scenarioを機械読取できる", async () => {
    const scenarios = await Promise.all([
      "first-kana.json",
      "writing.json",
      "row-review-home.json",
      "word-unlock.json",
    ].map((name) => loadScenario(resolve(REPOSITORY_ROOT, "tests/game/scenarios", name))));

    expect(scenarios.map((scenario) => scenario.id)).toEqual(["first-kana", "writing", "row-review-home", "word-unlock"]);
    expect(scenarios[0].flow.some((step) => step.action === "clickWrongKana")).toBe(true);
    expect(scenarios[0].flow.some((step) => step.action === "clickButton" && step.name === "にわへ もどる")).toBe(true);
    expect(scenarios[0].flow.some((step) => step.action === "expectState" && step.screen === "garden" && step.stage === "shapeMatch")).toBe(true);
    expect(scenarios[0].flow.some((step) => step.action === "completeSoundMatchIfAvailable")).toBe(true);
    expect(scenarios[0].flow.some((step) => step.action === "expectSuccess" && step.capture === "shape-success")).toBe(true);
    expect(scenarios[0].flow.some((step) => step.action === "expectState" && step.stage === "soundMatch")).toBe(false);
    expect(scenarios[1].flow.filter((step) => step.action === "drawAndContinue")).toHaveLength(4);
    expect(scenarios[1].flow.some((step) => step.action === "expectSuccess" && step.capture === "writing-success")).toBe(true);
    expect(scenarios[2].flow.some((step) => step.action === "clickButton" && step.name === "にわへ もどる")).toBe(true);
    expect(scenarios[3].sessions).toHaveLength(2);
  });

  it("test-only保存fixtureは45文字と46文字の境界だけを変える", () => {
    const locked = createProgressFixture({ completedKanaCount: 45, currentKana: "ん", stage: "intro" });
    const unlocked = createProgressFixture({ completedKanaCount: 46, currentKana: "ん", stage: "reward" });

    expect(Object.values(locked.kana).filter((entry) => entry.completedOnce)).toHaveLength(45);
    expect(locked.kana.ん.completedOnce).toBe(false);
    expect(Object.values(unlocked.kana).filter((entry) => entry.completedOnce)).toHaveLength(46);
    expect(Object.keys(unlocked.words)).toHaveLength(60);
  });

  it("親境界・8px gap・48px touch targetの違反を対象名付きで返す", () => {
    const issues = findContainmentIssues({
      viewport: { width: 390, height: 844 },
      root: { left: 0, top: 0, right: 391, bottom: 844, width: 391, height: 844 },
      card: { left: 10, top: 100, right: 380, bottom: 700, width: 370, height: 600 },
      children: [{ name: "illustration", rect: { left: 20, top: 120, right: 381, bottom: 200, width: 361, height: 80 } }],
      hudBottom: 80,
      materialTop: 84,
      targets: [{ name: "choice-a", rect: { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 } }],
    });

    expect(issues).toContain("root右端overflow: 391 > 390");
    expect(issues).toContain("card内overflow: illustration");
    expect(issues).toContain("HUDと教材のgap不足: 4px");
    expect(issues).toContain("touch target不足: choice-a 40x40");
  });

  it("書字開始前のidle paintを30fps連続遅延へ数えない", () => {
    const metrics = analyzeWritingSamples({
      pointerTimes: [100, 110, 120],
      paintTimes: [0, 50, 90, 105, 125, 145],
    });

    expect(metrics.frameIntervalsMs).toEqual([20, 20]);
    expect(metrics.maxPointerToPaintMs).toBe(15);
    expect(metrics.consecutiveFrameIntervalsOver38Ms).toBe(0);
  });

  it("次のpointer自体が遅い区間をCanvasの連続描画遅延に数えない", () => {
    const metrics = analyzeWritingSamples({
      pointerTimes: [100, 300, 500, 700],
      paintTimes: [105, 305, 505, 705],
    });

    expect(metrics.frameIntervalsMs).toEqual([200, 200, 200]);
    expect(metrics.maxPointerToPaintMs).toBe(5);
    expect(metrics.consecutiveFrameIntervalsOver38Ms).toBe(0);
  });

  it("主要選択肢の64px不足と親・viewport外配置を同時に拒否する", () => {
    const root = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
    const issues = findContainmentIssues({
      viewport: { width: 390, height: 844 },
      root,
      card: { left: 10, top: 100, right: 410, bottom: 700, width: 400, height: 600 },
      children: [],
      regions: [
        {
          name: "card",
          rect: { left: 10, top: 100, right: 410, bottom: 700, width: 400, height: 600 },
          parentRect: { left: 20, top: 90, right: 370, bottom: 710, width: 350, height: 620 },
        },
        {
          name: "actions",
          rect: { left: 380, top: 90, right: 430, bottom: 200, width: 50, height: 110 },
          parentRect: root,
        },
      ],
      hudBottom: 80,
      materialTop: 100,
      targets: [{
        name: "choice-outside",
        primary: true,
        rect: { left: 400, top: 100, right: 450, bottom: 150, width: 50, height: 50 },
        parentRect: root,
      }],
    });

    expect(issues).toContain("touch target不足: choice-outside 50x50 (64px必要)");
    expect(issues).toContain("touch target親境界外: choice-outside");
    expect(issues).toContain("touch target viewport外: choice-outside");
    expect(issues).toContain("layout親境界外: card");
    expect(issues).toContain("layout viewport外: card");
    expect(issues).toContain("layout親境界外: actions");
    expect(issues).toContain("layout viewport外: actions");
  });

  it("次の描画frameへ対応しなかったpointerを欠落として数える", () => {
    const metrics = analyzeWritingSamples({
      pointerTimes: [100, 110, 120],
      paintTimes: [105],
    });

    expect(metrics.unpaintedPointerEvents).toBe(2);
  });

  it("成功表示の親・viewport外配置と操作遮断を拒否する", () => {
    const issues = findSuccessOverlayIssues({
      viewport: { width: 390, height: 844 },
      rect: { left: 300, top: 760, right: 410, bottom: 860, width: 110, height: 100 },
      parentRect: { left: 280, top: 740, right: 380, bottom: 840, width: 100, height: 100 },
      pointerEvents: "auto",
      homeDisabled: true,
    });

    expect(issues).toEqual([
      "成功表示が対象外",
      "成功表示がviewport外",
      "成功表示が操作を遮断: auto",
      "成功中に家が無効",
    ]);
  });

  it("透明・低contrast・余白不足の問題案内を拒否する", () => {
    expect(findGuideReadabilityIssues({
      backgroundColor: "rgba(255, 255, 255, 0)",
      color: "rgb(245, 245, 245)",
      paddingBlockStart: 2,
      paddingBlockEnd: 2,
      lineHeight: 17,
      fontSize: 16,
    })).toEqual([
      "案内札の背景が不透明でない: rgba(255, 255, 255, 0)",
      "案内札の文字contrast不足",
      "案内札の上下padding不足: 2px/2px",
      "案内札の行間不足: 17px/16px",
    ]);

    expect(findGuideReadabilityIssues({
      backgroundColor: "rgba(255, 244, 215, 0.96)",
      color: "rgb(35, 51, 95)",
      paddingBlockStart: 6,
      paddingBlockEnd: 6,
      lineHeight: 22,
      fontSize: 16,
    })).toEqual([]);
  });

  it("READMEの公式Playwright imageをlockfileと同じ版にして空volumeへ依存しない", async () => {
    const [readme, lockSource] = await Promise.all([
      readFile(resolve(REPOSITORY_ROOT, "README.md"), "utf8"),
      readFile(resolve(REPOSITORY_ROOT, "package-lock.json"), "utf8"),
    ]);
    const lock = JSON.parse(lockSource);
    const playwrightVersion = lock.packages["node_modules/playwright"].version;

    expect(readme).toContain(`mcr.microsoft.com/playwright:v${playwrightVersion}-noble`);
    expect(readme).not.toContain("hiraganastudy_playwright_browsers:/ms-playwright:ro");
  });
});
