// Token estimate (docs/ENGINE.md section 4): floor(len(pyjson(x)) / 4).
import { pyjson } from "./pyjson.js";

export function tokens(x) {
  return Math.floor(pyjson(x).length / 4);
}
