// The wire diff (BP-1.5 §3): this turn's request messages against the previous turn's, by message index and
// pyjson equality. Leading messages that did not change collapse into one count; a message past the end of the
// previous request is new this turn; a message that differs from the previous request at its index is changed.
import { pyjson } from "../../sim/pyjson.js";

/** @returns {{unchanged: number, rows: {index: number, status: "same"|"changed"|"new"}[], removed: number}} */
export function diffMessages(previous, current) {
  const prev = previous ?? [];
  const rows = [];
  let unchanged = 0;
  let leading = true;
  current.forEach((message, index) => {
    if (index >= prev.length) {
      leading = false;
      rows.push({ index, status: "new" });
      return;
    }
    const same = pyjson(prev[index]) === pyjson(message);
    if (same && leading) {
      unchanged += 1;
      return;
    }
    if (same) {
      rows.push({ index, status: "same" });
      return;
    }
    leading = false;
    rows.push({ index, status: "changed" });
  });
  return { unchanged, rows, removed: Math.max(0, prev.length - current.length) };
}
