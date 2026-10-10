// Bundles the minimal CodeMirror set (D-014) into site/vendor/codemirror/codemirror.bundle.js with esbuild
// from the pinned packages (D-018). The bundle is committed; run this script to rebuild it and print its
// size, raw and gzip. The editor's colors come from the page's tokens (classes from classHighlighter).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outDir = path.join(root, "site", "vendor", "codemirror");
const outFile = path.join(outDir, "codemirror.bundle.js");
const ENTRY = `
export { EditorState } from "@codemirror/state";
export { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
export { syntaxHighlighting, indentOnInput, bracketMatching } from "@codemirror/language";
export { classHighlighter } from "@lezer/highlight";
export { python } from "@codemirror/lang-python";
`;

await mkdir(outDir, { recursive: true });
await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: root, sourcefile: "codemirror-entry.js", loader: "js" },
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  outfile: outFile,
  legalComments: "none",
  logLevel: "warning",
});
const bytes = await readFile(outFile);
const gzip = gzipSync(bytes, { level: 9 }).length;
console.log(`build_codemirror: ${bytes.length} bytes raw, ${gzip} bytes gzip (site/vendor/codemirror/codemirror.bundle.js)`);
