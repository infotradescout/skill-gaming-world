"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { MonetaireLiveTime } from "./monetaire-live-time";
import { isCardSelectionClick, isDrawShortcut } from "./monetaire-input";
import {
  MonetaireMoveClient, gameReplyMessage, requestGameJson, type MoveResolution,
} from "./monetaire-move-client";
import {
  canAdoptGameSnapshot, isRecord, isServerGameSession,
  type Suit, type Rank, type ServerCard, type PositionedCard,
  type ServerGameSession, type MoveIntent,
} from "./monetaire-session-types";
export type { ServerGameSession } from "./monetaire-session-types";
import { useCardPreferences } from "./card-preferences";

type Selection =
  | { source: "waste" }
  | { source: "tableau"; column: number; index: number }
  | { source: "foundation"; suit: Suit };

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

  if (session.stock.remaining > 0) return "Draw the next three cards from the stock.";
  if (session.waste.count > 0) return "Recycle the waste pile back into the stock.";
  return "No simple move is visible. Try moving a face-up tableau run.";
}

function formattedTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
    "Start a hand or pick up where you left off.",
  );
  const [pending, setPending] = useState(false);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [moveClient] = useState(() => new MonetaireMoveClient());
  const actionBusy = useRef(false);
  const sessionRef = useRef(initialSession);
  const mounted = useRef(true);
  const sessionRequest = useRef<AbortController | null>(null);
  const autoFoundationTarget = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sessionRequest.current?.abort();
      moveClient.dispose();
    };
  }, [moveClient]);

  useEffect(() => {
    if (initialSession) setRecoveryNeeded(Boolean(moveClient.restore(initialSession.id)));
  }, [moveClient, initialSession]);

  function adoptSession(next: ServerGameSession, allowSwitch = false): boolean {
    if (!mounted.current || !isServerGameSession(next) || next.mode !== mode) return false;
    const previous = sessionRef.current;
    if (previous && (!allowSwitch || previous.id === next.id) &&
        !canAdoptGameSnapshot(previous, next)) return false;
    sessionRef.current = next;
    setSession(next);
    setSelection(null);
    autoFoundationTarget.current = null;
    // The server session is adopted before attempting optional browser storage.
    writeBrowserStorage("localStorage", storageKey, next.id);
    setRecoveryNeeded(Boolean(moveClient.restore(next.id)));
    if (previous?.id === next.id && previous.status === "ACTIVE" && next.status !== "ACTIVE") {
      onSessionTerminal?.();
    }
    return true;
  }

  async function createPracticeSession() {
    if (!mounted.current) return;
    const reply = await requestGameJson("/api/game/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "PRACTICE" }),
    }, { signal: sessionRequest.current?.signal });
    if (!mounted.current) return;
    const next = isRecord(reply.body) ? reply.body.session : null;
    if (!reply.ok || !isServerGameSession(next) || !adoptSession(next, true)) {
      throw new Error(gameReplyMessage(reply.body,
        "We could not confirm the new hand. Check your saved hands before trying again."));
    }
    setFeedback("Your hand is ready. Tap the stock to draw.");
  }

  async function openSession() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    sessionRequest.current = new AbortController();
    setPending(true);
    setFeedback("Looking for your saved hand…");
    try {
      const savedId = resumeSessionId ?? readBrowserStorage("localStorage", storageKey).value;
      if (savedId) {
        const reply = await requestGameJson(`/api/game/sessions/${encodeURIComponent(savedId)}`, {
          cache: "no-store",
        }, { signal: sessionRequest.current?.signal });
        if (!mounted.current) return;
        const next = isRecord(reply.body) ? reply.body.session : null;
        if (reply.ok && isServerGameSession(next) && next.id === savedId && adoptSession(next, true)) {
          setFeedback(moveClient.pending
            ? "A move still needs confirmation. Check the saved move before continuing."
            : "Your hand is back. Continue where you left off.");
          return;
        }
        // A failed read is not proof that the hand disappeared. Do not turn
        // authentication errors or an outage into another session creation.
        if (reply.status !== 404 || resumeSessionId) {
          throw new Error(gameReplyMessage(reply.body, "Your saved hand could not be opened. Try again."));
        }
        writeBrowserStorage("localStorage", storageKey, null);
      }
      // Server-owned resume works even when browser storage is unavailable.
      const listed = await requestGameJson("/api/game/sessions", { cache: "no-store" }, {
        signal: sessionRequest.current?.signal,
      });
      if (!mounted.current) return;
      if (!listed.ok || !isRecord(listed.body) || !Array.isArray(listed.body.sessions) ||
          !listed.body.sessions.every(isServerGameSession)) {
        throw new Error(gameReplyMessage(listed.body, "Your saved hands could not be checked. Try again."));
      }
      const saved = listed.body.sessions.find((candidate) => candidate.mode === mode && candidate.status === "ACTIVE");
      if (saved && adoptSession(saved, true)) {
        setFeedback(moveClient.pending
          ? "A move still needs confirmation. Check the saved move before continuing."
          : "Your saved hand is ready.");
      } else if (mode === "PRACTICE") {
        await createPracticeSession();
      } else {
        setFeedback("No resumable competition session was found. Return to the competition entry panel.");
      }
    } catch (error) {
      if (mounted.current) setFeedback(error instanceof Error ? error.message : "Your hand could not be confirmed. Try again.");
    } finally {
      actionBusy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function applyMoveResolution(result: MoveResolution): boolean {
    if (!mounted.current) return false;
    setRecoveryNeeded(Boolean(moveClient.pending));
    if (result.kind === "confirmed") {
      if (!adoptSession(result.session)) {
        setFeedback("The reply did not match the latest hand. Reopen the saved hand before continuing.");
        return false;
      }
      setFeedback(result.accepted ? moveFeedback(result.command.intent) : result.message ?? "That move is not legal here.");
      return result.accepted;
    }
    if (result.kind === "uncertain") setFeedback(result.message);
    if (result.kind === "nothing-to-recover") setFeedback("There is no unresolved move for this hand.");
    return false;
  }

  async function sendMove(intent: MoveIntent) {
    const current = sessionRef.current;
    if (!current || actionBusy.current || current.status !== "ACTIVE") return false;
    actionBusy.current = true;
    setPending(true);
    try {
      return applyMoveResolution(await moveClient.submit(current, intent));
    } catch {
      if (mounted.current) {
        setRecoveryNeeded(Boolean(moveClient.pending));
        setFeedback("We could not confirm the move. Check the saved move before continuing.");
      }
      return false;
    } finally {
      actionBusy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  async function recoverMove() {
    const current = sessionRef.current;
    if (!current || actionBusy.current) return;
    actionBusy.current = true;
    setPending(true);
    setFeedback("Checking the saved move…");
    try {
      applyMoveResolution(await moveClient.recover(current));
    } catch {
      if (mounted.current) setFeedback("The saved move still needs confirmation. Try checking it again.");
    } finally {
      actionBusy.current = false;
      if (mounted.current) {
        setPending(false);
        setRecoveryNeeded(Boolean(moveClient.pending));
      }
    }
  }

  async function startAnotherSession() {
    if (mode !== "PRACTICE" || actionBusy.current || moveClient.pending) return;
    actionBusy.current = true;
    sessionRequest.current = new AbortController();
    setPending(true);
    try {
      await createPracticeSession();
    } catch (error) {
      if (mounted.current) setFeedback(error instanceof Error ? error.message : "The new hand could not be confirmed. Check saved hands before trying again.");
    } finally {
      actionBusy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function moveFeedback(intent: MoveIntent) {
    switch (intent.type) {
      case "DRAW_STOCK":
        return "Stock drawn.";
      case "RECYCLE_WASTE":
        return "Waste recycled.";
      case "FLIP_TABLEAU":
        return "Card turned over.";
      case "WASTE_TO_TABLEAU":
      case "TABLEAU_TO_TABLEAU":
      case "FOUNDATION_TO_TABLEAU":
        return "Card moved.";
      case "WASTE_TO_FOUNDATION":
      case "TABLEAU_TO_FOUNDATION":
        return "Card moved to the foundation.";
      case "ABANDON":
        return "Session ended.";
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

    if (selection?.source === "tableau" && selection.column === column) {
      setSelection(null);
      setFeedback("Selection cleared.");
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
    if (!session?.waste.top || autoFoundationTarget.current !== session.waste.top.id) return;
    setSelection(null);
    void sendMove({ type: "WASTE_TO_FOUNDATION" });
  }

  function moveTableauToFoundation(column: number, index: number) {
    if (!session) return;
    const pile = session.tableau[column];
    const card = pile[index];
    if (!card?.faceUp || autoFoundationTarget.current !== card.id || index !== pile.length - 1) {
      setFeedback("Only the exposed top tableau card can move to a foundation.");
      return;
    }
    setSelection(null);
    void sendMove({ type: "TABLEAU_TO_FOUNDATION", fromColumn: column });
  }

  function beginDrag(event: DragEvent, nextSelection: Selection) {
    if (actionBusy.current || recoveryNeeded || sessionRef.current?.status !== "ACTIVE") {
      event.preventDefault();
      return;
    }
    autoFoundationTarget.current = null;
    setSelection(nextSelection);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "monetaire-card");
  }

  function allowDrop(event: DragEvent) {
    if (!selection || actionBusy.current || pending || recoveryNeeded || terminal) return;
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
    if (!session || actionBusy.current || recoveryNeeded) return;
    const sourceCard = selection?.source === "waste" ? session.waste.top :
      selection?.source === "tableau" ? session.tableau[selection.column]?.[selection.index] : null;
    if (sourceCard && sourceCard.suit !== suit) {
      setFeedback("Choose the foundation with the same suit as the selected card.");
      return;
    }
    if (selection?.source === "foundation" && selection.suit === suit) {
      setSelection(null);
      setFeedback("Selection cleared.");
      return;
    }
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      autoFoundationTarget.current = null;
      setSelection(null);
      setFeedback("Selection cleared.");
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!actionBusy.current && !recoveryNeeded && isDrawShortcut({
      key: event.key, repeat: event.repeat, ctrlKey: event.ctrlKey,
      metaKey: event.metaKey, altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      targetTag: target?.tagName ?? "", contentEditable: target?.isContentEditable ?? false,
    })) {
      event.preventDefault();
      drawStock();
    }
  }

  if (!session) {
    const isPractice = mode === "PRACTICE";
    return (
      <section className="game-start surface">
        <span className="pill pill-live">
          {isPractice ? "Free practice" : "Competition table"}
        </span>
        <h2>Open the table.</h2>
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
          disabled={pending || recoveryNeeded}
          type="button"
          onClick={() => void openSession()}
        >
          {pending
            ? "Opening session…"
            : isPractice
              ? "Start or resume"
              : "Resume competition"}
        </button>
        <small>{feedback} Your hand is recorded as you play.</small>
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
            {isPractice ? "Practice hand" : "Competition hand"}
          </span>
          <strong>Table open</strong>
          <small>
            Draw 3 rules · no cash value
          </small>
        </div>
        <div className="game-metrics">
          <span><small>Valid moves</small><strong>{session.validMoveCount}</strong></span>
          <span><small>{session.status === "ACTIVE" ? "Active time" : "Final time"}</small><MonetaireLiveTime session={session} /></span>
        </div>
        <div className="solitaire-actions">
          {session.status === "ACTIVE" ? (
            <>
              <button
                className="button button-secondary"
                disabled={pending || recoveryNeeded}
                type="button"
                onClick={() => setFeedback(sessionHint(session))}
              >
                Hint
              </button>
              <button
                className="button button-quiet"
                disabled={pending || recoveryNeeded}
                type="button"
                onClick={() => void sendMove({ type: "ABANDON" })}
              >
                Abandon
              </button>
            </>
          ) : isPractice ? (
            <button
              className="button button-primary"
              disabled={pending || recoveryNeeded}
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
        <span><b>Win first</b><small>Complete hands rank first.</small></span>
        <span><b>Then fewer moves</b><small>Only legal moves count.</small></span>
        <span><b>Then less time</b><small>Active play breaks the tie.</small></span>
      </div>

      <div className="solitaire-table">
        <div className="solitaire-top-row">
          <div className="stock-area">
            <button
              className={session.stock.remaining ? "playing-card card-back" : "playing-card card-slot"}
              disabled={pending || recoveryNeeded || terminal}
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
              disabled={pending || recoveryNeeded || terminal}
              type="button"
              aria-label={
                session.waste.top
                  ? `Waste ${RANK_LABEL[session.waste.top.rank]}${SUIT_GLYPH[session.waste.top.suit]}`
                  : "Waste empty"
              }
              draggable={Boolean(session.waste.top) && !pending && !recoveryNeeded && !terminal}
              onDoubleClick={moveWasteToFoundation}
              onDragStart={(event) => beginDrag(event, { source: "waste" })}
              onClick={(event) => {
                if (isCardSelectionClick(event.detail)) {
                  autoFoundationTarget.current = selection && selection.source !== "waste" ? null : session.waste.top?.id ?? null;
                  selectWaste();
                }
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
                  disabled={pending || recoveryNeeded || terminal}
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
                  disabled={pending || recoveryNeeded || terminal}
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
                    disabled={pending || recoveryNeeded || terminal}
                    style={{ top: `${index * 27}px` }}
                    type="button"
                    aria-label={
                      card.faceUp
                        ? `${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}, tableau pile ${column + 1}`
                        : `Face-down card, tableau pile ${column + 1}`
                    }
                    draggable={card.faceUp && !pending && !recoveryNeeded && !terminal}
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
                      if (isCardSelectionClick(event.detail)) {
                        const selectingSource = !selection || (selection.source === "tableau" && selection.column === column);
                        autoFoundationTarget.current = selectingSource && card.faceUp && index === pile.length - 1 ? card.id : null;
                        selectTableau(column, index);
                      }
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
        {recoveryNeeded ? (
          <button className="button button-secondary" type="button" disabled={pending}
            onClick={() => void recoverMove()}>
            {pending ? "Checking saved move…" : "Check saved move"}
          </button>
        ) : null}
        <p className="game-feedback" aria-live="polite">
          {pending ? "Checking the move…" : feedback}
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
              This hand ended with {session.validMoveCount} legal moves in {formattedTime(session.verifiedActivePlayMs)} of active play.
              This result has no cash or prize value.
            </p>
            {isPractice ? (
              <button
                className="button button-primary"
                disabled={pending || recoveryNeeded}
                type="button"
                onClick={() => void startAnotherSession()}
              >
                Start new practice
              </button>
            ) : (
              <p className="muted small">
                This competition result is final. Return to the leaderboard to see your place.
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
