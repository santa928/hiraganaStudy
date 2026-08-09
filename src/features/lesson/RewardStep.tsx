import { getIllustration } from "../learning/content/assetCatalog";
import type { KanaEntry } from "../learning/content/types";

/** 花に育った文字とイラストを、操作領域と分離して表示する。 */
export function RewardStep({ entry }: { readonly entry: KanaEntry }): React.JSX.Element {
  const illustration = getIllustration(entry.illustrationKey);
  return (
    <section className="rewardStep" data-testid="reward-step">
      <div className="rewardStep__flower" aria-label={`${entry.character} の はな`}><span>{entry.character}</span></div>
      <img className="rewardStep__illustration" src={illustration.src} alt={illustration.alt} width={illustration.width} height={illustration.height} />
    </section>
  );
}
