// The kata id rule (BP-2.3). A kata id names its folders and files (katas/B2-loop/), so it takes letters (capitals
// too), digits and dashes, and starts with a letter or digit. The same rule as lib/data.js (checkId), which does
// not export it; keep the two in step.
export const KATA_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** Whether an id may name a kata, such as lab-turn-limit or B2-loop. */
export function isKataId(id) {
  return typeof id === "string" && KATA_ID.test(id);
}
