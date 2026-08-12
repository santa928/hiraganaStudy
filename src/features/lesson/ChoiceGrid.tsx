import type { KanaCharacter } from "../learning/content/types";
import { SuccessBloom } from "./SuccessBloom";

/** 文字だけの三択を、見本の有無と案内状態から描画する。 */
export interface ChoiceGridProps {
  readonly choices: readonly KanaCharacter[];
  readonly correct: KanaCharacter;
  readonly guideCount: number;
  readonly onChoose: (choice: KanaCharacter) => void;
  readonly successChoice?: KanaCharacter;
  readonly disabled?: boolean;
}

/** 絵や読み仮名を一切含めない、形合わせ・行音復習共通の文字選択肢。 */
export function ChoiceGrid({ choices, correct, guideCount, onChoose, successChoice, disabled = false }: ChoiceGridProps): React.JSX.Element {
  return (
    <div className="choiceGrid" aria-label="もじを えらぶ" data-choice-count={choices.length}>
      {choices.map((choice) => {
        const guided = guideCount >= 2 && choice === correct;
        const successful = successChoice === choice;
        return (
          <div className="choiceGrid__cell" key={choice}>
            <button
              className={`choiceGrid__choice ${guided ? "choiceGrid__choice--guide" : ""}`}
              type="button"
              data-guided={guided || undefined}
              data-success={successful || undefined}
              aria-label={`もじ ${choice}`}
              disabled={disabled}
              onClick={() => onChoose(choice)}
            >
              {choice}
            </button>
            {successful ? <SuccessBloom character={choice} /> : null}
          </div>
        );
      })}
    </div>
  );
}
