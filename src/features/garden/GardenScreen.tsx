import { useEffect } from "react";

import { getWorldIllustration } from "../learning/content/assetCatalog";
import { KANA_ENTRIES, KANA_ORDER } from "../learning/content/kana";
import type { KanaCharacter } from "../learning/content/types";
import type { LearningProgress, LearningRoute } from "../learning/model/types";
import { ParentGate } from "../parent/ParentGate";
import { KanaFlower } from "./KanaFlower";
import "./GardenScreen.css";

/** 進捗と一時導線を表示する、朝の文字の庭の公開入力。 */
export interface GardenScreenProps {
  readonly progress: LearningProgress;
  readonly resumeRoute: LearningRoute;
  readonly onContinue: () => void;
  readonly onReview: (character: KanaCharacter) => void;
  readonly onOpenParent: () => void;
}

const ROWS = ["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa"] as const;

/** 完了数を、数値スコアではなく庭の育ち具合として表示する。 */
function completedCount(progress: LearningProgress): number {
  return KANA_ORDER.filter((character) => progress.kana[character].completedOnce).length;
}

/** 46区画を行構造のまま表示し、続きと任意復習を明確に分ける。 */
export function GardenScreen({ progress, resumeRoute, onContinue, onReview, onOpenParent }: GardenScreenProps): React.JSX.Element {
  const background = getWorldIllustration("garden-background");
  const wateringCan = getWorldIllustration("watering-can");
  const count = completedCount(progress);

  useEffect(() => {
    // GardenScreen単体でも、画面状態をDOMから確認できるようにする。
    document.documentElement.dataset.gardenRoute = resumeRoute.kind;
    return () => { delete document.documentElement.dataset.gardenRoute; };
  }, [resumeRoute.kind]);

  return (
    <main className="gardenScreen" data-testid="garden-screen" data-reduced-motion={progress.settings.reducedMotion || undefined} style={{ backgroundImage: `url(${background.src})` }}>
      <header className="gardenScreen__header">
        <p aria-label="さいた はな">はなが {count} さいたよ</p>
        <ParentGate onOpen={onOpenParent} />
      </header>
      <section className="gardenScreen__beds" aria-label="もじの はなばたけ">
        {ROWS.map((row) => (
          <div className="gardenScreen__row" key={row} aria-label={`${row} の はなだん`}>
            {KANA_ENTRIES.filter((entry) => entry.row === row).map((entry) => (
              <KanaFlower key={entry.character} entry={entry} completed={progress.kana[entry.character].completedOnce} onReview={onReview} />
            ))}
          </div>
        ))}
      </section>
      <footer className="gardenScreen__continue" data-layout="garden-continue">
        <button className="gardenScreen__watering" type="button" aria-label="つづきを あそぶ" onClick={onContinue}>
          <img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} />
          <span>つづきを あそぶ</span>
        </button>
      </footer>
    </main>
  );
}
