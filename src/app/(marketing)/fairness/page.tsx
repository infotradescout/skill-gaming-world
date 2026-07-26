import type { Metadata } from "next";
import Link from "next/link";
import {
  PageHero,
  Section,
  StatusPill,
} from "@/components/page-elements";

export const metadata: Metadata = {
  title: "Fairness",
  description: "The public Monetaire fairness contract.",
};

const rules = [
  ["01", "Identical deal", "Every ranked entrant receives the same immutable deal."],
  ["02", "Precommitted", "A SHA-256 commitment records the deal before play opens."],
  ["03", "Server validated", "The platform decides whether each sequenced move is legal."],
  ["04", "Official timing", "Client clocks never determine the official result."],
  ["05", "Public ranking", "Completion, valid moves, then verified active time."],
  ["06", "Exact ties", "A tie remains a tie. No random tiebreaker is introduced."],
  ["07", "No paid edge", "Purchases never change difficulty, hints, time, or deal order."],
  ["08", "No hidden humans", "Bots may not be represented as human competitors."],
  ["09", "Auditable correction", "Score changes require an append-only adjustment record."],
  ["10", "Appeal available", "A player can challenge a result or fairness decision."],
];

export default function FairnessPage() {
  return (
    <>
      <PageHero
        eyebrow="Public fairness contract"
        title={
          <>
            A result should be
            <br />
            <em>reproducible.</em>
          </>
        }
        actions={
          <>
            <Link className="button button-primary" href="/app/monetaire/practice">
              Inspect a practice deal
            </Link>
            <Link className="button button-secondary" href="/monetaire/how-it-works">
              See the full sequence
            </Link>
          </>
        }
        aside={
          <div className="competition-formula surface">
            <p className="eyebrow">Ranking order</p>
            <ol>
              <li><span>1</span>Completion status</li>
              <li><span>2</span>Fewest valid moves</li>
              <li><span>3</span>Verified active duration</li>
              <li><span>=</span>Exact tie retained</li>
            </ol>
          </div>
        }
      >
        <p>
          Monetaire&apos;s ranked-play standard makes the deal, rules, validation,
          timing, and correction process explicit. It is a product contract, not an
          unsupported claim that every practice deal is solvable.
        </p>
      </PageHero>

      <Section eyebrow="The contract" title="Ten rules players can hold us to.">
        <div className="fairness-ledger surface">
          {rules.map(([number, title, description]) => (
            <div className="fairness-rule" key={number}>
              <span>{number}</span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <StatusPill tone="live">Required</StatusPill>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Deal evidence" title="Commit before. Reveal after.">
        <div className="boundary-diagram surface">
          <div>
            <StatusPill tone="hold">Before opening</StatusPill>
            <h3>Deal commitment</h3>
            <p>The published commitment identifies the selected deal without revealing its seed.</p>
          </div>
          <div>
            <StatusPill tone="live">During play</StatusPill>
            <h3>Immutable event log</h3>
            <p>Sequenced valid moves and server-measured active time form the official record.</p>
          </div>
          <div>
            <StatusPill tone="hold">After closing</StatusPill>
            <h3>Seed reveal</h3>
            <p>The seed can be compared to the prior commitment and used to reproduce the deal.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
