/** Native keyboard and assistive activation report detail=0; first pointer click is 1. */
export function isCardSelectionClick(detail: number): boolean {
  return detail === 0 || detail === 1;
}

export function isDrawShortcut(event: {
  key: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
  isComposing: boolean; targetTag: string; contentEditable: boolean;
}): boolean {
  return event.key.toLowerCase() === "d" && !event.repeat && !event.ctrlKey &&
    !event.metaKey && !event.altKey && !event.isComposing && !event.contentEditable &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(event.targetTag.toUpperCase());
}
