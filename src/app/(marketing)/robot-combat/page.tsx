import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Robot Combat",
  description: "Build and fight in Bay 13.",
};

export default function RobotCombatMarketingPage() {
  return (
    <div className="launcher-game-page launcher-robot-page">
      <section className="launcher-game-hero shell">
        <div className="launcher-game-copy">
          <p className="launcher-kicker"><span /> ROBOT COMBAT / BAY 13</p>
          <h1>Build &amp; fight.</h1>
          <p>
            Choose the parts, test the machine, and take your build onto the free arena floor.
          </p>
          <div className="launcher-action-row">
            <Link className="launcher-play-button launcher-play-button-large" href="/auth/register">
              Enter the garage
            </Link>
            <Link className="launcher-secondary-link" href="/">
              Back to games <span>↗</span>
            </Link>
          </div>
          <div className="launcher-rule-line">
            <span>BUILD</span>
            <span>TEST</span>
            <span>ARENA</span>
          </div>
        </div>
        <div className="launcher-game-showcase launcher-arena-showcase">
          <img src="/games/bay-13/index.png" alt="Bay 13 robot combat arena" />
          <div className="launcher-arena-overlay">
            <span>BAY 13</span>
            <strong>THE SCRAPYARD</strong>
          </div>
        </div>
      </section>

      <section className="launcher-game-rail shell">
        <div><b>01</b><strong>Assemble</strong><span>Frame, drive, power, armor, weapon.</span></div>
        <div><b>02</b><strong>Inspect</strong><span>See what the build can really do.</span></div>
        <div><b>03</b><strong>Fight</strong><span>Take a valid machine into the arena.</span></div>
      </section>
    </div>
  );
}
