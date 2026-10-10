// A4: the incident block shape. These tests use their own tape objects; references to
// course.json and traces are checked by check_scenarios, not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tapeWith } from "./helpers.mjs";

const GOOD = () => ({
  family: "almost-done-spiral",
  wire: "loop",
  board: "b2-old",
  seed: 20261010,
  first_bad_seq: 30,
  why: "The fix was undone after the tests passed.",
  hint: "Look at what changed after the green run.",
  fixes: [
    { text: "Remove the + 1 in total()", why: "It is the bug." },
    { text: "Raise the turn limit", why: "It only hides the spiral." },
  ],
  correct_fix: 0,
  par_s: 120,
});
const withIncident = (over) => tapeWith({ incident: { ...GOOD(), ...over } });
const refused = (over, pattern) => assert.throws(() => tapeWith({ incident: over }), pattern);

test("a valid incident loads; accept_seqs and notes default to []", () => {
  const t = withIncident({});
  assert.deepEqual(t.incident.accept_seqs, []);
  assert.deepEqual(t.incident.notes, []);
  assert.equal(t.incident.correct_fix, 0);
  assert.equal(t.incident.seed, 20261010);
});

test("accept_seqs and notes are kept when given; the loaded block loads again unchanged", () => {
  const t = withIncident({ accept_seqs: [31, 32], notes: [{ seq: 12, text: "Not this one." }] });
  assert.deepEqual(t.incident.accept_seqs, [31, 32]);
  assert.deepEqual(t.incident.notes, [{ seq: 12, text: "Not this one." }]);
  assert.deepEqual(tapeWith(t).incident, t.incident);
});

test("an absent incident is omitted from the loaded tape", () => {
  assert.equal("incident" in tapeWith({}), false);
});

test("incident null or a non-object is refused", () => {
  assert.throws(() => tapeWith({ incident: null }), /incident must be an object/);
  assert.throws(() => tapeWith({ incident: "x" }), /incident must be an object/);
});

test("every required field is required", () => {
  for (const k of ["family", "wire", "board", "seed", "first_bad_seq", "why", "hint", "fixes", "correct_fix", "par_s"]) {
    const block = GOOD();
    delete block[k];
    assert.throws(() => tapeWith({ incident: block }), new RegExp(`incident is missing "${k}"`), k);
  }
});

test("no extra keys: at the top, in a note, or in a fix", () => {
  refused({ ...GOOD(), extra: 1 }, /unknown field "extra"/);
  refused({ ...GOOD(), notes: [{ seq: 1, text: "x", why: "y" }] }, /unknown field "why"/);
  refused({ ...GOOD(), fixes: [{ text: "a", why: "b", more: "c" }, { text: "d", why: "e" }] }, /unknown field "more"/);
});

test("strings are non-empty: family, board, why, hint, fix text and why, note text", () => {
  refused({ ...GOOD(), family: "" }, /family must be a non-empty string/);
  refused({ ...GOOD(), board: "" }, /board must be a non-empty string/);
  refused({ ...GOOD(), why: "" }, /why must be a non-empty string/);
  refused({ ...GOOD(), hint: "" }, /hint must be a non-empty string/);
  refused({ ...GOOD(), fixes: [{ text: "", why: "b" }, { text: "d", why: "e" }] }, /text must be a non-empty string/);
  refused({ ...GOOD(), fixes: [{ text: "a", why: "" }, { text: "d", why: "e" }] }, /why must be a non-empty string/);
  refused({ ...GOOD(), notes: [{ seq: 1, text: "" }] }, /text must be a non-empty string/);
});

test("integers are >= 0: seed, first_bad_seq, correct_fix, par_s, accept_seqs, note seq", () => {
  refused({ ...GOOD(), seed: -1 }, /seed must be an integer >= 0/);
  refused({ ...GOOD(), first_bad_seq: -1 }, /first_bad_seq must be an integer >= 0/);
  refused({ ...GOOD(), par_s: -5 }, /par_s must be an integer >= 0/);
  refused({ ...GOOD(), accept_seqs: [-2] }, /accept_seqs\[0\] must be an integer >= 0/);
  refused({ ...GOOD(), notes: [{ seq: -1, text: "x" }] }, /seq must be an integer >= 0/);
  refused({ ...GOOD(), seed: "1" }, /seed must be an integer >= 0/);
});

test("non-integer numbers are refused by the tape rule before the block is read", () => {
  refused({ ...GOOD(), first_bad_seq: 1.5 }, /not an integer/);
});

test("wire is one of the schema's wire categories", () => {
  refused({ ...GOOD(), wire: "bogus" }, /wire "bogus" is not a wire category/);
  for (const w of ["control", "context", "loop", "errors", "tools", "permissions", "verify", "observe"]) {
    withIncident({ wire: w });
  }
});

test("fixes has 2 to 4 entries", () => {
  const one = [{ text: "a", why: "b" }];
  const five = Array.from({ length: 5 }, (_, i) => ({ text: `t${i}`, why: "w" }));
  refused({ ...GOOD(), fixes: one }, /fixes must be a list of 2 to 4/);
  refused({ ...GOOD(), fixes: five }, /fixes must be a list of 2 to 4/);
  for (const n of [2, 3, 4]) {
    withIncident({ fixes: Array.from({ length: n }, (_, i) => ({ text: `t${i}`, why: "w" })) });
  }
});

test("correct_fix is an index of fixes (checked inside the block)", () => {
  refused({ ...GOOD(), correct_fix: 2 }, /correct_fix 2 is not an index of fixes/);
  withIncident({ correct_fix: 1 });
});

test("accept_seqs and notes must be lists; a note is {seq, text}", () => {
  refused({ ...GOOD(), accept_seqs: 31 }, /accept_seqs must be a list/);
  refused({ ...GOOD(), notes: "x" }, /notes must be a list/);
  refused({ ...GOOD(), notes: ["x"] }, /must be \{seq, text\}/);
});

test("strings are ASCII (the tape rule)", () => {
  refused({ ...GOOD(), why: "café" }, /not ASCII/);
});
