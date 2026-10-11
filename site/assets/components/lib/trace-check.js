// trace-check: reads a JSONL trace and checks it against scenarios/trace.schema.json (BP-4.0 §4). The page
// gets the schema as site/data/trace.schema.json (gen_data). The checker knows the keywords the schema uses:
// type, const, enum, pattern, minimum, maximum, required, properties, additionalProperties, items, minItems, and
// $ref into $defs. It stops at the first bad line and names it: "line 4: seq 3 follows seq 5".
// Nothing here reads a file or a network: the caller passes the text.

/** The rule a $ref names, followed through any chain of $ref. */
function resolve(rule, root) {
  let current = rule;
  for (let hops = 0; current && current.$ref && hops < 10; hops += 1) {
    const name = current.$ref.replace(/^#\/\$defs\//, "");
    current = root.$defs?.[name];
  }
  return current ?? null;
}

function typeOk(value, type) {
  switch (type) {
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "null": return value === null;
    default: return true;
  }
}

/** The first problem with a value against a rule, as words, or "" when it is fine. `where` names the value. */
export function valueProblem(value, rule, root, where) {
  const r = resolve(rule, root);
  if (!r) return "";
  if ("const" in r && value !== r.const) return `${where} must be ${JSON.stringify(r.const)}`;
  if (Array.isArray(r.enum) && !r.enum.some((option) => option === value)) {
    return `${where} must be one of ${r.enum.map((option) => JSON.stringify(option)).join(", ")}`;
  }
  if (r.type !== undefined) {
    const types = Array.isArray(r.type) ? r.type : [r.type];
    if (!types.some((type) => typeOk(value, type))) return `${where} must be ${types.join(" or ")}`;
  }
  if (typeof value === "number") {
    if (r.minimum !== undefined && value < r.minimum) return `${where} must be at least ${r.minimum}`;
    if (r.maximum !== undefined && value > r.maximum) return `${where} must be at most ${r.maximum}`;
  }
  if (typeof value === "string" && r.pattern !== undefined && !new RegExp(r.pattern, "u").test(value)) {
    return `${where} has a character the schema does not allow`;
  }
  if (Array.isArray(value)) {
    if (r.minItems !== undefined && value.length < r.minItems) return `${where} needs at least ${r.minItems} item${r.minItems === 1 ? "" : "s"}`;
    if (r.items) {
      for (let i = 0; i < value.length; i += 1) {
        const problem = valueProblem(value[i], r.items, root, `${where}[${i}]`);
        if (problem) return problem;
      }
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const props = r.properties ?? {};
    for (const name of r.required ?? []) {
      if (!(name in value)) return `${where} needs ${name}`;
    }
    if (r.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) return `${where} has a field the schema does not allow: ${key}`;
      }
    }
    for (const [name, sub] of Object.entries(props)) {
      if (!(name in value)) continue;
      const problem = valueProblem(value[name], sub, root, `${where}.${name}`);
      if (problem) return problem;
    }
  }
  return "";
}

/** The trace kinds the schema knows: the names under $defs that the top-level oneOf lists. */
export function kindsOf(schema) {
  const listed = (schema.oneOf ?? []).map((option) => (option.$ref ?? "").replace(/^#\/\$defs\//, "")).filter(Boolean);
  return listed.length ? listed : Object.keys(schema.$defs ?? {});
}

/** One line's problem, or "" when the event is well formed and follows the one before it. */
export function lineProblem(event, schema, previous) {
  if (typeof event.kind !== "string" || !kindsOf(schema).includes(event.kind)) {
    return `kind ${JSON.stringify(event.kind ?? null)} is not a trace kind`;
  }
  const rule = schema.$defs[event.kind];
  const shape = valueProblem(event, rule, schema, event.kind);
  if (shape) return shape;
  if (previous === null) {
    if (event.seq !== 0) return `the first event has seq ${event.seq}; it must be 0`;
    return "";
  }
  if (event.run !== previous.run) return `run ${event.run} differs from run ${previous.run}`;
  if (event.seq !== previous.seq + 1) return `seq ${event.seq} follows seq ${previous.seq}`;
  return "";
}

/**
 * Parses and checks a whole trace. Returns {events, error}: events are the rows before the first bad line; error is
 * null for a good trace, else {line, message} with message "line N: reason". A blank last line is allowed.
 */
export function checkTrace(text, schema) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const events = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    const number = index + 1;
    const fail = (reason) => ({ events, error: { line: number, message: `line ${number}: ${reason}` } });
    const text = lines[index];
    if (text.trim() === "") return fail("a blank line");
    let event;
    try {
      event = JSON.parse(text);
    } catch (error) {
      return fail(`not JSON (${error.message})`);
    }
    if (event === null || typeof event !== "object" || Array.isArray(event)) return fail("not a JSON object");
    const reason = lineProblem(event, schema, previous);
    if (reason) return fail(reason);
    events.push(event);
    previous = event;
  }
  return { events, error: null };
}
