import { test } from "node:test";
import assert from "node:assert/strict";
import { globMatch, decide, fieldMatch } from "../policy.js";

test("globs: ** any characters, * no slash, ? one character, literals escaped, anchored", () => {
  assert.equal(globMatch("**", "a/b/c"), true);
  assert.equal(globMatch("**", ""), true);
  assert.equal(globMatch("*", "a/b"), false);
  assert.equal(globMatch("*.py", "calc.py"), true);
  assert.equal(globMatch("*.py", "src/calc.py"), false);
  assert.equal(globMatch("?", "ab"), false);
  assert.equal(globMatch("a?c", "abc"), true);
  assert.equal(globMatch("a.b", "a.b"), true);
  assert.equal(globMatch("a.b", "axb"), false);
  assert.equal(globMatch("a+b", "a+b"), true);
  assert.equal(globMatch("a+b", "aab"), false);
  assert.equal(globMatch("a", "ab"), false, "anchored at both ends");
  assert.equal(globMatch("pytest*", "pytest -q"), true);
  assert.equal(globMatch("../**", "../data"), true);
  assert.equal(globMatch("../**", "data"), false);
});

test("field match: a missing field never matches; a non-string value matches its canonical JSON", () => {
  assert.equal(fieldMatch({ path: "a" }, "cmd", "*"), false);
  assert.equal(fieldMatch({ n: 1 }, "n", "1"), true);
  assert.equal(fieldMatch({ l: [1, 2] }, "l", "[1, 2]"), true);
});

test("decision order: deny rules first, then ask, then allow; first match wins within a decision", () => {
  const permissions = {
    mode: "allow",
    rules: [
      { decision: "allow", tool: "read_file", match: {}, reason: "reads are fine" },
      { decision: "ask", tool: "read_file", match: { path: "*" }, reason: "ask" },
      { decision: "deny", tool: "read_file", match: { path: "secret*" }, reason: "secret" },
      { decision: "deny", tool: "read_file", match: {}, reason: "later deny" },
    ],
  };
  const deny = decide(permissions, { name: "read_file", input: { path: "secret.env" } });
  assert.deepEqual(deny, { decision: "deny", rule: "rules[2]", reason: "secret" });
  const ask = decide(permissions, { name: "read_file", input: { path: "a.txt" } });
  assert.deepEqual(ask, { decision: "deny", rule: "rules[3]", reason: "later deny" }, "a deny rule beats an earlier ask or allow");
});

test("no matching rule falls back to the mode, with rule default; tool * matches any tool", () => {
  const ask = decide({ mode: "ask", rules: [{ decision: "allow", tool: "list_files", match: {}, reason: "ro" }] }, { name: "edit_file", input: {} });
  assert.equal(ask.decision, "ask");
  assert.equal(ask.rule, "default");
  const star = decide({ mode: "deny", rules: [{ decision: "allow", tool: "*", match: {}, reason: "all" }] }, { name: "run_command", input: {} });
  assert.deepEqual(star, { decision: "allow", rule: "rules[0]", reason: "all" });
});

test("a rule's match fields must all match the input", () => {
  const p = { mode: "allow", rules: [{ decision: "deny", tool: "run_command", match: { cmd: "pytest*", path: "x" }, reason: "r" }] };
  assert.equal(decide(p, { name: "run_command", input: { cmd: "pytest -q" } }).decision, "allow");
  assert.equal(decide(p, { name: "run_command", input: { cmd: "pytest -q", path: "x" } }).decision, "deny");
});
