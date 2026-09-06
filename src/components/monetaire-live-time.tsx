"use client";

import { useEffect, useState } from "react";
import { createDisplayClockAnchor, displayElapsedMs, formatGameTime } from "./monetaire-display-clock";
import type { ServerGameSession } from "./monetaire-session-types";

export function MonetaireLiveTime({ session }: { session: ServerGameSession }) {
  const [observation, setObservation] = useState({ session, milliseconds: session.verifiedActivePlayMs });
  useEffect(() => {
    const anchor = createDisplayClockAnchor(session, performance.now());
    const tick = () => setObservation({ session, milliseconds: displayElapsedMs(anchor, performance.now()) });
    tick();
    if (!anchor.running) return;
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [session]);
  // Never briefly display the previous hand's time or extrapolate a final result.
  const milliseconds = session.status !== "ACTIVE" || observation.session !== session
    ? session.verifiedActivePlayMs : observation.milliseconds;
  return <strong>{formatGameTime(milliseconds)}</strong>;
}
