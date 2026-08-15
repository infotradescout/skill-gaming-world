import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Monetaire Works · Skill Gaming World",
};

const steps = [
  ["01", "See the board", "A fresh hand opens with the stock, waste, tableau, and foundations in plain view."],
  ["02", "Choose a route", "Every legal move changes what becomes possible next. There is no paid hint or easier deal."],
  ["03", "Finish the hand", "Move each suit from Ace through King, or learn where the line closed."],
];

export default function HowItWorksPage() {
  return (
    <div className="public-info-page">
      <section className="public-info-hero shell">
        <p className="public-kicker">Monetaire / How it works</p>
        <h1>
          The table stays
          <br />
          <em>easy to read.</em>
        </h1>
        <p>
          Monetaire is Draw 3 solitaire with an intentional pace: the board
          shows you the problem, and your next move is yours.
        </p>
        <Link className="public-primary-button" href="/auth/register">
          Try a practice hand <span>↗</span>
        </Link>
      </section>

      <section className="public-info-steps shell">
        {steps.map(([number, title, copy]) => (
          <div key={number}>
            <span>{number}</span>
            <h2>{title}</h2>
            <p>{copy}</p>
          </div>
        ))}
      </section>

      <section className="public-info-note shell">
        <div>
          <p className="public-kicker">What counts</p>
          <h2>Clear play is the whole point.</h2>
        </div>
        <p>
          Practice, rank, and achievement records use the same published rules.
          Performance does not change the Play Coin boundary: these points are
          for entertainment and cannot be cashed out.
        </p>
        <Link className="public-text-link" href="/fairness">
          Read the fair-play promise <span>↗</span>
        </Link>
      </section>
    </div>
  );
}
