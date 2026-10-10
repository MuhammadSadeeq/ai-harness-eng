// Tools (docs/ENGINE.md section 6.4 and amendments A3.1-A3.5, A3.11): the built-in
// virtual tools, scripted custom tools, and the tool definitions sent to the model.
import toolDefsAll from "./tooldefs.json" with { type: "json" };
import { pyjson } from "./pyjson.js";

const BUILTIN_LATENCY = {
  read_file: 100,
  write_file: 100,
  edit_file: 100,
  list_files: 100,
  run_command: 2000,
};
export const UNKNOWN_LATENCY = 100;

// A missing or non-string input value reads as "" (A3.4).
const str = (v) => (typeof v === "string" ? v : "");

// Words of a command: split on whitespace after trimming (A3.3).
export function commandWords(cmd) {
  const t = str(cmd).trim();
  return t === "" ? [] : t.split(/\s+/);
}

// The path a `cat <path>` command reads (exactly one argument), else null.
export function catPath(cmd) {
  const w = commandWords(cmd);
  return w[0] === "cat" && w.length === 2 ? w[1] : null;
}

export function countOccurrences(text, needle) {
  if (needle === "") return 0;
  let n = 0;
  let i = 0;
  for (;;) {
    const j = text.indexOf(needle, i);
    if (j < 0) return n;
    n += 1;
    i = j + needle.length;
  }
}

// Every check holds on the workspace (ground truth). A missing file fails both kinds (A3.5).
export function checksHold(vfs, checks) {
  return checks.every((c) => {
    const text = vfs.read(c.file);
    if (text === null) return false;
    return "contains" in c ? text.includes(c.contains) : !text.includes(c.not_contains);
  });
}

// Tool definitions sent to the model: the built-ins the tape names, in tooldefs.json
// order, then each custom tool in tape order (A3.1).
export function toolDefs(tape) {
  const builtins = toolDefsAll
    .filter((d) => tape.tools.includes(d.name))
    .map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema }));
  const customs = tape.custom_tools.map((c) => ({
    name: c.name,
    description: c.description,
    input_schema: c.input_schema,
  }));
  return [...builtins, ...customs];
}

export class Tools {
  constructor(tape, vfs) {
    this.tape = tape;
    this.vfs = vfs;
    this.builtin = new Set(tape.tools);
    this.custom = new Map(tape.custom_tools.map((c) => [c.name, c]));
  }

  latency(name) {
    if (this.custom.has(name)) return this.custom.get(name).latency_ms;
    if (this.builtin.has(name)) return BUILTIN_LATENCY[name];
    return UNKNOWN_LATENCY;
  }

  // Runs one tool call against the workspace. Returns {ok, output}.
  run(call) {
    if (this.custom.has(call.name)) return this.runCustom(this.custom.get(call.name), call.input);
    if (this.builtin.has(call.name)) return this.runBuiltin(call.name, call.input);
    return { ok: false, output: `Unknown tool: ${call.name}` };
  }

  // First result whose every match field equals the input field (by pyjson), else the default (A3.11).
  runCustom(def, input) {
    const hit = def.results.find((r) =>
      Object.entries(r.match).every(([f, v]) =>
        Object.prototype.hasOwnProperty.call(input, f) && pyjson(input[f]) === pyjson(v)));
    const r = hit ?? def.default;
    return { ok: r.ok, output: r.output };
  }

  readOut(path) {
    const r = this.vfs.lookup(path);
    if (r.kind === "links") return { ok: false, output: `Too many levels of links: ${path}` };
    if (r.kind === "missing") return { ok: false, output: `No file at '${path}'. Call list_files to see what exists.` };
    return { ok: true, output: r.text };
  }

  writeOut(path, content) {
    const w = this.vfs.write(path, content);
    if (w === "links") return { ok: false, output: `Too many levels of links: ${path}` };
    if (w === "dir") return { ok: false, output: `Is a directory: ${path}` };
    return { ok: true, output: `Wrote ${path} (${content.length} chars)` };
  }

  editOut(path, oldText, newText) {
    const r = this.vfs.lookup(path);
    if (r.kind !== "file") return this.readOut(path);
    const text = r.text;
    const n = countOccurrences(text, oldText);
    if (n === 0) return { ok: false, output: `old_text was not found in ${path}. Read the file again.` };
    if (n > 1) return { ok: false, output: `old_text appears ${n} times in ${path}; include more context.` };
    const i = text.indexOf(oldText);
    this.vfs.write(path, text.slice(0, i) + newText + text.slice(i + oldText.length));
    return { ok: true, output: `Edited ${path} (1 change)` };
  }

  listOut() {
    return { ok: true, output: this.vfs.listInside().join("\n") };
  }

  runBuiltin(name, input) {
    switch (name) {
      case "read_file":
        return this.readOut(str(input.path));
      case "write_file":
        return this.writeOut(str(input.path), str(input.content));
      case "edit_file":
        return this.editOut(str(input.path), str(input.old_text), str(input.new_text));
      case "list_files":
        return this.listOut();
      case "run_command":
        return this.commandOut(str(input.cmd));
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  }

  commandOut(cmd) {
    const w = commandWords(cmd);
    const first = w[0] ?? "";
    const joined = w.join(" ");
    if (joined === "pytest" || joined === "pytest -q") {
      return checksHold(this.vfs, this.tape.checks)
        ? { ok: true, output: this.tape.test_output.pass }
        : { ok: false, output: this.tape.test_output.fail };
    }
    if (first === "ls") return this.listOut();
    if (first === "cat") {
      return w.length === 2 ? this.readOut(w[1]) : { ok: false, output: "usage: cat <path>" };
    }
    return { ok: false, output: `command not found: ${first}` };
  }
}
