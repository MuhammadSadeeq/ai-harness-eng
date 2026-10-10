// Evals (docs/ENGINE.md amendment A11, items 7 and 8). runEval runs each task's tape on one board for
// trials 1 to `trials` (seed k), grades every trial, and returns the A11.7 object. Rates, intervals and
// sample sizes are never computed here (components and katas do that; ENGINE section 1: integers only).
import { createPrng } from "./prng.js";
import { loadTape, fail, isObj, noExtraKeys, reqInt, reqStr, optInt, checkPlain } from "./tape.js";
import { loadBoard, checkBoardForTape } from "./board.js";
import { runCore } from "./harness.js";

const KINDS = ["capability", "regression"];
const EVAL_KEYS = ["id", "schema", "title", "kind", "tasks", "trials", "boards", "seed_base", "model_grader"];
const GRADER_KEYS = ["false_pass_percent", "false_fail_percent"];
const MAX_TASKS = 20;
const MAX_TRIALS = 50;
// A12.3: a task's tape id, which the CLI resolves to a file name.
const TAPE_ID = /^[a-z0-9][a-z0-9-]*$/;

function percentOf(obj, key, where) {
  const v = reqInt(obj, key, where, 0);
  if (v > 100) fail(where, `${key} must be 0-100`);
  return v;
}

// Validates an eval object (a file's JSON, or the output of an earlier loadEval). Returns a new object with
// seed_base 0 by default; model_grader is left out when absent. Refusals are listed in ENGINE A11.7 and the
// BP-3.5 rulings.
export function loadEval(raw) {
  if (!isObj(raw)) fail("eval", "must be an object");
  checkPlain(raw, "eval");
  const where = `eval ${raw.id ?? "?"}`;
  noExtraKeys(raw, EVAL_KEYS, where);
  if (raw.schema !== 1) fail(where, "schema must be 1");
  const id = reqStr(raw, "id", where);
  const title = reqStr(raw, "title", where);
  if (!KINDS.includes(raw.kind)) fail(where, 'kind must be "capability" or "regression"');
  if (!Array.isArray(raw.tasks)) fail(where, "tasks must be a list");
  if (raw.tasks.length < 1 || raw.tasks.length > MAX_TASKS) fail(where, `tasks must have 1 to ${MAX_TASKS} entries`);
  const taskIds = new Set();
  const tasks = raw.tasks.map((t, i) => {
    const w = `${where} tasks[${i}]`;
    if (!isObj(t)) fail(w, "must be an object");
    noExtraKeys(t, ["id", "tape"], w);
    const tid = reqStr(t, "id", w);
    if (taskIds.has(tid)) fail(where, `task id "${tid}" is repeated`);
    taskIds.add(tid);
    const tape = reqStr(t, "tape", w);
    if (!TAPE_ID.test(tape)) fail(w, `tape "${tape}" must match ${TAPE_ID.source}`);
    return { id: tid, tape };
  });
  const trials = reqInt(raw, "trials", where, 1);
  if (trials > MAX_TRIALS) fail(where, `trials must be 1 to ${MAX_TRIALS}`);
  // A12.3: boards is a non-empty list of distinct board ids (the boards the goldens cover).
  if (!Array.isArray(raw.boards) || raw.boards.length === 0 || raw.boards.some((b) => typeof b !== "string")) {
    fail(where, "boards must be a non-empty list of board ids");
  }
  if (new Set(raw.boards).size !== raw.boards.length) fail(where, "boards must not repeat a board");
  const seedBase = optInt(raw, "seed_base", where, 0);
  // A12.3: model_grader is absent or an object; null is refused.
  let grader;
  if (raw.model_grader !== undefined) {
    const g = raw.model_grader;
    const gw = `${where} model_grader`;
    if (!isObj(g)) fail(gw, "must be an object");
    noExtraKeys(g, GRADER_KEYS, gw);
    grader = {
      false_pass_percent: percentOf(g, "false_pass_percent", gw),
      false_fail_percent: percentOf(g, "false_fail_percent", gw),
    };
  }
  const out = { id, schema: 1, title, kind: raw.kind, tasks, trials, boards: [...raw.boards], seed_base: seedBase };
  if (grader !== undefined) out.model_grader = grader;
  return out;
}

// The simulated judge (A11.7). d is one percent() draw from the eval's own PRNG for this trial.
function judge(grader, code, status, d) {
  if (code) return !(d < grader.false_fail_percent);
  if (status === "done") return d < grader.false_pass_percent;
  return false;
}

// tapes: a plain object or a Map from tape id to the tape object as JSON (loaded here). board: the board as JSON.
// Every task's tape is loaded and checked against the board before the first trial runs, so a refused board
// or a missing tape is a loader error for the whole eval.
export function runEval(spec, tapes, board, { facts } = {}) {
  const E = loadEval(spec);
  const B = loadBoard(board);
  const lookup = (id) => {
    if (tapes instanceof Map) return tapes.get(id);
    return Object.prototype.hasOwnProperty.call(tapes, id) ? tapes[id] : undefined;
  };
  const loaded = E.tasks.map((task) => {
    const raw = lookup(task.tape);
    if (raw === undefined) fail(`eval ${E.id}`, `task ${task.id} names tape "${task.tape}", which is not given`);
    const T = loadTape(raw);
    checkBoardForTape(T, B);
    return T;
  });

  const results = [];
  E.tasks.forEach((task, i) => {
    for (let k = 1; k <= E.trials; k += 1) {
      const { events, result } = runCore(loaded[i], B, k, facts);
      const code = result.status === "done" && result.passed;
      const row = {
        task: task.id,
        trial: k,
        status: result.status,
        passed: result.passed,
        code,
        leaked: events.some((e) => e.kind === "leak"),
      };
      if (E.model_grader) {
        const d = createPrng(E.seed_base + 1000 * i + k).percent();
        row.model = judge(E.model_grader, code, result.status, d);
      }
      row.turns = result.turns;
      row.tokens = result.tokens;
      row.cost = result.cost;
      results.push(row);
    }
  });

  const count = (f) => results.filter(f).length;
  const summary = { runs: results.length, code: count((r) => r.code), leaked: count((r) => r.leaked) };
  if (E.model_grader) {
    summary.model = count((r) => r.model);
    summary.agree = count((r) => r.model === r.code);
  }
  summary.tasks = E.tasks.length;
  summary.tasks_any_pass = E.tasks.filter((t) => results.some((r) => r.task === t.id && r.code)).length;
  summary.tasks_all_pass = E.tasks.filter((t) => results.filter((r) => r.task === t.id).every((r) => r.code)).length;
  summary.cost = results.reduce((s, r) => s + r.cost, 0);
  return { eval: E.id, board: B.id, kind: E.kind, trials: E.trials, results, summary };
}
