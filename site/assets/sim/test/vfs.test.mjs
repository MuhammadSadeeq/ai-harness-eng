import { test } from "node:test";
import assert from "node:assert/strict";
import { Vfs, normalizePath, isInside, MAX_LINK_HOPS } from "../vfs.js";

test("normalizePath resolves . and .. lexically and never climbs above the root", () => {
  assert.equal(normalizePath("./a//b/../c"), "a/c");
  assert.equal(normalizePath("../x"), "../x");
  assert.equal(normalizePath("a/../../x"), "../x");
  assert.equal(normalizePath(""), ".");
  assert.equal(normalizePath("/a/../../b"), "/b");
  assert.equal(isInside("a/c"), true);
  assert.equal(isInside("../x"), false);
  assert.equal(isInside("/etc/passwd"), false);
});

test("a link follows its target relative to its own directory", () => {
  const v = new Vfs({ "a.txt": "hello", "sub/l": { link: "../a.txt" } }, {});
  assert.equal(v.read("sub/l"), "hello");
  assert.equal(v.resolve("sub/l").path, "a.txt");
  assert.equal(v.resolve("sub/l").hops, 1);
});

test("eight link hops resolve; nine do not", () => {
  assert.equal(MAX_LINK_HOPS, 8);
  // chain(n): c1 -> c2 -> ... -> cn -> a, which is exactly n hops from c1.
  const chain = (n) => {
    const w = { a: "x" };
    for (let i = 1; i <= n; i += 1) w[`c${i}`] = { link: i === n ? "a" : `c${i + 1}` };
    return w;
  };
  assert.equal(new Vfs(chain(8), {}).resolve("c1").ok, true);
  assert.equal(new Vfs(chain(8), {}).resolve("c1").hops, 8);
  assert.equal(new Vfs(chain(8), {}).read("c1"), "x");
  assert.equal(new Vfs(chain(9), {}).resolve("c1").ok, false);
  assert.equal(new Vfs(chain(9), {}).read("c1"), null);
});

test("a link into outside resolves to the outside path; writes go through links", () => {
  const v = new Vfs({ "out.txt": { link: "../secret.env" } }, { "../secret.env": "KEY=1" });
  assert.equal(v.resolve("out.txt").path, "../secret.env");
  assert.equal(isInside(v.resolve("out.txt").path), false);
  assert.equal(v.write("out.txt", "KEY=2"), "ok");
  assert.equal(v.read("../secret.env"), "KEY=2");
});

test("listInside shows only workspace paths, sorted", () => {
  const v = new Vfs({ "z.txt": "1", "a.txt": "2", "l": { link: "a.txt" } }, { "../s": "3" });
  assert.deepEqual(v.listInside(), ["a.txt", "l", "z.txt"]);
});
