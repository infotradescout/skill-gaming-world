import { useState, type FormEvent } from "react";

interface StartScreenProps {
  onStart: (idea: string) => void;
  onOpenWorkspace: () => void;
  onOpenWorkDaySettings?: () => void;
}

const JOURNEY = [
  ["Your idea", "Your goal, in your own words."],
  ["What SI understands", "A plain-language readback before work starts."],
  ["Three recommendations", "Three practical directions worth considering."],
  ["Consensus", "The direction the strongest recommendations share."],
  ["Wildcard", "One useful alternative you may not have considered."],
  ["Progress", "What SI is doing and what is genuinely waiting on you."],
  ["Preview", "A working result you can see and use."],
] as const;

export function StartScreen({ onStart, onOpenWorkspace, onOpenWorkDaySettings }: StartScreenProps) {
  const [idea, setIdea] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextIdea = idea.trim();
    if (nextIdea) onStart(nextIdea);
  };

  return (
    <main className="start-screen">
      <div className="start-shell">
        <section className="start-intro" aria-labelledby="start-title">
          <div className="start-brand">
            Platynum<span className="brand-accent">-47</span>
          </div>
          <p className="start-eyebrow">From idea to finished product</p>
          <h1 id="start-title">
            Cursor starts with code.{" "}
            <span>Platynum starts with you.</span>
          </h1>
          <p className="start-supporting">
            Cursor helps developers code faster. Platynum helps anyone turn an idea into a finished product.
          </p>

          <form className="idea-form" onSubmit={submit}>
            <label htmlFor="project-idea">What are you trying to make?</label>
            <textarea
              id="project-idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Describe your idea"
              rows={5}
              autoFocus
            />
            <button className="start-primary" type="submit" disabled={!idea.trim()}>
              Start with my idea
            </button>
          </form>

          <button className="advanced-workspace-link" type="button" onClick={onOpenWorkspace}>
            Open the optional advanced workspace
          </button>
          <p className="advanced-workspace-note">On this computer, it opens your real project files for hands-on work.</p>
          {onOpenWorkDaySettings && (
            <button className="advanced-workspace-link" type="button" onClick={onOpenWorkDaySettings}>
              Work day schedule
            </button>
          )}
        </section>

        <section className="start-journey" aria-labelledby="journey-title">
          <p className="journey-kicker">Your path</p>
          <h2 id="journey-title">From your words to something real</h2>
          <ol>
            {JOURNEY.map(([label, description], index) => (
              <li key={label}>
                <span className="journey-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
