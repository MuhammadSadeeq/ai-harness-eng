// Data access for components (docs/COMPONENTS.md §3). Each URL is fetched once per page. Tapes and boards
// go through the simulator's strict parser (integers only, ASCII, key order kept), imported only when a
// tape or board is asked for, so pages without a run (a kata, cards) don't load the simulator. Facts may
// hold decimals (prices), so they use JSON.parse.
const strict = () => import("../../sim/index.js").then((sim) => sim.parseStrictJson);

const DATA = new URL("../../../data/", import.meta.url);
const cache = new Map();

function fetchText(rel) {
  const url = new URL(rel, DATA).href;
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for data/${rel}`);
      return response.text();
    }));
  }
  return cache.get(url);
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/; // ids name files: letters, digits, dashes (kata ids such as B2-loop)

function checkId(kind, id) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`bad ${kind} id: ${String(id)}`);
  return id;
}

export const getTape = async (id) => (await strict())(await fetchText(`scenarios/${checkId("tape", id)}.json`));
export const getBoard = async (id) => (await strict())(await fetchText(`scenarios/boards/${checkId("board", id)}.json`));
/** A compiled kata (site/data/katas/<id>.json, from katas/<id>/ by tools/gen_data.py). */
export const getKata = async (id) => JSON.parse(await fetchText(`katas/${checkId("kata", id)}.json`));
export const getFacts = async () => JSON.parse(await fetchText("facts.json"));
/**
 * The facts the page reads (site/data/facts-core.json, from tools/gen_data.py): each fact keyed by id, with its
 * status, verified_on, source, and value where it has one (the price facts). No claim: use getFacts() for that.
 */
export const getFactsCore = async () => JSON.parse(await fetchText("facts-core.json"));
export const getCourse = async () => JSON.parse(await fetchText("course.json"));
/**
 * The slim course (site/data/course-core.json, from tools/gen_data.py): wires, failure families, parts, path,
 * counts, and each module's id, slug, title, kind, part, tag, minutes and wires. No objectives: a component that
 * reads a module's objectives uses getCourse().
 */
export const getCourseCore = async () => JSON.parse(await fetchText("course-core.json"));
export const getOncall = async () => JSON.parse(await fetchText("oncall/shift.json"));
export const getTerms = async () => JSON.parse(await fetchText("terms.json"));
/**
 * kind is "cards", "say", "checks", "placement" or "design". src is a module id such as "B2" (site/data/<kind>/B2.json) or, on
 * demo pages, a path ending in .json relative to the page (COMPONENTS.md §11).
 */
export async function getContent(kind, src) {
  if (!["cards", "say", "checks", "placement", "design"].includes(kind)) throw new Error(`bad content kind: ${kind}`);
  if (typeof src === "string" && src.endsWith(".json") && !src.includes("//")) {
    const url = new URL(src, document.baseURI).href;
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
        return response.text();
      }));
    }
    return JSON.parse(await cache.get(url));
  }
  // A module id (I5), or one of the named files: the question bank (say/bank.json) and the board (cards/board.json).
  const named = src === "bank" || src === "board";
  if (typeof src !== "string" || (!named && !/^[A-Z][0-9]{1,2}$/.test(src))) throw new Error(`bad module id: ${String(src)}`);
  return JSON.parse(await fetchText(`${kind}/${src}.json`));
}
