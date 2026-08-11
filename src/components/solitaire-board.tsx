"use client";

import { useState, type DragEvent } from "react";
import { useCardPreferences } from "./card-preferences";

type Suit = "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
type Rank =
  | "ACE"
  | "TWO"
  | "THREE"
  | "FOUR"
  | "FIVE"
  | "SIX"
  | "SEVEN"
  | "EIGHT"
  | "NINE"
  | "TEN"
  | "JACK"
  | "QUEEN"
  | "KING";

type ServerCard = {
  id: string;
  suit: Suit;
  rank: Rank;
};

type PositionedCard =
  | (ServerCard & { faceUp: true })
  | { id: null; suit: null; rank: null; faceUp: false };

export type ServerGameSession = {
  id: string;
  mode: "PRACTICE" | "NONCASH_COMPETITION";
  rulesetVersion: string;
  dealGeneratorVersion: string;
  dealCommitment: string;
  stateHash: string;
  status: "ACTIVE" | "WON" | "ABANDONED";
  sequence: number;
  validMoveCount: number;
  verifiedActivePlayMs: number;
  stock: { remaining: number };
  waste: { count: number; top: ServerCard | null };
  tableau: PositionedCard[][];
  foundations: Record<Suit, { count: number; top: ServerCard | null }>;
  serverAuthoritative: true;
};

type Selection =
  | { source: "waste" }
  | { source: "tableau"; column: number; index: number }
  | { source: "foundation"; suit: Suit };

type MoveIntent =
  | { type: "DRAW_STOCK" }
  | { type: "RECYCLE_WASTE" }
  | { type: "FLIP_TABLEAU"; column: number }
  | { type: "WASTE_TO_TABLEAU"; toColumn: number }
  | { type: "WASTE_TO_FOUNDATION" }
  | {
      type: "TABLEAU_TO_TABLEAU";
      fromColumn: number;
      startIndex: number;
      toColumn: number;
    }
  | { type: "TABLEAU_TO_FOUNDATION"; fromColumn: number }
  | { type: "FOUNDATION_TO_TABLEAU"; suit: Suit; toColumn: number }
  | { type: "ABANDON" };

const SUITS: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const PRACTICE_STORAGE_KEY = "monetaire.practice.session-id";

const SUIT_GLYPH: Record<Suit, string> = {
  CLUBS: "♣",
  DIAMONDS: "♦",
  HEARTS: "♥",
  SPADES: "♠",
};

const RANK_LABEL: Record<Rank, string> = {
  ACE: "A",
  TWO: "2",
  THREE: "3",
  FOUR: "4",
  FIVE: "5",
  SIX: "6",
  SEVEN: "7",
  EIGHT: "8",
  NINE: "9",
  TEN: "10",
  JACK: "J",
  QUEEN: "Q",
  KING: "K",
};

const RANK_VALUE: Record<Rank, number> = {
  ACE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  JACK: 11,
  QUEEN: 12,
  KING: 13,
};

function isRed(card: ServerCard) {
  return card.suit === "HEARTS" || card.suit === "DIAMONDS";
}

function canMoveToFoundation(
  card: ServerCard,
  foundations: ServerGameSession["foundations"],
) {
  return RANK_VALUE[card.rank] === foundations[card.suit].count + 1;
}

function canMoveToTableau(card: ServerCard, pile: PositionedCard[]) {
  if (pile.length === 0) return card.rank === "KING";
  const destination = pile[pile.length - 1];
  return (
    destination.faceUp &&
    isRed(card) !== isRed(destination) &&
    RANK_VALUE[destination.rank] === RANK_VALUE[card.rank] + 1
  );
}

function sessionHint(session: ServerGameSession) {
  for (let column = 0; column < session.tableau.length; column += 1) {
    const pile = session.tableau[column];
    const top = pile[pile.length - 1];
    if (top && !top.faceUp) {
      return `Flip the exposed card in tableau column ${column + 1}.`;
    }
  }

  if (
    session.waste.top &&
    canMoveToFoundation(session.waste.top, session.foundations)
  ) {
    return `Move ${RANK_LABEL[session.waste.top.rank]}${
      SUIT_GLYPH[session.waste.top.suit]
    } from the waste to its foundation.`;
  }

  for (let column = 0; column < session.tableau.length; column += 1) {
    const pile = session.tableau[column];
    const top = pile[pile.length - 1];
    if (top?.faceUp && canMoveToFoundation(top, session.foundations)) {
      return `Move ${RANK_LABEL[top.rank]}${SUIT_GLYPH[top.suit]} from column ${
        column + 1
      } to its foundation.`;
    }
  }

  if (session.waste.top) {
    for (let column = 0; column < session.tableau.length; column += 1) {
      if (canMoveToTableau(session.waste.top, session.tableau[column])) {
        return `Move ${RANK_LABEL[session.waste.top.rank]}${
          SUIT_GLYPH[session.waste.top.suit]
        } from the waste to tableau column ${column + 1}.`;
      }
    }
  }

  if (session.stock.remaining > 0) return "Draw the next card from the stock.";
  if (session.waste.count > 0) return "Recycle the waste pile back into the stock.";
  return "No simple move is visible. Try moving a face-up tableau run.";
}

function formattedTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function apiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const candidate = body as {
    error?: string | { message?: string };
    rejection?: { message?: string };
  };
  if (candidate.rejection?.message) return candidate.rejection.message;
  if (typeof candidate.error === "object" && candidate.error?.message) {
    return candidate.error.message;
  }
  if (typeof candidate.error === "string") return candidate.error;
  return fallback;
}

export function SolitaireBoard({
  initialSession = null,
  mode = "PRACTICE",
  storageKey = PRACTICE_STORAGE_KEY,
  resumeSessionId,
  onSessionTerminal,
}: {
  initialSession?: ServerGameSession | null;
  mode?: ServerGameSession["mode"];
  storageKey?: string;
  resumeSessionId?: string;
  onSessionTerminal?: () => void;
}) {
  const cardPreferences = useCardPreferences();
  const [session, setSession] = useState<ServerGameSession | null>(initialSession);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [feedback, setFeedback] = useState(
    "Start or resume a server-authoritative practice session.",
  );
  const [pending, setPending] = useState(false);

  async function createPracticeSession() {
    const response = await fetch("/api/game/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "PRACTICE" }),
    });
    const body = (await response.json().catch(() => null)) as
      | { session?: ServerGameSession; error?: string | { message?: string } }
      | null;
    if (!response.ok || !body?.session) {
      throw new Error(apiError(body, "A practice session could not be created."));
    }
    window.localStorage.setItem(storageKey, body.session.id);
    setSession(body.session);
    setSelection(null);
    setFeedback("Server session created. Tap the stock to draw.");
  }

  async function openSession() {
    setPending(true);
    setFeedback("Checking for a server session…");
    try {
      const savedId =
        resumeSessionId ?? window.localStorage.getItem(storageKey);
      if (savedId) {
        const response = await fetch(`/api/game/sessions/${savedId}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | { session?: ServerGameSession }
          | null;
        if (response.ok && body?.session && body.session.mode === mode) {
          setSession(body.session);
          window.localStorage.setItem(storageKey, body.session.id);
          setSelection(null);
          setFeedback("Server session resumed from its authoritative state.");
          return;
        }
        window.localStorage.removeItem(storageKey);
      }
      if (mode === "PRACTICE") {
        await createPracticeSession();
      } else {
        setFeedback(
          "No resumable competition session was found. Return to the competition entry panel.",
        );
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Game services are not reachable. No session was started.",
      );
    } finally {
      setPending(false);
    }
  }

  async function sendMove(intent: MoveIntent) {
    if (!session || pending || session.status !== "ACTIVE") return false;
    setPending(true);
    try {
      const response = await fetch(`/api/game/sessions/${session.id}/moves`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: crypto.randomUUID(),
          sequence: session.sequence + 1,
          priorStateHash: session.stateHash,
          intent,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            accepted?: boolean;
            currentSession?: ServerGameSession;
            rejection?: { message?: string };
            error?: string | { message?: string };
          }
        | null;
      if (body?.currentSession) {
        setSession(body.currentSession);
        if (body.currentSession.status !== "ACTIVE") {
          onSessionTerminal?.();
        }
      }
      if (!response.ok || body?.accepted === false) {
        setFeedback(apiError(body, "The server rejected that move."));
        return false;
      }
      setFeedback(moveFeedback(intent));
      return true;
    } catch {
      setFeedback("Move services are not reachable. The board was not changed.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function startAnotherSession() {
    if (mode !== "PRACTICE") return;
    setPending(true);
    try {
      await createPracticeSession();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "A new session could not be created.",
      );
    } finally {
      setPending(false);
    }
  }

  function moveFeedback(intent: MoveIntent) {
    switch (intent.type) {
      case "DRAW_STOCK":
        return "Stock draw accepted by the server.";
      case "RECYCLE_WASTE":
        return "Waste recycle accepted by the server.";
      case "FLIP_TABLEAU":
        return "Tableau flip accepted by the server.";
      case "WASTE_TO_TABLEAU":
      case "TABLEAU_TO_TABLEAU":
      case "FOUNDATION_TO_TABLEAU":
        return "Tableau move accepted by the server.";
      case "WASTE_TO_FOUNDATION":
      case "TABLEAU_TO_FOUNDATION":
        return "Foundation move accepted by the server.";
      case "ABANDON":
        return "Session abandoned and recorded by the server.";
    }
  }

  function drawStock() {
    if (!session) return;
    setSelection(null);
    if (session.stock.remaining > 0) {
      void sendMove({ type: "DRAW_STOCK" });
    } else if (session.waste.count > 0) {
      void sendMove({ type: "RECYCLE_WASTE" });
    } else {
      setFeedback("The stock and waste are empty.");
    }
  }

  function selectWaste() {
    if (!session?.waste.top) {
      setFeedback("The waste is empty. Draw from the stock.");
      return;
    }
    if (selection?.source === "waste") {
      setSelection(null);
      setFeedback("Selection cleared.");
      return;
    }
    setSelection({ source: "waste" });
    setFeedback(
      `Selected ${RANK_LABEL[session.waste.top.rank]}${
        SUIT_GLYPH[session.waste.top.suit]
      }. Choose a destination.`,
    );
  }

  function selectTableau(column: number, index: number) {
    if (!session) return;
    const card = session.tableau[column]?.[index];
    if (!card) return;

    if (!card.faceUp) {
      if (index === session.tableau[column].length - 1) {
        void sendMove({ type: "FLIP_TABLEAU", column });
      } else {
        setFeedback("Only the exposed top face-down card can be flipped.");
      }
      return;
    }

    if (selection) {
      moveSelectionToTableau(column);
      return;
    }

    setSelection({ source: "tableau", column, index });
    setFeedback(
      `Selected ${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}. Choose a destination.`,
    );
  }

  function selectEmptyTableau(column: number) {
    if (!selection) {
      setFeedback("Select a card or face-up run first.");
      return;
    }
    moveSelectionToTableau(column);
  }

  function moveSelectionToTableau(column: number) {
    if (!selection) return;
    let intent: MoveIntent;
    if (selection.source === "waste") {
      intent = { type: "WASTE_TO_TABLEAU", toColumn: column };
    } else if (selection.source === "foundation") {
      intent = {
        type: "FOUNDATION_TO_TABLEAU",
        suit: selection.suit,
        toColumn: column,
      };
    } else {
      intent = {
        type: "TABLEAU_TO_TABLEAU",
        fromColumn: selection.column,
        startIndex: selection.index,
        toColumn: column,
      };
    }
    setSelection(null);
    void sendMove(intent);
  }

  function moveWasteToFoundation() {
    if (!session?.waste.top) return;
    setSelection(null);
    void sendMove({ type: "WASTE_TO_FOUNDATION" });
  }

  function moveTableauToFoundation(column: number, index: number) {
    if (!session) return;
    const pile = session.tableau[column];
    const card = pile[index];
    if (!card?.faceUp || index !== pile.length - 1) {
      setFeedback("Only the exposed top tableau card can move to a foundation.");
      return;
    }
    setSelection(null);
    void sendMove({ type: "TABLEAU_TO_FOUNDATION", fromColumn: column });
  }

  function beginDrag(event: DragEvent, nextSelection: Selection) {
    setSelection(nextSelection);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "monetaire-card");
  }

  function allowDrop(event: DragEvent) {
    if (!selection || pending || terminal) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropOnTableau(event: DragEvent, column: number) {
    event.preventDefault();
    moveSelectionToTableau(column);
  }

  function dropOnFoundation(event: DragEvent, suit: Suit) {
    event.preventDefault();
    selectFoundation(suit);
  }

  function selectFoundation(suit: Suit) {
    if (!session) return;
    if (selection?.source === "waste") {
      setSelection(null);
      void sendMove({ type: "WASTE_TO_FOUNDATION" });
      return;
    }
    if (selection?.source === "tableau") {
      const pile = session.tableau[selection.column];
      if (selection.index !== pile.length - 1) {
        setFeedback("Only the exposed top tableau card can move to a foundation.");
        return;
      }
      const fromColumn = selection.column;
      setSelection(null);
      void sendMove({ type: "TABLEAU_TO_FOUNDATION", fromColumn });
      return;
    }
    if (session.foundations[suit].top) {
      setSelection({ source: "foundation", suit });
      setFeedback(`Selected the ${SUIT_GLYPH[suit]} foundation. Choose a tableau pile.`);
    } else {
      setFeedback(`The ${SUIT_GLYPH[suit]} foundation is empty.`);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key.toLowerCase() === "d") {
      event.preventDefault();
      drawStock();
    } else if (event.key === "Escape") {
      setSelection(null);
      setFeedback("Selection cleared.");
    }
  }

  if (!session) {
    const isPractice = mode === "PRACTICE";
    return (
      <section className="game-start surface">
        <span className="pill pill-live">
          Server-authoritative {isPractice ? "practice" : "competition"}
        </span>
        <h2>Open a Monetaire deal.</h2>
        <p>
          Build each suit from Ace to King. Move cards in descending order with
          alternating colors, reveal every hidden card, and finish all four
          foundations.
        </p>
        <div className="game-start-guide" aria-label="How to play Monetaire">
          <span><b>1</b> Draw or select a face-up card</span>
          <span><b>2</b> Choose a legal destination</span>
          <span><b>3</b> Complete all four foundations</span>
        </div>
        <button
          className="button button-primary"
          disabled={pending}
          type="button"
          onClick={() => void openSession()}
        >
          {pending
            ? "Opening session…"
            : isPractice
              ? "Start or resume"
              : "Resume competition"}
        </button>
        <small>{feedback} Your deal and every accepted move are verified by the server.</small>
      </section>
    );
  }

  const completed = session.status === "WON";
  const terminal = session.status !== "ACTIVE";
  const isPractice = session.mode === "PRACTICE";

  return (
    <section
      className={`solitaire surface card-front-${cardPreferences.front} card-back-${cardPreferences.back}`}
      aria-label={`Monetaire ${isPractice ? "practice" : "competition"} board`}
      aria-busy={pending}
      onKeyDown={handleKeyDown}
    >
      <header className="solitaire-toolbar">
        <div>
          <span className="pill pill-live">
            {isPractice ? "Unranked practice" : "Noncash competition"} · Server
          </span>
          <strong>Authoritative session</strong>
          <small>
            No solvability claim · {session.rulesetVersion} · commitment{" "}
            {session.dealCommitment.slice(0, 12)}…
          </small>
        </div>
        <div className="game-metrics">
          <span><small>Valid moves</small><strong>{session.validMoveCount}</strong></span>
          <span><small>Verified time</small><strong>{formattedTime(session.verifiedActivePlayMs)}</strong></span>
        </div>
        <div className="solitaire-actions">
          {session.status === "ACTIVE" ? (
            <>
              <button
                className="button button-secondary"
                disabled={pending}
                type="button"
                onClick={() => setFeedback(sessionHint(session))}
              >
                Hint
              </button>
              <button
                className="button button-quiet"
                disabled={pending}
                type="button"
                onClick={() => void sendMove({ type: "ABANDON" })}
              >
                Abandon
              </button>
            </>
          ) : isPractice ? (
            <button
              className="button button-primary"
              disabled={pending}
              type="button"
              onClick={() => void startAnotherSession()}
            >
              New practice
            </button>
          ) : null}
        </div>
      </header>

      <div className="solitaire-notice">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Goal: move every card to the four suit foundations.</strong>
          <small>
            Build tableau columns downward in alternating colors. Only Kings can
            enter empty columns. Select a card, then its destination.
          </small>
        </div>
      </div>

      <div className="ranking-strip" aria-label="Monetaire ranking rules">
        <span><b>Win first</b><small>Incomplete deals rank below completed deals.</small></span>
        <span><b>Then fewer moves</b><small>Only server-accepted moves count.</small></span>
        <span><b>Then less time</b><small>Verified active play breaks the tie.</small></span>
      </div>

      <div className="solitaire-table">
        <div className="solitaire-top-row">
          <div className="stock-area">
            <button
              className={session.stock.remaining ? "playing-card card-back" : "playing-card card-slot"}
              disabled={pending || terminal}
              type="button"
              aria-label={
                session.stock.remaining
                  ? `Draw from stock. ${session.stock.remaining} cards remain.`
                  : session.waste.count
                    ? "Return waste to stock"
                    : "Stock empty"
              }
              onClick={drawStock}
            >
              {session.stock.remaining ? <span className="card-back-mark">M</span> : <span>↻</span>}
            </button>
            <button
              className={`playing-card ${session.waste.top ? "card-face" : "card-slot"} ${
                selection?.source === "waste" ? "card-selected" : ""
              }`}
              disabled={pending || terminal}
              type="button"
              aria-label={
                session.waste.top
                  ? `Waste ${RANK_LABEL[session.waste.top.rank]}${SUIT_GLYPH[session.waste.top.suit]}`
                  : "Waste empty"
              }
              draggable={Boolean(session.waste.top) && !pending && !terminal}
              onDoubleClick={moveWasteToFoundation}
              onDragStart={(event) => beginDrag(event, { source: "waste" })}
              onClick={(event) => {
                if (event.detail === 1) selectWaste();
              }}
            >
              {session.waste.top ? <CardFace card={session.waste.top} /> : null}
            </button>
          </div>

          <div className="foundation-area" aria-label="Foundations">
            {SUITS.map((suit) => {
              const card = session.foundations[suit].top;
              const selected = selection?.source === "foundation" && selection.suit === suit;
              return (
                <button
                  key={suit}
                  className={`playing-card ${card ? "card-face" : "card-slot"} ${
                    selected ? "card-selected" : ""
                  }`}
                  disabled={pending || terminal}
                  type="button"
                  aria-label={
                    card
                      ? `${SUIT_GLYPH[suit]} foundation, ${RANK_LABEL[card.rank]}`
                      : `Empty ${SUIT_GLYPH[suit]} foundation`
                  }
                  onDragOver={allowDrop}
                  onDrop={(event) => dropOnFoundation(event, suit)}
                  onClick={() => selectFoundation(suit)}
                >
                  {card ? <CardFace card={card} /> : <span>{SUIT_GLYPH[suit]}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tableau" aria-label="Tableau">
          {session.tableau.map((pile, column) => (
            <div className="tableau-pile" key={`pile-${column}`}>
              {pile.length === 0 ? (
                <button
                  className="playing-card card-slot"
                  disabled={pending || terminal}
                  type="button"
                  aria-label={`Empty tableau pile ${column + 1}`}
                  onDragOver={allowDrop}
                  onDrop={(event) => dropOnTableau(event, column)}
                  onClick={() => selectEmptyTableau(column)}
                >
                  <span>K</span>
                </button>
              ) : null}
              {pile.map((card, index) => {
                const selected =
                  selection?.source === "tableau" &&
                  selection.column === column &&
                  selection.index === index;
                return (
                  <button
                    key={card.faceUp ? card.id : `hidden-${column}-${index}`}
                    className={`playing-card tableau-card ${
                      card.faceUp ? "card-face" : "card-back"
                    } ${selected ? "card-selected" : ""}`}
                    disabled={pending || terminal}
                    style={{ top: `${index * 27}px` }}
                    type="button"
                    aria-label={
                      card.faceUp
                        ? `${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}, tableau pile ${column + 1}`
                        : `Face-down card, tableau pile ${column + 1}`
                    }
                    draggable={card.faceUp && !pending && !terminal}
                    onDoubleClick={() => moveTableauToFoundation(column, index)}
                    onDragStart={(event) =>
                      beginDrag(event, {
                        source: "tableau",
                        column,
                        index,
                      })
                    }
                    onDragOver={allowDrop}
                    onDrop={(event) => dropOnTableau(event, column)}
                    onClick={(event) => {
                      if (event.detail === 1) selectTableau(column, index);
                    }}
                  >
                    {card.faceUp ? (
                      <CardFace card={card} />
                    ) : (
                      <span className="card-back-mark">M</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="solitaire-footer">
        <p className="game-feedback" aria-live="polite">
          {pending ? "Waiting for server confirmation…" : feedback}
        </p>
        <p className="game-shortcuts">
          Tap or drag cards · double-click to foundation · <kbd>D</kbd> draw ·{" "}
          <kbd>Esc</kbd> clear
        </p>
      </footer>

      {terminal ? (
        <div className="game-complete" role="status">
          <div>
            <span className="eyebrow">
              {completed
                ? isPractice
                  ? "Practice complete"
                  : "Competition session complete"
                : "Session closed"}
            </span>
            <h2>{completed ? "Foundation complete." : "Session abandoned."}</h2>
            <p>
              The server recorded {session.validMoveCount} valid moves and{" "}
              {formattedTime(session.verifiedActivePlayMs)} of verified active time.
              This result has no cash or prize value.
            </p>
            {isPractice ? (
              <button
                className="button button-primary"
                disabled={pending}
                type="button"
                onClick={() => void startAnotherSession()}
              >
                Start new practice
              </button>
            ) : (
              <p className="muted small">
                This official session is final. Return to the leaderboard for the
                server-calculated result.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardFace({ card }: { card: ServerCard }) {
  const red = card.suit === "HEARTS" || card.suit === "DIAMONDS";
  return (
    <span className={red ? "card-content card-red" : "card-content"}>
      <span>
        <b>{RANK_LABEL[card.rank]}</b>
        <i>{SUIT_GLYPH[card.suit]}</i>
      </span>
      <em>{SUIT_GLYPH[card.suit]}</em>
    </span>
  );
}
