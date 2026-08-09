export function CardStudy({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "card-study card-study-compact" : "card-study"} aria-hidden="true">
      <div className="study-grid">
        <span className="study-card study-card-1">
          <b>A</b>
          <i>♠</i>
        </span>
        <span className="study-card study-card-2 red">
          <b>Q</b>
          <i>♥</i>
        </span>
        <span className="study-card study-card-3">
          <b>J</b>
          <i>♣</i>
        </span>
        <span className="study-card study-card-4 red">
          <b>10</b>
          <i>♦</i>
        </span>
      </div>
      <div className="study-orbit study-orbit-one" />
      <div className="study-orbit study-orbit-two" />
      <span className="study-label">Draw 3 · Klondike</span>
    </div>
  );
}
