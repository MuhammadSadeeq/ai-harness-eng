// The compactor's summary (docs/ENGINE.md, A6.3). Shared by the harness and the labs (hx-desk),
// so the summary text is never copied.

/**
 * compactionSummary(notes, keep, turn) -> {text, kept, dropped}
 *   notes: the tape's notes [{id, kind, turn, text}] in tape order.
 *   keep:  the kinds the compactor keeps (the board's compaction.keep).
 *   turn:  the current turn (after turn += 1). A note is known when its turn is before it.
 * kept:    ids of the known notes whose kind is in keep, in tape order.
 * dropped: ids of the known notes that the summary leaves out (kind not in keep).
 * text:    "Summary of the work so far:" then one "\n- kind: text" line per kept note,
 *          or "\n- (nothing kept)" when none is kept.
 */
export function compactionSummary(notes, keep, turn) {
  const known = notes.filter((n) => n.turn < turn);
  const kept = known.filter((n) => keep.includes(n.kind));
  const dropped = known.filter((n) => !keep.includes(n.kind));
  const lines = kept.map((n) => `\n- ${n.kind}: ${n.text}`).join("");
  return {
    text: "Summary of the work so far:" + (kept.length > 0 ? lines : "\n- (nothing kept)"),
    kept: kept.map((n) => n.id),
    dropped: dropped.map((n) => n.id),
  };
}
