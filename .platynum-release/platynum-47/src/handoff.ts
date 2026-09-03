// Handoff package: export the whole project + resume context as one portable
// markdown document, so another LLM or dev picks up with no wasted time. This is
// the Selective Intelligence Resume Packet, built into the product.

import type { Workspace } from "./workspace.ts";

export interface HandoffMeta {
  project?: string;
  intent?: string;
  done?: string;
  next?: string;
}

const LANG_FENCE: Record<string, string> = {
  html: "html",
  css: "css",
  javascript: "js",
};

// Pick a code fence longer than any backtick run in the content so file bodies
// that contain ``` do not break out of their block.
function fenceFor(content: string): string {
  let longest = 0;
  for (const match of content.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

export function buildHandoffMarkdown(ws: Workspace, meta: HandoffMeta = {}): string {
  const now = new Date().toISOString();
  const project = meta.project?.trim() || "Untitled Platynum-47 project";
  const intent = meta.intent?.trim() || "_(state the outcome this project is meant to create)_";
  const done = meta.done?.trim() || "_(what is built and working so far)_";
  const next = meta.next?.trim() || "_(the next safe action to take)_";

  const fileBlocks = Object.values(ws)
    .map((file) => {
      const fence = fenceFor(file.content);
      const lang = LANG_FENCE[file.language] ?? "";
      return `### ${file.name}\n\n${fence}${lang}\n${file.content}\n${fence}`;
    })
    .join("\n\n");

  return `# Platynum-47 Handoff Package

- Generated: ${now}
- Project: ${project}
- Source: Platynum-47 self-hosted editor (client-side workspace)

## For the receiving LLM or developer

You are picking up an in-progress project. Everything needed is in this file: the
intent, current state, next action, and the full source below. Inspect the actual
state before changing anything, preserve working behavior, and continue from "Next
safe action" — do not restart from scratch or re-ask what is already answered here.

## Resume Packet

- **Intent (desired outcome):** ${intent}
- **Completed and verified:** ${done}
- **Next safe action:** ${next}
- **How to run:** open the project in Platynum-47 (or any static host) and use the
  live preview; it is a client-side HTML/CSS/JS workspace with no backend.
- **Receiving rule:** inspect actual state before mutation; keep the same contracts
  and do not claim tested/deployed without evidence.

## Project files

${fileBlocks}
`;
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

