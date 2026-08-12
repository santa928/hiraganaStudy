import { getIllustration } from "../learning/content/assetCatalog";
import type { KanaEntry } from "../learning/content/types";

/** 花に育った文字とイラストを、書字体験の鉛筆印と分離して表示する。 */
export function RewardStep({ entry, writingCompleted }: { readonly entry: KanaEntry; readonly writingCompleted: boolean }): React.JSX.Element {
  const illustration = getIllustration(entry.illustrationKey);
  return (
    <section className="rewardStep" data-testid="reward-step">
      <div className="rewardStep__flower" aria-label={`${entry.character} の はな`}><span>{entry.character}</span>{writingCompleted ? <span className="rewardStep__pencil" data-pencil-badge aria-label="かく れんしゅうも した"><svg viewBox="0 0 32 32" focusable="false" aria-hidden="true"><path d="m7 23 2-7L22 3l7 7-13 13-7 2zM19 6l7 7M9 16l7 7" /></svg></span> : null}</div>
      <img className="rewardStep__illustration" src={illustration.src} alt={illustration.alt} width={illustration.width} height={illustration.height} />
    </section>
  );
}
