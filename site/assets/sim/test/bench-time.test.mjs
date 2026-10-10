// B-17: each bench trial carries the clock at run_end of its own run (the simulated milliseconds).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runBench, runTrial } from "../index.js";
import { FACTS, tapeWith, boardWith } from "./helpers.mjs";

test("B-17: a bench trial's ms is the run_end clock of the run with that seed", () => {
  const tape = tapeWith({ script: [{ say: "Reading.", tools: [["read_file", { path: "a.txt" }]] }, { say: "Done.", stop: "end_turn" }] });
  const board = boardWith({});
  const bench = runBench(tape, board, 3, { facts: FACTS });
  for (const trial of bench.trials) {
    const run = runTrial(tape, board, trial.seed, { facts: FACTS });
    const end = run.events.find((e) => e.kind === "run_end");
    assert.equal(trial.ms, end.t, `seed ${trial.seed}`);
    assert.ok(trial.ms > 0, "a run with a model call takes time");
  }
});
