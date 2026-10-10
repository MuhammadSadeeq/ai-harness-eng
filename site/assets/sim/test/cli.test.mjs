import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("tools/sim_cli.mjs", ROOT));
const TAPE = fileURLToPath(new URL("scenarios/b2-spiral.json", ROOT));
const NEW = fileURLToPath(new URL("scenarios/boards/b2-new.json", ROOT));
const OLD = fileURLToPath(new URL("scenarios/boards/b2-old.json", ROOT));
const sim = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("run prints one canonical JSON line per event; the last is run_end", () => {
  const r = sim(["run", "--tape", TAPE, "--board", NEW, "--seed", "1"]);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trimEnd().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.kind, "run_end");
  assert.equal(last.status, "max_turns");
  assert.equal(lines[lines.length - 1], '{"agent":"main","cost":26438000,"kind":"run_end","passed":false,"run":"b2-spiral:b2-new:1","seq":99,"status":"max_turns","t":28500,"tokens":{"input":10569,"output":530},"turn":12,"turns":12,"v":1,"wire":"loop"}');
});

test("--wire prints request and response lines, the request first, with sorted keys", () => {
  const r = sim(["run", "--tape", TAPE, "--board", OLD, "--seed", "1", "--wire"]);
  assert.equal(r.status, 0, r.stderr);
  const first = r.stdout.split("\n")[0];
  assert.ok(first.startsWith('{"max_tokens":4096,"messages":[{"content":[{"text":"Fix the failing test in calc.py","type":"text"}],"role":"user"}],"model":"claude-sonnet-5-5"'), first.slice(0, 200));
});

test("errors go to stderr with exit code 2", () => {
  const none = sim([]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /usage:/);
  const noTape = sim(["run", "--board", NEW, "--seed", "1"]);
  assert.equal(noTape.status, 2);
  assert.match(noTape.stderr, /--tape is required/);
  const badSeed = sim(["run", "--tape", TAPE, "--board", NEW, "--seed", "x"]);
  assert.equal(badSeed.status, 2);
  assert.match(badSeed.stderr, /--seed must be an integer/);
  const missing = sim(["run", "--tape", "/nonexistent/tape.json", "--board", NEW, "--seed", "1"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /tape/);
  assert.equal(missing.stdout, "");
});

test("--choices prints the branch choices, one canonical line each (A3.22)", () => {
  const r = sim(["run", "--tape", TAPE, "--board", NEW, "--seed", "1", "--choices"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '["/script/3",1]\n');
  const sixty = sim(["run", "--tape", TAPE, "--board", NEW, "--seed", "20261012", "--choices"]);
  assert.equal(sixty.stdout, '["/script/3",0]\n');
});

test("--choices with no choices prints zero bytes", () => {
  const none = sim(["run", "--tape", fileURLToPath(new URL("scenarios/c6-outage.json", ROOT)), "--board", fileURLToPath(new URL("scenarios/boards/c6-new.json", ROOT)), "--seed", "1", "--choices"]);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(none.stdout, "");
});

test("--choices cannot be combined with --wire: exit 2 with a message", () => {
  const both = sim(["run", "--tape", TAPE, "--board", NEW, "--seed", "1", "--wire", "--choices"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /--wire and --choices cannot be combined/);
  assert.equal(both.stdout, "");
});
