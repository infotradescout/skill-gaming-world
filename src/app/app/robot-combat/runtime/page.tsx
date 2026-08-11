import { AppPageHeader } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function RobotCombatRuntimePage() {
  return (
    <>
      <AppPageHeader eyebrow="Robot Combat · 3D runtime" title="Workshop and arena prototype">
        <p>This is the exported Godot visual runtime. It is a real local build/test/fight/rebuild prototype, but it is not yet bound to the hosted match authority below.</p>
      </AppPageHeader>
      <section className="robot-combat-runtime surface">
        <div className="robot-combat-runtime-toolbar">
          <div>
            <p className="eyebrow">Development boundary</p>
            <p className="muted small">The browser authority arena records the hosted match. This 3D surface is the visual/runtime slice being integrated next.</p>
          </div>
          <a className="button button-secondary" href="/games/robot-combat/index.html" target="_blank" rel="noreferrer">
            Open full screen
          </a>
        </div>
        <iframe
          className="robot-combat-runtime-frame"
          title="Robot Combat 3D runtime prototype"
          src="/games/robot-combat/index.html"
          allow="autoplay"
        />
      </section>
    </>
  );
}
