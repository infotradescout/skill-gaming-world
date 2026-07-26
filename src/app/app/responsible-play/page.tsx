import { AppPageHeader } from "@/components/app-shell";
import { ResponsibleControls } from "@/components/player-panels";

export default function AppResponsiblePlayPage() {
  return (
    <>
      <AppPageHeader eyebrow="Player protection" title="Your controls">
        <p>Session reminders are device preferences. Cooldown, exclusion, and closure require server confirmation.</p>
      </AppPageHeader>
      <ResponsibleControls />
    </>
  );
}
