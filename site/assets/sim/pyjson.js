// Canonical JSON (docs/ENGINE.md section 2) and the trace serializer (section 10).
//
// pyjson(x) is Python's json.dumps(x) with its defaults: ensure_ascii, ", " and
// ": " separators, insertion key order. It is used for token estimates.
// traceLine(x) is json.dumps(x, sort_keys=True, separators=(",", ":")), used for
// every line of a trace or wire file.

const NON_ASCII = /[\u007f-￿]/g;

export function jsonString(s) {
  if (typeof s !== "string") throw new TypeError("jsonString: not a string");
  return JSON.stringify(s).replace(
    NON_ASCII,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

function scalar(x) {
  if (x === null) return "null";
  if (x === true) return "true";
  if (x === false) return "false";
  if (typeof x === "number") {
    if (!Number.isInteger(x)) throw new TypeError(`pyjson: not an integer: ${x}`);
    return String(x);
  }
  if (typeof x === "string") return jsonString(x);
  return null;
}

export function pyjson(x) {
  const s = scalar(x);
  if (s !== null) return s;
  if (typeof x !== "object") throw new TypeError(`pyjson: unsupported value of type ${typeof x}`);
  if (Array.isArray(x)) return "[" + x.map((v) => pyjson(v)).join(", ") + "]";
  return "{" + Object.entries(x).map(([k, v]) => jsonString(k) + ": " + pyjson(v)).join(", ") + "}";
}

export function traceLine(x) {
  const s = scalar(x);
  if (s !== null) return s;
  if (typeof x !== "object") throw new TypeError(`traceLine: unsupported value of type ${typeof x}`);
  if (Array.isArray(x)) return "[" + x.map((v) => traceLine(v)).join(",") + "]";
  return "{" + Object.keys(x).sort().map((k) => jsonString(k) + ":" + traceLine(x[k])).join(",") + "}";
}

// JSON.parse that also refuses non-integer number literals (1.0, 2e3), which
// JavaScript cannot tell apart from integers once parsed.
export function parseStrictJson(text) {
  const outside = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const bad = outside.match(/\d\.\d|\d[eE][-+]?\d/);
  if (bad) throw new SyntaxError(`non-integer number literal near '${bad[0]}' (integers only)`);
  return JSON.parse(text);
}
