import type { KanaCharacter } from "../learning/content/types";

/** 花の中心へ再確認する対象文字を渡す。 */
export interface SuccessBloomProps {
  readonly character: KanaCharacter;
}

/** 花びら・対象文字と支援技術向けの短い達成通知を分離して表示する。 */
export function SuccessBloom({ character }: SuccessBloomProps): React.JSX.Element {
  return (
    <div className="successBloom" data-testid="success-bloom">
      <span className="successBloom__petals" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span className="successBloom__petal" key={index} />)}
      </span>
      <p className="successBloom__seal" role="status" aria-live="polite">
        <span className="successBloom__character" data-testid="success-character" aria-hidden="true">{character}</span>
        <span className="successBloom__label">できたね</span>
      </p>
    </div>
  );
}
