#!/usr/bin/env node
// Simulator CLI (docs/ENGINE.md section 10).
//   node tools/sim_cli.mjs run --tape T --board B --seed N [--wire] [--facts site/data/facts.json]
// Prints JSONL to stdout: one canonical line per event, or per wire payload with
// --wire. Errors go to stderr with exit code 2.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTape, loadBoard, runTrial, traceLine, parseStrictJson } from "../site/assets/sim/index.js";

// --facts defaults to site/data/facts.json relative to the working directory (A3.19).
const DEFAULT_FACTS = "site/data/facts.json";

function usage(msg) {
  if (msg) process.stderr.write(`sim: ${msg}\n`);
  process.stderr.write(
    "usage: node tools/sim_cli.mjs run --tape T --board B --seed N [--wire] [--facts site/data/facts.json]\n",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { wire: false, facts: DEFAULT_FACTS };
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
    else if (a === "--tape") opts.tape = value();
    else if (a === "--board") opts.board = value();
    else if (a === "--seed") opts.seed = value();
    else if (a === "--facts") opts.facts = value();
    else usage(`unknown option "${a}"`);
  }
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
  const opts = parseArgs(process.argv.slice(2));
  const tape = loadTape(readJson(resolve(opts.tape), "tape"));
  const board = loadBoard(readJson(resolve(opts.board), "board"));
  // Facts hold USD prices (decimals are allowed there); tapes and boards are integers only.
  const facts = JSON.parse(readFileSync(resolve(opts.facts), "utf8"));
  const { events, wire } = runTrial(tape, board, opts.seed, { facts });
  const lines = (opts.wire ? wire : events).map((x) => traceLine(x));
  // Every line ends with a newline; zero lines is zero bytes (A3.21).
  process.stdout.write(lines.map((l) => l + "\n").join(""));
  process.exitCode = 0;
} catch (e) {
  process.stderr.write(`sim: ${e.message}\n`);
  process.exitCode = 2;
}
