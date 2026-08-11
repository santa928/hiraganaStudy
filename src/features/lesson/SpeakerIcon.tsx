/** 端末や年齢に依存せず「音を聞く」と伝える、共通スピーカー記号。 */
export function SpeakerIcon(): React.JSX.Element {
  return (
    <svg className="speakerIcon" aria-hidden="true" viewBox="0 0 64 64" focusable="false">
      <path d="M10 26h12l16-13v38L22 38H10z" />
      <path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" />
    </svg>
  );
}
