import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Robot Combat · Skill Gaming World",
  description: "Build, tune, test, and fight from your own machine.",
};

export default function RobotCombatMarketingPage() {
  return (
    <div className="public-game-page public-robot-page">
      <section className="public-game-hero shell">
        <div className="public-game-copy">
          <p className="public-kicker">Robot Combat / Workshop game</p>
          <h1>
            Build a machine.
            <br />
            <em>Put it to the test.</em>
          </h1>
          <p className="public-game-lead">
            Start with a frame, make a few strong choices, and see what your
            machine becomes when the wheels hit the arena.
          </p>
          <div className="public-action-row">
            <Link className="public-primary-button" href="/auth/register">
              Enter the workshop
            </Link>
            <Link className="public-text-link" href="/#games">
              Back to the game floor <span>↗</span>
            </Link>
          </div>
          <p className="public-small-note">
            Free arena play. No paid parts, wagering, or bought performance.
          </p>
        </div>

        <div className="public-garage-stage" aria-label="Robot Combat workshop preview">
          <div className="public-garage-topline">
            <span>BAY 13 / OPEN</span>
            <span>BUILD → TEST → ARENA</span>
          </div>
          <div className="public-garage-floor">
            <div className="public-garage-grid" />
            <div className="public-garage-robot">
              <div className="public-garage-head"><span /></div>
              <div className="public-garage-body"><i /><i /><i /></div>
              <div className="public-garage-wheel public-garage-wheel-one" />
              <div className="public-garage-wheel public-garage-wheel-two" />
              <div className="public-garage-weapon" />
            </div>
            <span className="public-garage-label public-garage-label-one">FRAME</span>
            <span className="public-garage-label public-garage-label-two">POWER</span>
            <span className="public-garage-label public-garage-label-three">IMPACT</span>
          </div>
          <div className="public-garage-caption">
            <span>YOUR MACHINE / REV 01</span>
            <strong>READY TO BUILD</strong>
          </div>
        </div>
      </section>

      <section className="public-build-loop shell">
        <div className="public-section-intro">
          <div>
            <p className="public-kicker">The garage loop</p>
            <h2>Every part changes the conversation.</h2>
          </div>
          <p>
            The workshop makes the tradeoffs visible before you take a machine
            into a test or free match.
          </p>
        </div>
        <div className="public-build-steps">
          <div><span>01</span><b>Assemble</b><p>Pick a frame, drive, power cell, armor, and weapon.</p></div>
          <div><span>02</span><b>Test</b><p>See how balance, clearance, and force change together.</p></div>
          <div><span>03</span><b>Fight</b><p>Take a valid build into the free arena and make the next call.</p></div>
        </div>
      </section>

      <section className="public-robot-callout shell">
        <div>
          <p className="public-kicker">The point of the game</p>
          <h2>Make a machine you can explain.</h2>
        </div>
        <p>
          Robot Combat is about the line between a clever build and a lucky
          button press. You can inspect your choices, save a revision, and
          learn from what happens next.
        </p>
        <Link className="public-outline-button" href="/auth/register">
          Start building <span>↗</span>
        </Link>
      </section>
    </div>
  );
}
