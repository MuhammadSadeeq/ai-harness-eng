// Public entry point of the JS simulator (docs/ENGINE.md, all sections).
//   runTrial(tape, board, seed, {facts}) -> {events, wire, result}
//   runBench(tape, board, n, {facts})    -> {trials: [{seed, status, passed, turns, tokens, cost}], passed, n}
// Trial i of a bench uses seed tape.seed_base + i. facts is an object shaped like
// site/data/facts.json (the caller reads the file; this module never does I/O).
import { loadTape } from "./tape.js";
import { loadBoard } from "./board.js";
import { runCore } from "./harness.js";
export { compactionSummary } from "./compaction.js";
export { cacheAccount } from "./cache.js";
// ENGINE 7.3: the backoff rule the harness and hx-outage share. See backoff.js.
export { backoffWait } from "./backoff.js";

export { loadTape, loadBoard };
export { pyjson, traceLine, parseStrictJson } from "./pyjson.js";
export { tokens } from "./tokens.js";
export { createPrng } from "./prng.js";
export { resolvePricing } from "./pricing.js";

// The two shared rules the labs reuse (ENGINE A6.3 and A6.5). The labs import them from here and
// never copy them: there is one implementation, and the harness uses the same one.
//
//   compactionSummary(notes, keep, turn) -> {text, kept, dropped}
//     notes: the tape's notes [{id, kind, turn, text}], in tape order.
//     keep:  the kinds the compactor keeps (the board's compaction.keep).
//     turn:  the current turn. A note is known when its turn is before it.
//     text:  "Summary of the work so far:" and one "\n- kind: text" line per kept note,
//            or "\n- (nothing kept)". kept: ids of known notes in keep. dropped: ids of known
//            notes that are not kept.
//
//   cacheAccount(cacheMap, prefixes, promptTokens, tCall, rules) -> {read, write, uncached, matchedIndex}
//     cacheMap: a Map from key to the time it was last written or read. It is mutated, as A6.5 says.
//     prefixes: [{key, tokens}] in prefix order (P(1) .. P(n)); key is pyjson(P(k)), tokens is tokens(P(k)).
//     promptTokens: tokens of the whole request (P(n)). tCall: the clock when the reply came back.
//     rules: {min_tokens, ttl_ms} from the tape's cache_rules.
//     matchedIndex: the largest k whose key is cached within ttl_ms, 0 when none.

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
