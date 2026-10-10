// Globs and permission decisions (docs/ENGINE.md section 7.5), and the
// simulated human's field match (amendment A2).
import { pyjson } from "./pyjson.js";

const ESCAPE = /[\\^$.*+?()[\]{}|\/-]/;

// `**` = any characters, `*` = any characters except "/", `?` = one character,
// everything else literal. The pattern is anchored at both ends.
export function globToRegExp(glob) {
  let re = "^";
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith("**", i)) {
      re += "[\\s\\S]*";
      i += 2;
    } else if (glob[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else if (glob[i] === "?") {
      re += "[\\s\\S]";
      i += 1;
    } else {
      re += ESCAPE.test(glob[i]) ? "\\" + glob[i] : glob[i];
      i += 1;
    }
  }
  return new RegExp(re + "$");
}

export function globMatch(glob, s) {
  return globToRegExp(glob).test(s);
}

// True when input has the field and its string form matches the glob. A non-string
// field value is matched by its canonical JSON (pyjson).
export function fieldMatch(input, field, glob) {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return false;
  const v = input[field];
  return globMatch(glob, typeof v === "string" ? v : pyjson(v));
}

export function ruleMatches(rule, call) {
  if (rule.tool !== "*" && rule.tool !== call.name) return false;
  return Object.entries(rule.match).every(([field, glob]) => fieldMatch(call.input, field, glob));
}

// Decision order: all deny rules, then ask, then allow; first match wins;
// otherwise the mode's default (rule "default").
export function decide(permissions, call) {
  const { rules, mode } = permissions;
  for (const want of ["deny", "ask", "allow"]) {
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      if (r.decision === want && ruleMatches(r, call)) {
        return { decision: want, rule: `rules[${i}]`, reason: r.reason };
      }
    }
  }
  return { decision: mode, rule: "default", reason: `no rule matched (mode ${mode})` };
}

// The egress host of a url (A3.8): the text after the first "://" up to the first
// "/", "?" or "#"; everything through the last "@" dropped; a trailing ":<digits>"
// dropped; lowercased. A url with no "://" gives "".
export function egressHost(url) {
  const i = url.indexOf("://");
  if (i < 0) return "";
  const rest = url.slice(i + 3);
  const end = rest.search(/[/?#]/);
  let host = end < 0 ? rest : rest.slice(0, end);
  const at = host.lastIndexOf("@");
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/:\d+$/, "");
  return host.toLowerCase();
}
