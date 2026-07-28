"use client";

import { useState } from "react";

type Choice = "under" | "seven" | "over";

export function FortuneDice() {
  const [balance, setBalance] = useState(10000);
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState<Choice>("seven");
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [message, setMessage] = useState("Choose an outcome and roll.");
  const [rolling, setRolling] = useState(false);
  const [round, setRound] = useState(1);

  const payout = choice === "seven" ? 4 : 2;

  function roll() {
    if (rolling || bet < 10 || bet > balance) return;
    setRolling(true);
    setMessage("Rolling…");
    window.setTimeout(() => {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      const first = (values[0] % 6) + 1;
      const second = (values[1] % 6) + 1;
      const total = first + second;
      const won =
        (choice === "under" && total < 7) ||
        (choice === "seven" && total === 7) ||
        (choice === "over" && total > 7);
      setDice([first, second]);
      setBalance((current) => current + (won ? bet * (payout - 1) : -bet));
      setMessage(won ? `Winner — ${total}. +${bet * (payout - 1)} PC` : `${total}. Better luck next round.`);
      setRound((current) => current + 1);
      setRolling(false);
    }, 650);
  }

  return (
    <section className="dice-room shell">
      <div className="dice-table">
        <div className="dice-table-head">
          <div><span className="live-dot" /> Fortune Dice</div>
          <span>Round #{String(round).padStart(4, "0")}</span>
        </div>
        <div className="dice-stage">
          <div className={rolling ? "die rolling" : "die"}>{dieFace(dice[0])}</div>
          <div className={rolling ? "die rolling rolling-delay" : "die"}>{dieFace(dice[1])}</div>
        </div>
        <strong className={message.startsWith("Winner") ? "dice-result winner" : "dice-result"}>
          {message}
        </strong>
        <div className="dice-choices">
          <button className={choice === "under" ? "selected" : ""} onClick={() => setChoice("under")} type="button"><small>2–6</small>Under 7 <span>2×</span></button>
          <button className={choice === "seven" ? "selected" : ""} onClick={() => setChoice("seven")} type="button"><small>Exact</small>Lucky 7 <span>4×</span></button>
          <button className={choice === "over" ? "selected" : ""} onClick={() => setChoice("over")} type="button"><small>8–12</small>Over 7 <span>2×</span></button>
        </div>
        <div className="dice-controls">
          <label>
            <span>Play Coins</span>
            <input min="10" max={balance} step="10" type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
          </label>
          <div className="quick-bets">
            {[50, 100, 250, 500].map((value) => <button type="button" onClick={() => setBet(value)} key={value}>{value}</button>)}
          </div>
          <button className="roll-button" disabled={rolling || bet < 10 || bet > balance} onClick={roll} type="button">
            {rolling ? "Rolling…" : `Roll for ${bet} PC`}
          </button>
        </div>
        <div className="dice-footer">
          <span>Balance <strong>{balance.toLocaleString()} PC</strong></span>
          <span>Fairness <strong>Independent round</strong></span>
          <span>Value <strong>Entertainment only</strong></span>
        </div>
      </div>
      <aside className="rules-panel">
        <p className="eyebrow">How it works</p>
        <h2>Simple call.<br />Visible odds.</h2>
        <ol>
          <li><span>1</span>Choose under 7, exactly 7, or over 7.</li>
          <li><span>2</span>Choose a valueless Play Coin amount.</li>
          <li><span>3</span>Roll two fair six-sided dice.</li>
        </ol>
        <div className="odds-box">
          <small>Published probabilities</small>
          <p><span>Under / Over</span><strong>41.67%</strong></p>
          <p><span>Exact 7</span><strong>16.67%</strong></p>
        </div>
        <p className="rules-note">This preview uses the browser&apos;s cryptographic random-number generator. Server-recorded, independently verifiable rounds are required before public competitive operation.</p>
      </aside>
    </section>
  );
}

function dieFace(value: number) {
  return ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value];
}
