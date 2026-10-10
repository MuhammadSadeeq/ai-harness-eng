#!/usr/bin/env node
// Simulator CLI (docs/ENGINE.md section 10).
//   node tools/sim_cli.mjs run --tape T --board B --seed N [--wire] [--facts site/data/facts.json]
//   node tools/sim_cli.mjs eval --eval E --board B [--scenarios DIR] [--facts site/data/facts.json]
// Prints JSONL to stdout: one canonical line per event, or per wire payload with
// --wire. Errors go to stderr with exit code 2.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadTape, loadBoard, runTrial, traceLine, parseStrictJson, loadEval, runEval,
} from "../site/assets/sim/index.js";

// --facts defaults to site/data/facts.json relative to the working directory (A3.19).
const DEFAULT_FACTS = "site/data/facts.json";

function usage(msg) {
  if (msg) process.stderr.write(`sim: ${msg}\n`);
  process.stderr.write(
    "usage: node tools/sim_cli.mjs run --tape T --board B --seed N [--wire | --choices] [--facts site/data/facts.json]\n",
  );
  process.stderr.write(
    "usage: node tools/sim_cli.mjs eval --eval E --board B [--scenarios DIR] [--facts site/data/facts.json]\n",
  );
  process.exit(2);
}

// A11.8: eval options. --eval and --board are paths; --scenarios is the directory tape ids resolve in.
function parseEvalArgs(rest) {
  const opts = { scenarios: "scenarios", facts: DEFAULT_FACTS };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const value = () => {
      if (i + 1 >= rest.length) usage(`${a} needs a value`);
      i += 1;
      return rest[i];
    };
    if (a === "--eval") opts.eval = value();
    else if (a === "--board") opts.board = value();
    else if (a === "--scenarios") opts.scenarios = value();
    else if (a === "--facts") opts.facts = value();
    else usage(`unknown option "${a}"`);
  }
  if (!opts.eval) usage("--eval is required");
  if (!opts.board) usage("--board is required");
  return opts;
}

// A task's tape resolves to <DIR>/<id>.json, else <DIR>/engine/<id>.json (A11.8).
function tapePath(dir, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`tape id "${id}" is not a file name`);
  const top = resolve(dir, `${id}.json`);
  if (existsSync(top)) return top;
  const engine = resolve(dir, "engine", `${id}.json`);
  if (existsSync(engine)) return engine;
  throw new Error(`tape "${id}" has no file: ${top} or ${engine}`);
}

function evalMain(opts) {
  const spec = loadEval(readJson(resolve(opts.eval), "eval"));
  const tapes = {};
  for (const task of spec.tasks) {
    if (!Object.prototype.hasOwnProperty.call(tapes, task.tape)) {
      tapes[task.tape] = readJson(tapePath(opts.scenarios, task.tape), "tape");
    }
  }
  const board = readJson(resolve(opts.board), "board");
  const facts = JSON.parse(readFileSync(resolve(opts.facts), "utf8"));
  // One canonical line: the A11.7 object (sorted keys, no spaces, as traceLine writes it), then a newline.
  process.stdout.write(`${traceLine(runEval(spec, tapes, board, { facts }))}\n`);
}

function parseArgs(argv) {
  const opts = { wire: false, choices: false, facts: DEFAULT_FACTS };
  const [cmd, ...rest] = argv;
  if (cmd !== "run") usage(cmd ? `unknown command "${cmd}"` : "missing command");
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const value = () => {
      if (i + 1 >= rest.length) usage(`${a} needs a value`);
      i += 1;
      return rest[i];
    };
    if (a === "--wire") opts.wire = true;
    else if (a === "--choices") opts.choices = true;
    else if (a === "--tape") opts.tape = value();
    else if (a === "--board") opts.board = value();
    else if (a === "--seed") opts.seed = value();
    else if (a === "--facts") opts.facts = value();
    else usage(`unknown option "${a}"`);
  }
  if (opts.wire && opts.choices) usage("--wire and --choices cannot be combined");
  if (!opts.tape) usage("--tape is required");
  if (!opts.board) usage("--board is required");
  if (opts.seed === undefined) usage("--seed is required");
  if (!/^-?\d+$/.test(opts.seed)) usage(`--seed must be an integer, got "${opts.seed}"`);
  opts.seed = Number(opts.seed);
  return opts;
}

function readJson(path, label) {
  try {
    return parseStrictJson(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${label} ${path}: ${e.message}`);
  }
}

// A closed stdout (for example under `| head -1`) is not an error.
process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

try {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "eval") evalMain(parseEvalArgs(rest));
  else runMain(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`sim: ${e.message}\n`);
  process.exitCode = 2;
}

function runMain(argv) {
  const opts = parseArgs(argv);
  const tape = loadTape(readJson(resolve(opts.tape), "tape"));
  const board = loadBoard(readJson(resolve(opts.board), "board"));
  // Facts hold USD prices (decimals are allowed there); tapes and boards are integers only.
  const facts = JSON.parse(readFileSync(resolve(opts.facts), "utf8"));
  const { events, wire, branches } = runTrial(tape, board, opts.seed, { facts });
  // --choices prints the branch choices instead of events (A3.22); zero choices is zero bytes.
  const payloads = opts.choices ? branches : opts.wire ? wire : events;
  const lines = payloads.map((x) => traceLine(x));
  // Every line ends with a newline; zero lines is zero bytes (A3.21).
  process.stdout.write(lines.map((l) => l + "\n").join(""));
}
