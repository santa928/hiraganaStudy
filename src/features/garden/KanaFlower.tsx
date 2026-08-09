import { useState } from "react";

import { getIllustration } from "../learning/content/assetCatalog";
import type { KanaEntry } from "../learning/content/types";

/** 完了済み文字を、対応イラスト付きで庭へ残す復習用の花。 */
export interface KanaFlowerProps {
  readonly entry: KanaEntry;
  readonly completed: boolean;
  readonly onReview: (character: KanaEntry["character"]) => void;
}

/** 完了済みだけを押せる花にし、画像障害時も文字の復習を残す。 */
export function KanaFlower({ entry, completed, onReview }: KanaFlowerProps): React.JSX.Element {
  const [imageError, setImageError] = useState(false);
  const [retry, setRetry] = useState(0);
  const asset = getIllustration(entry.illustrationKey);

  if (!completed) return <div className="kanaFlower kanaFlower--soil" aria-label="まだ そだつ つち" />;

  const reviewOrRetry = (): void => {
    if (imageError) {
      setRetry((value) => value + 1);
      setImageError(false);
      return;
    }
    onReview(entry.character);
  };

  return <button className="kanaFlower" type="button" aria-label={imageError ? "イラストを もういちど よみこむ" : `${entry.character} を もういちど`} onClick={reviewOrRetry}>
    <span className="kanaFlower__petals" aria-hidden="true" />
    <span className="kanaFlower__character" aria-hidden="true">{entry.character}</span>
    <span className="kanaFlower__badge">
      {imageError ? <span className="kanaFlower__fallback">↻</span> : <img className="kanaFlower__image" src={retry === 0 ? asset.src : `${asset.src}?retry=${retry}`} alt="" width={asset.width} height={asset.height} loading="lazy" onError={() => setImageError(true)} />}
    </span>
  </button>;
}
