// COMPONENTS §7: a self-test that puts the learner's state back does it with
// restoreAfterTest(saved), so QA's audit after interaction (run({ keep: true })) sees the results.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function selfTestBody(source) {
  const start = source.indexOf("async selfTest()");
  if (start < 0) return "";
  const end = source.indexOf("\n  }\n", start);
  return source.slice(start, end < 0 ? undefined : end);
}

test("no self-test restores state with a bare setState(saved)", () => {
  const offenders = [];
  for (const name of readdirSync(DIR).filter((n) => /^hx-.*\.js$/.test(n))) {
    if (/this\.setState\(saved\)/.test(selfTestBody(readFileSync(path.join(DIR, name), "utf8")))) offenders.push(name);
  }
  assert.deepEqual(offenders, [], "use this.restoreAfterTest(saved) in the self-test's finally");
});

test("the base class keeps the results only while QA asks it to", () => {
  // The base class needs a DOM to construct, so this reads its source: run() sets the flag
  // from keep and clears it after, and restoreAfterTest skips the restore while it is set.
  const source = readFileSync(path.join(DIR, "lib", "hx-element.js"), "utf8");
  assert.match(source, /run: async \(\{ keep = false \} = \{\}\) => \{/);
  assert.match(source, /this\.testKeepsState = keep;/);
  assert.match(source, /\} finally \{\n\s+this\.testKeepsState = false;/);
  assert.match(source, /restoreAfterTest\(saved\) \{\n\s+if \(!this\.testKeepsState\) this\.setState\(saved\);/);
});
