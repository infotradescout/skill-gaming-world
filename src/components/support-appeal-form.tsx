"use client";

import { FormEvent, useState } from "react";

export function SupportAppealForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const gameSessionId = String(form.get("gameSessionId") ?? "").trim();

    try {
      const response = await fetch("/api/appeals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameSessionId: gameSessionId || undefined,
          subject: String(form.get("subject") ?? ""),
          statement: String(form.get("statement") ?? ""),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            appeal?: { id?: string };
            error?: { message?: string };
          }
        | null;
      if (!response.ok) {
        setMessage(
          body?.error?.message ??
            "The support request could not be recorded.",
        );
        return;
      }
      formElement.reset();
      setMessage(
        `Request recorded${body?.appeal?.id ? ` as ${body.appeal.id}` : ""}.`,
      );
    } catch {
      setMessage(
        "Support services are not reachable. The request was not recorded.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="surface support-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="support-subject">Subject</label>
        <input
          id="support-subject"
          name="subject"
          minLength={5}
          maxLength={160}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="support-session">Game session ID (optional)</label>
        <input
          id="support-session"
          name="gameSessionId"
          minLength={8}
          maxLength={128}
        />
        <span className="field-hint">
          A referenced session must belong to this account.
        </span>
      </div>
      <div className="field">
        <label htmlFor="support-statement">What should be reviewed?</label>
        <textarea
          id="support-statement"
          name="statement"
          minLength={20}
          maxLength={5_000}
          rows={7}
          required
        />
      </div>
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Recording…" : "Submit for review"}
      </button>
      {message ? <p role="status">{message}</p> : null}
      <p className="muted small">
        No production payment provider is connected, so there is no real-card
        charge or refund path. Use this review process for account, game, or
        sandbox Play Coin records.
      </p>
    </form>
  );
}
