// The lazy CodeMirror 6 loader (DECISIONS D-014). The bundle is a committed, minified ES module
// (site/vendor/codemirror/codemirror.bundle.js, built by tools/vendor/build_codemirror.mjs). Until it
// loads, and if it never does, the caller keeps its textarea. Tab is not trapped: the keymap has no
// indentWithTab, so keyboard users can leave the editor with Tab.
let loading = null;

/** Imports the bundle once. Resolves to null when it cannot load. */
export function loadCodeMirror() {
  if (!loading) {
    const url = new URL("../../../vendor/codemirror/codemirror.bundle.js", import.meta.url).href;
    loading = import(url).catch(() => null);
  }
  return loading;
}

/**
 * Mounts a Python editor in `host` holding `doc`. Resolves to {getValue, setValue, focus} or null.
 * setValue replaces the whole document through a transaction, so onChange runs as for typing.
 */
export async function mountEditor(host, { doc, label, onChange }) {
  const cm = await loadCodeMirror();
  if (!cm) return null;
  const view = new cm.EditorView({
    doc,
    parent: host,
    extensions: [
      cm.lineNumbers(),
      cm.highlightActiveLine(),
      cm.drawSelection(),
      cm.history(),
      cm.indentOnInput(),
      cm.bracketMatching(),
      cm.syntaxHighlighting(cm.classHighlighter),
      cm.python(),
      cm.keymap.of([...cm.defaultKeymap, ...cm.historyKeymap]),
      cm.EditorView.lineWrapping,
      cm.EditorView.contentAttributes.of({ "aria-label": label }),
      cm.EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
    ],
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
  };
}
