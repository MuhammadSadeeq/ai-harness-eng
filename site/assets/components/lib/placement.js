// The pure parts of hx-placement (BP-3.1b §1): the tally of a run, the suggested start and the modules a learner
// may skip. No DOM, no store. A suggestion only; nothing here locks or hides a module.

/** One row per course part, in question order: right answers and questions asked. answers: id -> option index or "dk". */
export function tally(questions, answers) {
  const rows = new Map();
  for (const q of questions) {
    const row = rows.get(q.part) ?? { part: q.part, right: 0, of: 0 };
    row.of += 1;
    const pick = answers[q.id];
    if (Number.isInteger(pick) && q.options[pick]?.right === true) row.right += 1;
    rows.set(q.part, row);
  }
  return [...rows.values()];
}

/** The first rule whose part has fewer than skip_if_right right decides the start; every rule passed: the last rule's start. */
export function suggestStart(content, results) {
  const rules = content.rules ?? [];
  if (rules.length === 0) return content.start;
  const right = new Map(results.map((r) => [r.part, r.right]));
  const failing = rules.find((rule) => (right.get(rule.part) ?? 0) < rule.skip_if_right);
  return (failing ?? rules[rules.length - 1]).start;
}

/** The modules on the course path before the start whose part a rule passed: the learner may skip them. */
export function skippable(course, content, results, start) {
  const path = course.path ?? [];
  const at = path.indexOf(start);
  if (at < 0) return [];
  const right = new Map(results.map((r) => [r.part, r.right]));
  const passed = new Set((content.rules ?? []).filter((rule) => (right.get(rule.part) ?? 0) >= rule.skip_if_right).map((rule) => rule.part));
  const partOf = new Map((course.modules ?? []).map((m) => [m.id, m.part]));
  return path.slice(0, at).filter((id) => passed.has(partOf.get(id)));
}
