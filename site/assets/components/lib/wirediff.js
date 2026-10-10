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

// BP-3.3 B-16: the diff over a whole request, in request order. The parts are one per tool definition
// ("tools[0]", "tools[1]", ...), then the system prompt ("system"), then one per message ("messages[0]", ...).
// Each part is compared with cache_control removed first, so a part that differs only in its cache breakpoint is
// "breakpoint moved", not "changed". Statuses: "same", "changed", "breakpoint moved", "added" (the previous request
// had no such part; every part of a first turn is added) and "removed" (the previous request had it, this one does
// not; removed parts come after the current ones, in their previous order).

/** Every part of a request as {key, value}, in request order. */
function partsOf(request) {
  const parts = [];
  (request?.tools ?? []).forEach((tool, i) => parts.push({ key: `tools[${i}]`, value: tool }));
  parts.push({ key: "system", value: request?.system ?? "" });
  (request?.messages ?? []).forEach((message, k) => parts.push({ key: `messages[${k}]`, value: message }));
  return parts;
}

/** A copy of a JSON value with every cache_control key removed, at any depth. */
export function withoutCacheControl(value) {
  if (Array.isArray(value)) return value.map(withoutCacheControl);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key !== "cache_control") out[key] = withoutCacheControl(item);
    }
    return out;
  }
  return value;
}

/**
 * @param {object|undefined} previous the previous turn's request ({tools, system, messages}), or undefined on the first turn
 * @param {object} current this turn's request
 * @returns {{rows: {part: string, status: "same"|"changed"|"breakpoint moved"|"added"|"removed"}[]}}
 */
export function diffRequest(previous, current) {
  const prev = previous ? partsOf(previous) : [];
  const cur = partsOf(current);
  const prevByKey = new Map(prev.map((p) => [p.key, p.value]));
  const curKeys = new Set(cur.map((p) => p.key));
  const rows = cur.map(({ key, value }) => {
    if (!prevByKey.has(key)) return { part: key, status: "added" };
    const before = prevByKey.get(key);
    if (pyjson(before) === pyjson(value)) return { part: key, status: "same" };
    if (pyjson(withoutCacheControl(before)) === pyjson(withoutCacheControl(value))) {
      return { part: key, status: "breakpoint moved" };
    }
    return { part: key, status: "changed" };
  });
  for (const { key } of prev) {
    if (!curKeys.has(key)) rows.push({ part: key, status: "removed" });
  }
  return { rows };
}
