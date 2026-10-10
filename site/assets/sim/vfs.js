// Virtual workspace (docs/ENGINE.md sections 5, 6.4, 7.7 and amendments A3.6, A3.7).
// Paths are relative to the workspace root. A path that starts with "/", or whose
// normal form starts with "../", is outside the workspace and is looked up in the
// outside files (by normalized form). A symlink is an entry {"link": target}; its
// target is relative to the link's own directory and is followed by reads and writes.

export const MAX_LINK_HOPS = 8;

// Lexical normalization: drops "" and ".", resolves "..". Absolute paths keep a
// leading "/" and never climb above it.
export function normalizePath(p) {
  const abs = p.startsWith("/");
  const stack = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop();
      else if (!abs) stack.push("..");
    } else {
      stack.push(seg);
    }
  }
  const body = stack.join("/");
  if (abs) return "/" + body;
  return body === "" ? "." : body;
}

// True for a normalized path that lies inside the workspace root.
export function isInside(norm) {
  return !norm.startsWith("/") && norm !== ".." && !norm.startsWith("../");
}

function dirOf(norm) {
  const i = norm.lastIndexOf("/");
  return i < 0 ? "" : norm.slice(0, i);
}

export class Vfs {
  constructor(workspace, outside) {
    this.files = new Map();
    for (const map of [workspace, outside]) {
      for (const [p, v] of Object.entries(map)) {
        this.files.set(normalizePath(p), typeof v === "string" ? v : { link: v.link });
      }
    }
  }

  // Follows links for at most MAX_LINK_HOPS hops. ok is false when there are more.
  resolve(p) {
    let cur = normalizePath(p);
    let hops = 0;
    for (;;) {
      const e = this.files.get(cur);
      if (!e || typeof e === "string") return { ok: true, path: cur, hops };
      if (hops === MAX_LINK_HOPS) return { ok: false, path: cur, hops };
      hops += 1;
      const d = dirOf(cur);
      cur = normalizePath(d === "" ? e.link : `${d}/${e.link}`);
    }
  }

  // What a read finds: {kind: "file", text, path, hops}, {kind: "missing", path, hops}
  // or {kind: "links", path} when more than MAX_LINK_HOPS links would be followed.
  lookup(p) {
    const r = this.resolve(p);
    if (!r.ok) return { kind: "links", path: r.path };
    const e = this.files.get(r.path);
    if (typeof e === "string") return { kind: "file", text: e, path: r.path, hops: r.hops };
    return { kind: "missing", path: r.path, hops: r.hops };
  }

  // File text, or null when there is no file (or the links do not resolve).
  read(p) {
    const r = this.lookup(p);
    return r.kind === "file" ? r.text : null;
  }

  // Writes through links. Returns "ok", "links" (too many hops) or "dir" (the root
  // is a directory, not a file; A3.4 is silent on this case, see the report).
  write(p, content) {
    const r = this.resolve(p);
    if (!r.ok) return "links";
    if (r.path === ".") return "dir";
    this.files.set(r.path, content);
    return "ok";
  }

  // Workspace paths inside the root, sorted (links included), for list_files.
  listInside() {
    return [...this.files.keys()].filter(isInside).sort();
  }
}
