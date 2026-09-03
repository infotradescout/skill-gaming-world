import { useState } from "react";
import type { PairSession } from "./pair.ts";

interface PairPanelProps {
  onClose: () => void;
  pairSession: PairSession | null;
  onCreate: () => Promise<void>;
  onJoin: (pairCode: string) => Promise<void>;
  onLeave: () => Promise<void>;
  busy: boolean;
  error: string;
}

export function PairPanel({ onClose, pairSession, onCreate, onJoin, onLeave, busy, error }: PairPanelProps) {
  const [joinCode, setJoinCode] = useState("");

  const statusLine = pairSession
    ? `You are the ${pairSession.role}. ${pairSession.controllerConnected ? "Controller ready." : "Waiting for controller."} ${
        pairSession.runnerConnected ? "Runner ready." : "Waiting for runner."
      }`
    : "";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <strong>Pair devices</strong>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="panel-body">
          {!pairSession && (
            <>
              <div className="muted small">
                Pair two devices so one device drives the editor and the other runs the live preview.
              </div>
              <button className="btn connect-btn" disabled={busy} onClick={onCreate}>
                {busy ? "Creating pairing..." : "This device is the Editor"}
              </button>

              <input
                className="field"
                type="text"
                maxLength={9}
                placeholder="ABC-123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  onJoin(joinCode);
                }}
                name="pairCode"
              />
              <button
                className="btn"
                disabled={busy || !joinCode.trim()}
                onClick={() => {
                  void onJoin(joinCode);
                }}
              >
                {busy ? "Joining..." : "Join as runner"}
              </button>
            </>
          )}

          {pairSession && (
            <>
              <div className="panel-note">
                <strong>Pair code:</strong> {pairSession.pairCode}
              </div>
              <div className="muted small status-line">{statusLine}</div>

              <p className="muted small">
                {pairSession.paired
                  ? "Both devices are connected. Keep the runner open to stay synced."
                  : pairSession.role === "controller"
                    ? "Share the code with the runner device, then open here to start pairing."
                    : "Waiting for controller to accept this session."}
              </p>

              <button className="btn" disabled={busy} onClick={onLeave}>
                {busy ? "Ending..." : "End pairing"}
              </button>
            </>
          )}

          {error && <div className="panel-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}

