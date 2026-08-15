import { AppPageHeader } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function RobotCombatRuntimePage({
  searchParams,
}: {
  searchParams?: Promise<{ matchId?: string; slot?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const matchId = typeof query.matchId === "string" ? query.matchId.trim() : "";
  const slot = query.slot === "A" || query.slot === "B" ? query.slot : "";
  const runtimeSrc = matchId
    ? "/games/robot-combat/index.html?matchId=" + encodeURIComponent(matchId) + (slot ? "&slot=" + slot : "")
    : "/games/robot-combat/index.html";
  const liveMirror = Boolean(matchId);

  return (
    <>
      <AppPageHeader eyebrow="Robot Combat · visual arena" title={liveMirror ? "Live arena view" : "Workshop preview"}>
        <p>
          {liveMirror
            ? "Watch this match in the same state as the browser arena. Use the main match page for ready, drive, turn, and fire controls."
            : "Preview the visual build and arena view. Build, test, and fight from the main Robot Combat workshop."}
        </p>
      </AppPageHeader>
      <section className="robot-combat-runtime surface">
        <div className="robot-combat-runtime-toolbar">
          <div>
            <p className="eyebrow">{liveMirror ? "Live match" : "Visual preview"}</p>
            <p className="muted small">
              {liveMirror
                ? "This view follows the live match state while the browser match page handles the controls."
                : "This view is a visual preview of the Robot Combat world and remains separate from the match controls."}
            </p>
          </div>
          <a className="button button-secondary" href={runtimeSrc} target="_blank" rel="noreferrer">
            Open full screen
          </a>
        </div>
        <iframe
          className="robot-combat-runtime-frame"
          title="Robot Combat visual arena"
          src={runtimeSrc}
          allow="autoplay"
        />
      </section>
    </>
  );
}
