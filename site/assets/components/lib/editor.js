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
 * Mounts a Python editor in `host` holding `doc`. Resolves to {getValue, setValue, focus, refresh} or null.
 * onChange(text, typed) runs on every change; `typed` is true for keystrokes and deletions, false for a
 * programmatic replacement. setValue replaces the whole document through one transaction.
 *
 * Wrapped lines are laid out with the fonts and the width in use. CodeMirror measures when the document
 * changes, but a font that finishes loading later, or a resize, changes the wrapping without a change, so
 * the editor measures again then. Without that, the line numbers in the gutter fall behind the wrapped rows.
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
      // tabindex 0 on the editable content (already in the tab order) tells axe the sideways-scrolling region
      // holds a focusable control, so keyboard users can reach and scroll it (scrollable-region-focusable).
      cm.EditorView.contentAttributes.of({ "aria-label": label, tabindex: "0" }),
      cm.EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const typed = update.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"));
        onChange(update.state.doc.toString(), typed);
      }),
    ],
  });
  const refresh = () => view.requestMeasure();
  document.fonts?.ready?.then(refresh);
  document.fonts?.addEventListener?.("loadingdone", refresh);
  if (typeof ResizeObserver === "function") new ResizeObserver(refresh).observe(host);
  // CodeMirror does not measure while the editor is out of view: measure again when it comes into view.
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) refresh();
    }).observe(host);
  }
  return {
    getValue: () => view.state.doc.toString(),
    setValue(text, { typed = false } = {}) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        userEvent: typed ? "input.type" : undefined,
      });
      refresh();
    },
    focus: () => view.focus(),
    refresh,
  };
}
