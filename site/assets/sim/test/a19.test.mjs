// ENGINE amendment A19 (docs/ENGINE.md): rules_file may list rules that replace the tape's for the run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, ofKind, boardWith } from "./helpers.mjs";

const TAPE_RULES = { rules: ["Use format_report()."] };
const firstRequest = (r) => r.wire.find((w) => w.messages !== undefined);
const layers = (r) => ofKind(r.events, "prompt_built")[0].layers;

test("A19: without a list, rules_file uses the tape's rules, as before", () => {
  const r = runWith(TAPE_RULES, { rules_file: {} });
  assert.equal(firstRequest(r).system, "sys\n\nProject rules:\n- Use format_report().");
  assert.deepEqual(layers(r), ["system", "rules", "tools", "history"]);
});

test("A19: the board's rules replace the tape's in the system text and the layers", () => {
  const r = runWith(TAPE_RULES, { rules_file: { rules: ["Use render_report().", "Say done when it is written."] } });
  assert.equal(firstRequest(r).system, "sys\n\nProject rules:\n- Use render_report().\n- Say done when it is written.");
  assert.deepEqual(layers(r), ["system", "rules", "tools", "history"]);
});

test("A19: an empty list leaves no rules layer", () => {
  const r = runWith(TAPE_RULES, { rules_file: { rules: [] } });
  assert.equal(firstRequest(r).system, "sys");
  assert.deepEqual(layers(r), ["system", "tools", "history"]);
});

test("A19: a scripted condition reads the board's rules", () => {
  const script = [
    { when: [{ if: "sent_lacks:format_report", then: [{ say: "fixed map", stop: "end_turn" }] }, { else: [{ say: "stale map", stop: "end_turn" }] }] },
  ];
  const stale = runWith({ ...TAPE_RULES, script }, { rules_file: {} });
  const fixed = runWith({ ...TAPE_RULES, script }, { rules_file: { rules: ["Use render_report()."] } });
  assert.equal(ofKind(stale.events, "model_reply")[0].text, "stale map");
  assert.equal(ofKind(fixed.events, "model_reply")[0].text, "fixed map");
});

test("A19: rules that are not a list of non-empty strings are refused", () => {
  assert.throws(() => boardWith({ rules_file: { rules: "x" } }), /A19/);
  assert.throws(() => boardWith({ rules_file: { rules: [""] } }), /A19/);
  assert.throws(() => boardWith({ rules_file: { rules: [1] } }), /A19/);
  assert.throws(() => boardWith({ rules_file: { other: 1 } }));
});
