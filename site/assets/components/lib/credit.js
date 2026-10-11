// What a finished component credits (COMPONENTS §5, D-061). Pure, so the node tests run it: hx-incident, hx-cards and
// hx-replay pass what they return to this.evidence(kind, detail, objectives). [] credits nothing; the record is still kept.

/**
 * A hunt (hx-incident) credits the element's objectives only when the family, the wire and the fix are all right.
 * Any other finish credits nothing.
 */
export function incidentCredit(objectives, incident, picks) {
  const right = picks.family === incident.family && picks.wire === incident.wire && picks.fix === incident.correct_fix;
  return right ? [...objectives] : [];
}

/**
 * A card session (hx-cards) credits, once each, the objective of every card answered right. "Again" is not in
 * rightIds, so it credits nothing. A card with no objective credits nothing.
 */
export function cardCredit(rightIds, cardsById) {
  const found = new Set();
  for (const id of rightIds) {
    const objective = cardsById.get(id)?.objective;
    if (objective) found.add(objective);
  }
  return [...found];
}

/** A replay (hx-replay) credits nothing: watching to the end proves nothing (D-061). */
export function replayCredit() {
  return [];
}
