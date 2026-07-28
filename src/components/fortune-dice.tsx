"use client";

import { useEffect, useState } from "react";

type Choice = "under" | "seven" | "over";

export function FortuneDice() {
  const [balance, setBalance] = useState(0);
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState<Choice>("seven");
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [message, setMessage] = useState("Choose an outcome and roll.");
  const [rolling, setRolling] = useState(false);
  const [round, setRound] = useState(1);
  const [roundId, setRoundId] = useState("");
  const [commitment, setCommitment] = useState("");
  const [proof, setProof] = useState<{ serverSeed: string; clientSeed: string; nonce: number } | null>(null);

  async function prepareRound() {
    const response = await fetch("/api/fortune-dice", { cache: "no-store" });
    if (response.status === 401) {
      setMessage("Sign in to receive free Play Coins and play.");
      return;
    }
    if (!response.ok) {
      setMessage("The server could not prepare a fair round.");
      return;
    }
    const data = await response.json();
    setRoundId(data.roundId);
    setCommitment(data.commitment);
    setRound(data.nonce + 1);
    setBalance(data.balanceMinor);
  }

  useEffect(() => {
    void fetch("/api/fortune-dice", { cache: "no-store" }).then(
      async (response) => {
        if (response.status === 401) {
          setMessage("Sign in to receive free Play Coins and play.");
          return;
        }
        if (!response.ok) {
          setMessage("The server could not prepare a fair round.");
          return;
        }
        const data = await response.json();
        setRoundId(data.roundId);
        setCommitment(data.commitment);
        setRound(data.nonce + 1);
        setBalance(data.balanceMinor);
      },
    );
  }, []);

  async function roll() {
    if (rolling || !roundId || bet < 10 || bet > balance) return;
    setRolling(true);
    setMessage("Rolling…");
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    const clientSeed = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    try {
      const response = await fetch("/api/fortune-dice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId, choice, wagerMinor: bet, clientSeed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Round failed");
      setDice(data.dice);
      setBalance(data.balanceMinor);
      setProof(data.proof);
      setMessage(data.won ? `Winner — ${data.total}. +${data.netChangeMinor} PC` : `${data.total}. ${data.netChangeMinor} PC`);
      setRoundId("");
      await prepareRound();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The round could not be settled.");
    } finally {
      setRolling(false);
    }
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
          <button className="roll-button" disabled={rolling || !roundId || bet < 10 || bet > balance} onClick={roll} type="button">
            {rolling ? "Rolling…" : `Roll for ${bet} PC`}
          </button>
        </div>
        <div className="dice-footer">
          <span>Balance <strong>{balance.toLocaleString()} PC</strong></span>
          <span>Fairness <strong>{commitment ? "Seed committed" : "Preparing…"}</strong></span>
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
        <p className="rules-note">
          The server commits to a hidden seed before every wager, then reveals it
          after settlement. Commitment: <code>{commitment ? `${commitment.slice(0, 16)}…` : "preparing"}</code>
        </p>
        {proof ? (
          <details className="rules-note">
            <summary>Verify the last round</summary>
            <code>HMAC-SHA256({proof.serverSeed}, {proof.clientSeed}:{proof.nonce})</code>
          </details>
        ) : null}
      </aside>
    </section>
  );
}

function dieFace(value: number) {
  return ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value];
}
