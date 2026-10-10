// Restore of a learner's saved answers (B2 round 2, COMPONENTS §5): pure checks on what the store holds.
// A saved record is used only when it still fits the item it was written for; anything else is ignored.

/** An hx-check answer: {choice, revealed}. choice is an option index; revealed is whether its reveal was credited. */
export function validAnswer(record, optionCount) {
  if (!record || typeof record !== "object") return null;
  if (!Number.isInteger(record.choice) || record.choice < 0 || record.choice >= optionCount) return null;
  if (typeof record.revealed !== "boolean") return null;
  return { choice: record.choice, revealed: record.revealed };
}

/**
 * A finished hx-incident hunt: found is the tapped seq (the first bad event or an accepted one); wrong_taps,
 * seconds >= 0; family_pick and wire_pick are ids in the course; fix_pick an index into the fixes.
 * Returns the record with fix_ok derived from the tape's correct fix, or null.
 */
export function validHunt(record, inc, familyIds, wireIds, fixCount) {
  if (!record || typeof record !== "object") return null;
  if (![inc.first_bad_seq, ...inc.accept_seqs].includes(record.found)) return null;
  if (!Number.isInteger(record.wrong_taps) || record.wrong_taps < 0) return null;
  if (!Number.isInteger(record.seconds) || record.seconds < 0) return null;
  if (!familyIds.includes(record.family_pick)) return null;
  if (!wireIds.includes(record.wire_pick)) return null;
  if (!Number.isInteger(record.fix_pick) || record.fix_pick < 0 || record.fix_pick >= fixCount) return null;
  return {
    found: record.found,
    wrongTaps: record.wrong_taps,
    seconds: record.seconds,
    familyPick: record.family_pick,
    wirePick: record.wire_pick,
    fixPick: record.fix_pick,
    fixOk: record.fix_pick === inc.correct_fix,
  };
}
