// The practice pass line (Path to 5, Fun): "9 of 9 tests pass. Next: <title>", linked to the next figure
// or beat. These are the pure text rules; hx-kata finds the target in the page and uses them.

// The title of a figure caption: "FIG B2.4 · Old board against new board. Try this: …" -> "Old board
// against new board". The label before the middle dot is dropped; the first sentence is the title.
export function captionTitle(caption) {
  const text = String(caption ?? "").trim();
  const dot = text.indexOf("·");
  const body = dot >= 0 ? text.slice(dot + 1).trim() : text;
  const sentence = body.split(/(?<=\.)\s/)[0] ?? "";
  return sentence.replace(/\.$/, "").trim();
}

// The pass line for a count such as "9 of 9 tests pass" and the title of what comes next. Without a
// title there is nothing to point to, and the count stands alone.
export function passLine(count, title) {
  return title ? `${count}. Next: ${title}` : count;
}
