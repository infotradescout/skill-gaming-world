import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import type { Language } from "./workspace.ts";

function languageExtension(language: Language): Extension {
  switch (language) {
    case "html":
      return html();
    case "css":
      return css();
    case "javascript":
      return javascript();
    case "text":
      return [];
  }
}

interface EditorProps {
  fileName: string;
  language: Language;
  value: string;
  onChange: (next: string) => void;
}

// A CodeMirror 6 editor, re-created when the active file changes. CodeMirror 6
// handles touch and soft keyboards well, which is why it beats Monaco on mobile.
export function Editor({ fileName, language, value, onChange }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        oneDark,
        languageExtension(language),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    view.focus();
    return () => view.destroy();
    // Re-create only when the file identity or language changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName, language]);

  return <div className="editor-host" ref={hostRef} />;
}

