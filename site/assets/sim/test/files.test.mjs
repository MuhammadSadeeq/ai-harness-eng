import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readRepo } from "./helpers.mjs";

test("site/assets/sim/tooldefs.json is byte-identical to the shared fixture", () => {
  const copy = readFileSync(new URL("../tooldefs.json", import.meta.url));
  const fixture = Buffer.from(readRepo("scenarios/fixtures/tooldefs.json"), "utf8");
  assert.ok(copy.equals(fixture), "tooldefs.json differs from scenarios/fixtures/tooldefs.json");
});
