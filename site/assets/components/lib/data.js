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
/**
 * kind is "cards", "say" or "checks". src is a module id such as "B2" (site/data/<kind>/B2.json) or, on
 * demo pages, a path ending in .json relative to the page (COMPONENTS.md §11).
 */
export async function getContent(kind, src) {
  if (!["cards", "say", "checks"].includes(kind)) throw new Error(`bad content kind: ${kind}`);
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
  if (typeof src !== "string" || !/^[A-Z][0-9]{1,2}$/.test(src)) throw new Error(`bad module id: ${String(src)}`);
  return JSON.parse(await fetchText(`${kind}/${src}.json`));
}
