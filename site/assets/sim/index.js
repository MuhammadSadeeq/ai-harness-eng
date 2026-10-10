// Public entry point of the JS simulator (docs/ENGINE.md, all sections).
//   runTrial(tape, board, seed, {facts}) -> {events, wire, result}
//   runBench(tape, board, n, {facts})    -> {trials: [{seed, status, passed, turns, tokens, cost}], passed, n}
// Trial i of a bench uses seed tape.seed_base + i. facts is an object shaped like
// site/data/facts.json (the caller reads the file; this module never does I/O).
import { loadTape } from "./tape.js";
import { loadBoard } from "./board.js";
import { runCore } from "./harness.js";

export { loadTape, loadBoard };
export { pyjson, traceLine, parseStrictJson } from "./pyjson.js";
export { tokens } from "./tokens.js";
export { createPrng } from "./prng.js";
export { resolvePricing } from "./pricing.js";

export function runTrial(tape, board, seed, { facts } = {}) {
  return runCore(loadTape(tape), loadBoard(board), seed, facts);
}

export function runBench(tape, board, n, { facts } = {}) {
  const T = loadTape(tape);
  const B = loadBoard(board);
  const trials = [];
  for (let i = 0; i < n; i += 1) {
    const seed = T.seed_base + i;
    const { result } = runCore(T, B, seed, facts);
    trials.push({
      seed,
      status: result.status,
      passed: result.passed,
      turns: result.turns,
      tokens: result.tokens,
      cost: result.cost,
    });
  }
  return { trials, passed: trials.filter((t) => t.passed).length, n };
}
