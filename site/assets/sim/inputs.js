// Input checks (docs/ENGINE.md, A7.1): the course's subset of JSON Schema, first failure wins.
// Used by the harness when validate_inputs is plugged; a call with no definition is not checked.
import { pyjson } from "./pyjson.js";

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The six declared types. number accepts integers; a JSON boolean is never an integer.
const TYPE_OK = {
  string: (v) => typeof v === "string",
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => isObject(v),
};

/**
 * checkInput(schema, input) -> reason ("" when valid).
 * Order: input is an object; each name in `required` (schema order); then each input field in
 * input order: unknown (additionalProperties false), declared type, enum (compared by pyjson).
 */
export function checkInput(schema, input) {
  if (!isObject(input)) return "input must be an object";
  const props = isObject(schema.properties) ? schema.properties : {};
  for (const name of schema.required ?? []) {
    if (!hasOwn(input, name)) return `missing required field: ${name}`;
  }
  for (const name of Object.keys(input)) {
    const value = input[name];
    if (schema.additionalProperties === false && !hasOwn(props, name)) return `unknown field: ${name}`;
    const def = hasOwn(props, name) && isObject(props[name]) ? props[name] : {};
    if (typeof def.type === "string" && hasOwn(TYPE_OK, def.type) && !TYPE_OK[def.type](value)) {
      return `field ${name} must be ${def.type}`;
    }
    if (Array.isArray(def.enum) && !def.enum.some((e) => pyjson(e) === pyjson(value))) {
      return `field ${name} must be one of: ${def.enum.map((e) => pyjson(e)).join(", ")}`;
    }
  }
  return "";
}
