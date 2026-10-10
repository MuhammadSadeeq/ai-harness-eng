// The simulated human (ENGINE A2): answers each ask for permission. The harness and the labs (hx-gatekeeper)
// share this one implementation; nothing copies it.
import { fieldMatch } from "./policy.js";

// createHuman(human, prng) -> {ask(call), asks}
//   human: the tape's human block, loaded: {default: "approve" | "deny", deny_if: {field: glob}, fatigue: {after, approve_percent} | null}.
//   prng:  the run's PRNG (the harness passes its own, so one trial keeps one draw stream; a lab passes createPrng(seed)).
//   ask(call): "approve" or "deny" for the call (the input is the call's input). Each ask counts. A draw happens only when
//              fatigue is set and this ask is after the first `after` asks: below approve_percent approves without looking.
//              Otherwise deny_if decides: all fields match, deny. Otherwise the default answers.
//   asks:  how many asks have been made (a getter).
export function createHuman(human, prng) {
  let count = 0;
  const denyIf = human.deny_if ?? {};
  const fatigue = human.fatigue ?? null;
  return {
    ask(call) {
      count += 1;
      if (fatigue && count > fatigue.after) {
        if (prng.percent() < fatigue.approve_percent) return "approve";
      }
      const pairs = Object.entries(denyIf);
      if (pairs.length > 0 && pairs.every(([field, glob]) => fieldMatch(call.input, field, glob))) return "deny";
      return human.default;
    },
    get asks() {
      return count;
    },
  };
}
