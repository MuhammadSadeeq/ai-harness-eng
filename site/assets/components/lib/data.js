// Data access for components (docs/COMPONENTS.md §3). Each URL is fetched once per page. Tapes and boards
// go through the simulator's strict parser (integers only, ASCII, key order kept); facts may hold
// decimals (prices), so they use JSON.parse.
import { parseStrictJson } from "../../sim/index.js";

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

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function checkId(kind, id) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`bad ${kind} id: ${String(id)}`);
  return id;
}

export const getTape = async (id) => parseStrictJson(await fetchText(`scenarios/${checkId("tape", id)}.json`));
export const getBoard = async (id) => parseStrictJson(await fetchText(`scenarios/boards/${checkId("board", id)}.json`));
export const getFacts = async () => JSON.parse(await fetchText("facts.json"));
export const getCourse = async () => JSON.parse(await fetchText("course.json"));
export const getTerms = async () => JSON.parse(await fetchText("terms.json"));
/** kind is "cards", "say" or "checks"; id is a module id such as "B2". */
export async function getContent(kind, id) {
  if (!["cards", "say", "checks"].includes(kind)) throw new Error(`bad content kind: ${kind}`);
  if (typeof id !== "string" || !/^[A-Z][0-9]{1,2}$/.test(id)) throw new Error(`bad module id: ${String(id)}`);
  return JSON.parse(await fetchText(`${kind}/${id}.json`));
}
