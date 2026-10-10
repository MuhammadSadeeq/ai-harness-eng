// The tool_use ids of one turn, found in the Wire view's JSON text (B2 round 2, item 3). Pure: the component
// highlights the lines these point at. Results ("answers") come from the request; calls come from the response.
const RESULT_ID = /"tool_use_id": "([^"]+)"/;
const CALL_ID = /"id": "(toolu_[^"]+)"/;

/**
 * toolUseHits(requestText, responseText) -> [{kind, id, line, callLine}] in reading order: request results
 * first, then response calls. For a result, callLine is the line of the tool_use block with the same id in the
 * request (or -1 when the request does not hold that call). Line numbers are 0-based.
 */
export function toolUseHits(requestText, responseText) {
  const reqLines = String(requestText).split("\n");
  const resLines = String(responseText).split("\n");
  const hits = [];
  reqLines.forEach((text, line) => {
    const m = RESULT_ID.exec(text);
    if (!m) return;
    const callLine = reqLines.findIndex((t) => t.includes(`"id": "${m[1]}"`));
    hits.push({ kind: "answers", id: m[1], line, callLine });
  });
  resLines.forEach((text, line) => {
    const m = CALL_ID.exec(text);
    if (m) hits.push({ kind: "calls", id: m[1], line, callLine: -1 });
  });
  return hits;
}

// The Wire view folds the request's "tools" array to one line by default (B2 round 2, item 3, round 3).
/** The lines of a pretty-printed request that hold its top-level "tools" array, or null when it has none. */
export function toolsRange(text) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((l) => l === '  "tools": [');
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^ {2}\],?$/.test(l));
  if (end < 0) return null;
  return { start, end, comma: lines[end].endsWith(",") };
}

/**
 * foldTools(text, range, label) -> {lines, map}: the text with the tools range replaced by one line that
 * holds label. map[fullLine] is the displayed line index, or -1 when that line is folded away.
 */
export function foldTools(text, range, label) {
  const lines = String(text).split("\n");
  const shown = [];
  const map = [];
  lines.forEach((line, i) => {
    if (i < range.start || i > range.end) {
      map[i] = shown.length;
      shown.push(line);
    } else if (i === range.start) {
      map[i] = shown.length;
      shown.push(`  "tools": ${label}${range.comma ? "," : ""}`);
    } else {
      map[i] = -1;
    }
  });
  return { lines: shown, map };
}
