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
    ? `/games/robot-combat/index.html?matchId=${encodeURIComponent(matchId)}${slot ? `&slot=${slot}` : ""}`
    : "/games/robot-combat/index.html";
  const liveMirror = Boolean(matchId);

  return (
    <>
      <AppPageHeader eyebrow="Robot Combat · 3D runtime" title={liveMirror ? "Live authority mirror" : "Workshop and arena prototype"}>
        <p>
          {liveMirror
            ? `This 3D view is reading match ${matchId} from the same authenticated authority as the browser arena. It renders the server snapshot; it does not become a second rules engine.`
            : "This is the exported Godot visual runtime. It is a real local build/test/fight/rebuild prototype. Open it from a live match to mirror hosted authority state."}
        </p>
      </AppPageHeader>
      <section className="robot-combat-runtime surface">
        <div className="robot-combat-runtime-toolbar">
          <div>
            <p className="eyebrow">{liveMirror ? "Hosted match · read-only renderer" : "Local runtime boundary"}</p>
            <p className="muted small">
              {liveMirror
                ? "Use the browser authority arena for ready, drive, fire, and clock commands. This surface follows the resulting positions, integrity, and rebuild state."
                : "Use the workshop and authority arena for the hosted flow. This standalone view remains a local build/test/fight/rebuild fixture until a match is supplied."}
            </p>
          </div>
          <a className="button button-secondary" href={runtimeSrc} target="_blank" rel="noreferrer">
            Open full screen
          </a>
        </div>
        <iframe
          className="robot-combat-runtime-frame"
          title="Robot Combat 3D runtime prototype"
          src={runtimeSrc}
          allow="autoplay"
        />
      </section>
    </>
  );
}
