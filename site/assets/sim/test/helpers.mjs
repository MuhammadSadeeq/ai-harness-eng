// Shared helpers for the simulator tests (not a test file itself).
import { readFileSync } from "node:fs";
import { loadTape, loadBoard, runTrial } from "../index.js";

export const ROOT = new URL("../../../../", import.meta.url);
export const readRepo = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
export const readJsonRepo = (rel) => JSON.parse(readRepo(rel));
export const FACTS = readJsonRepo("site/data/facts.json");

export const BASE_TAPE = {
  id: "t",
  schema: 1,
  title: "Test tape",
  task: "do it",
  model_id: "m",
  pricing: { input_milli_per_mtok: 1000, output_milli_per_mtok: 1000 },
  window: 100000,
  system: "sys",
  rules: [],
  workspace: { "a.txt": "hello\n" },
  outside: {},
  tools: ["read_file", "write_file", "edit_file", "list_files", "run_command"],
  custom_tools: [],
  checks: [],
  test_output: { pass: "ok", fail: "nope" },
  script: [{ say: "Done.", stop: "end_turn" }],
};

export const tapeWith = (over = {}) => loadTape({ ...structuredClone(BASE_TAPE), ...over });
export const boardWith = (modules = {}) => loadBoard({ id: "t-board", modules });
export const runWith = (over = {}, modules = {}, seed = 1) =>
  runTrial(tapeWith(over), boardWith(modules), seed, { facts: FACTS });
export const kindsOf = (events) => events.map((e) => e.kind);
export const ofKind = (events, kind) => events.filter((e) => e.kind === kind);
