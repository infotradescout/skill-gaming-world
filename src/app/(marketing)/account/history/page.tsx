import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PageHero, Section } from "@/components/page-elements";
import { runtimeUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import { runtimePlayerProjection } from "@/lib/runtime-player-projection";

export const metadata: Metadata = { title: "Account History" };

function formatVerifiedTime(durationMs: number | null) {
  if (durationMs === null) return "time pending";
  return `${(durationMs / 1_000).toFixed(1)}s verified`;
}

export default async function AccountHistoryPage() {
  const cookieStore = await cookies();
  const user = await runtimeUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/auth/login");
  const projection = await runtimePlayerProjection(user.id);

  return (
    <>
      <PageHero
        eyebrow="Account"
        title="History"
        actions={<Link className="button button-primary" href="/app">Back to dashboard</Link>}
      >
        <p>
          These game sessions, competition entries, Play Coin adjustments, and
          achievements are loaded only for your authenticated account.
        </p>
      </PageHero>
      <Section eyebrow="Game records" title="Your authoritative sessions.">
        {projection.recentSessions.length ? (
          <div className="data-list surface-soft">
            {projection.recentSessions.map((session) => (
              <div className="data-row" key={session.id}>
                <div>
                  <strong>
                    {session.mode === "PRACTICE"
                      ? "Practice"
                      : "Noncash competition"}
                  </strong>
                  <small>
                    {new Date(session.startedAt).toLocaleString()} · {session.status}
                  </small>
                  <small className="mono">Session {session.id}</small>
                  {session.competitionEntryId ? (
                    <small className="mono">
                      Entry {session.competitionEntryId}
                    </small>
                  ) : null}
                </div>
                <div>
                  <strong>
                    {session.scoreCompleted === null
                      ? "Score pending"
                      : session.scoreCompleted
                        ? "Completed score"
                        : "Incomplete score"}
                  </strong>
                  <small>
                    {session.scoreValidMoveCount === null
                      ? "moves pending"
                      : `${session.scoreValidMoveCount} valid moves`}
                    {" · "}
                    {formatVerifiedTime(session.scoreVerifiedActivePlayMs)}
                  </small>
                </div>
                <span>
                  {session.acceptedMoveCount} accepted · {session.rejectedMoveCount}{" "}
                  rejected
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState symbol="≡" title="No game sessions recorded">
            <p>Start a practice game to create your first account-backed record.</p>
          </EmptyState>
        )}
      </Section>
      <Section eyebrow="Play Coin ledger" title="Your nonredeemable-unit adjustments.">
        {projection.playCoinEntries.length ? (
          <div className="data-list surface-soft">
            {projection.playCoinEntries
              .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((entry) => (
                <div className="data-row" key={entry.id}>
                  <div>
                    <strong>{entry.reason}</strong>
                    <small>{new Date(entry.createdAt).toLocaleString()}</small>
                  </div>
                  <span>
                    {entry.direction === "CREDIT" ? "+" : "−"}
                    {entry.amountMinor.toLocaleString()}
                  </span>
                  <span>Balance {entry.balanceAfterMinor.toLocaleString()}</span>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState symbol="○" title="No Play Coin adjustments recorded">
            <p>No sample transactions are inserted into account history.</p>
          </EmptyState>
        )}
      </Section>
      <Section eyebrow="Recognition" title="Verified achievements.">
        <div className="data-list surface-soft">
          {projection.achievements.map((achievement) => (
            <div className="data-row" key={achievement.key}>
              <div>
                <strong>{achievement.title}</strong>
                <small>{achievement.description}</small>
              </div>
              <span>{achievement.awardedAt ? "Earned" : "Not earned"}</span>
              <span>
                {achievement.awardedAt
                  ? new Date(achievement.awardedAt).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
