import { useState } from "react";

import { WritingCanvas } from "../writing/WritingCanvas";
import { loadStrokeTemplate, type WritingCharacter } from "../writing/data/types";

/** 単語を一文字ずつ書く面の公開入力。 */
export interface WordWritingStepProps {
  readonly cells: readonly string[];
  readonly onComplete: () => void;
}

/** 書字を採点で止めず、一筆ごとに次の独立セルへ進める。 */
export function WordWritingStep({ cells, onComplete }: WordWritingStepProps): React.JSX.Element {
  const [cellIndex, setCellIndex] = useState(0);
  const character = cells[cellIndex];
  const isSmall = character === "っ" || character === "ゃ" || character === "ゅ" || character === "ょ";
  const completeCell = (): void => {
    if (cellIndex + 1 >= cells.length) onComplete();
    else setCellIndex((index) => index + 1);
  };

  return <section className="wordLesson__writing" data-testid="word-writing">
    <p>{character} を かこう</p>
    <div className={`wordLesson__writingCell${isSmall ? " wordLesson__writingCell--small" : ""}`} data-layout="word-writing-cell">
      <WritingCanvas key={`${character}-${cellIndex}`} template={loadStrokeTemplate(character as WritingCharacter)} mode="freeWrite" onAttempt={completeCell} ariaLabel={`${character} を かく`} />
    </div>
    <div className="wordLesson__cellDots" aria-label={`${cellIndex + 1} もじめ`}>{cells.map((cell, index) => <span className={index === cellIndex ? "is-current" : ""} key={`${cell}-${index}`}>{cell}</span>)}</div>
  </section>;
}
