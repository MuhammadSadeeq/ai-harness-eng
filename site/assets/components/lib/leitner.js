// Pure card logic for hx-cards (D-026, BP-1.6 §3): Leitner boxes, the session queue, the summary
// sentence, the deterministic shuffle (ENGINE §3 PRNG) and the JSON rows of spot-bug-json cards.
// No DOM and no imports, so Node tests run it directly. Dates are local calendar dates as
// "YYYY-MM-DD" strings, which compare correctly as strings.

export const INTERVALS = Object.freeze([0, 1, 3, 7, 16, 35]);
export const MAX_BOX = INTERVALS.length;
export const SESSION_LIMIT = 20;
export const CARD_TYPES = Object.freeze([
  "term", "wire-question", "which-wire", "spot-bug-json", "order-turn", "name-family",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar date (not UTC) as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, days) {
  if (!ISO_DATE.test(iso)) throw new Error(`bad date: ${iso}`);
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** A card the learner has not seen yet: box 1, due today. */
export function newCard(today) {
  return { box: 1, due: today, seen: 0, last: null };
}

/** The stored state of a card, or null. Own properties only (a card id may look like "constructor"). */
export function stored(cards, id) {
  if (!cards || typeof cards !== "object" || !Object.hasOwn(cards, id)) return null;
  const card = cards[id];
  return card && typeof card === "object" ? card : null;
}

/** Right: up one box (at most 6), due today plus that box's interval. Miss: box 1, due today. */
export function grade(card, correct, today) {
  const seen = (card?.seen ?? 0) + 1;
  if (!correct) return { box: 1, due: today, seen, last: today };
  const box = Math.min((card?.box ?? 1) + 1, MAX_BOX);
  return { box, due: addDays(today, INTERVALS[box - 1]), seen, last: today };
}

/** The due cards (earliest due first, then course order), then the new cards; at most `limit`. */
export function sessionQueue(cards, ids, today, limit = SESSION_LIMIT) {
  const order = new Map(ids.map((id, index) => [id, index]));
  const due = ids
    .filter((id) => stored(cards, id)?.due <= today)
    .sort((a, b) => {
      const byDue = stored(cards, a).due.localeCompare(stored(cards, b).due);
      return byDue !== 0 ? byDue : order.get(a) - order.get(b);
    });
  const fresh = ids.filter((id) => stored(cards, id) === null);
  return [...due, ...fresh].slice(0, limit);
}

function plural(n, word) {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}

/** "Next due: tomorrow (4 cards)." over the cards of one set. */
export function nextDueText(cards, ids, today) {
  const future = ids
    .map((id) => stored(cards, id)?.due)
    .filter((due) => typeof due === "string" && due > today);
  if (future.length > 0) {
    const next = future.reduce((a, b) => (b < a ? b : a));
    const count = future.filter((due) => due === next).length;
    const when = next === addDays(today, 1) ? "tomorrow" : next;
    return `Next due: ${when} (${plural(count, "card")}).`;
  }
  const count = ids.filter((id) => (stored(cards, id)?.due ?? today) <= today).length;
  return `Next due: today (${plural(count, "card")}).`;
}

/** "12 reviewed: 9 right, 3 again. Next due: tomorrow (4 cards)." */
export function sessionSummary({ reviewed, right, again }, cards, ids, today) {
  return `${reviewed} reviewed: ${right} right, ${again} again. ${nextDueText(cards, ids, today)}`;
}

/** The seed for a card's shuffles: the sum of its id's character codes. */
export function seedOf(id) {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return sum;
}

/** ENGINE §3: mulberry32, one unsigned 32-bit state seeded with seed >>> 0. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Fisher-Yates over a copy, drawing j = next() % (i + 1) from the end. */
export function shuffle(items, seed) {
  const next = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffle that is never the input order (for order-turn: the learner must not start solved). */
export function shuffleAway(items, seed) {
  const out = shuffle(items, seed);
  if (items.length > 1 && out.every((value, i) => value === items[i])) {
    [out[0], out[1]] = [out[1], out[0]];
  }
  return out;
}

/** name-family: the right family plus two others from the course, shuffled. */
export function familyChoices(familyId, familyIds, id) {
  const others = familyIds.filter((family) => family !== familyId);
  const picks = shuffle(others, seedOf(id)).slice(0, 2);
  return shuffle([familyId, ...picks], seedOf(id) + 1);
}

const escapeToken = (token) => String(token).replace(/~/g, "~0").replace(/\//g, "~1");

/** RFC 6901 tokens of a JSON pointer ("" is the whole document). */
export function pointerTokens(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`bad JSON pointer: ${pointer}`);
  return pointer.slice(1).split("/").map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** The value at a JSON pointer, or undefined when the path does not exist. */
export function pointerGet(value, pointer) {
  let node = value;
  for (const token of pointerTokens(pointer)) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, token)) return undefined;
    node = node[token];
  }
  return node;
}

/**
 * The lines of JSON.stringify(value, null, 2), one row each, with the pointer of the key or item
 * that the line opens or holds (null for a closing bracket). Joined with "\n" the rows equal
 * JSON.stringify(value, null, 2).
 */
export function jsonRows(value) {
  const rows = [];
  emit(value, "", 0, "", "", rows);
  return rows;
}

function emit(node, pointer, depth, lead, tail, rows) {
  const pad = "  ".repeat(depth);
  if (node === null || typeof node !== "object") {
    rows.push({ text: `${pad}${lead}${JSON.stringify(node)}${tail}`, pointer });
    return;
  }
  const isArray = Array.isArray(node);
  const entries = isArray ? node.map((item, i) => [String(i), item]) : Object.entries(node);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) {
    rows.push({ text: `${pad}${lead}${open}${close}${tail}`, pointer });
    return;
  }
  rows.push({ text: `${pad}${lead}${open}`, pointer });
  entries.forEach(([key, item], i) => {
    const childLead = isArray ? "" : `${JSON.stringify(key)}: `;
    const childTail = i < entries.length - 1 ? "," : "";
    emit(item, `${pointer}/${escapeToken(key)}`, depth + 1, childLead, childTail, rows);
  });
  rows.push({ text: `${pad}${close}${tail}`, pointer: null });
}

/** The first problem with a card in AUTHORING §10 shape, or null. */
export function cardProblem(card, wireIds, familyIds) {
  if (!card || typeof card.id !== "string") return "a card has no id";
  const id = card.id;
  if (!CARD_TYPES.includes(card.type)) return `${id}: unknown type`;
  if (typeof card.front !== "string" || card.front.trim() === "") return `${id}: no front`;
  if (typeof card.back !== "string" || card.back.trim() === "") return `${id}: no back`;
  if (card.type === "which-wire" && !wireIds.includes(card.wire)) {
    return `${id}: wire is not a course wire`;
  }
  if (card.type === "spot-bug-json") {
    if (!card.json || typeof card.json !== "object") return `${id}: json must be an object or array`;
    if (typeof card.bug_path !== "string") return `${id}: bug_path must be a JSON pointer`;
    if (pointerGet(card.json, card.bug_path) === undefined) return `${id}: bug_path is not in json`;
  }
  if (card.type === "order-turn") {
    const items = card.items;
    const valid = Array.isArray(items) && items.length >= 3
      && items.every((item) => typeof item === "string") && new Set(items).size === items.length;
    if (!valid) return `${id}: items must be three or more different strings`;
  }
  if (card.type === "name-family") {
    const trace = card.trace;
    if (!Array.isArray(trace) || trace.length < 5 || trace.length > 10
      || !trace.every((line) => typeof line === "string")) {
      return `${id}: trace must be 5 to 10 lines`;
    }
    if (!familyIds.includes(card.family)) return `${id}: family is not a course family`;
    if (familyIds.length < 3) return `${id}: the course needs three families to choose from`;
  }
  return null;
}
