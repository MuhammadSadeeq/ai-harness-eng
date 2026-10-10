// Pricing (docs/ENGINE.md sections 5 and 8). A fact value in USD per MTok p
// becomes round(p * 1000) milli-units. The tape may also give integers inline.

function milliFromUsd(p, where) {
  if (typeof p !== "number" || !Number.isFinite(p)) throw new Error(`pricing: ${where} is not a number`);
  return Math.floor(p * 1000 + 0.5);
}

export function resolvePricing(spec, facts) {
  if (!spec || typeof spec !== "object") throw new Error("pricing: missing");
  if ("fact" in spec) {
    const id = spec.fact;
    if (!facts || !Object.prototype.hasOwnProperty.call(facts, id)) {
      throw new Error(`pricing: unknown fact "${id}"`);
    }
    const v = facts[id].value ?? {};
    const out = {
      input_milli: milliFromUsd(v.input_usd_per_mtok, `${id}.input_usd_per_mtok`),
      output_milli: milliFromUsd(v.output_usd_per_mtok, `${id}.output_usd_per_mtok`),
    };
    // A6.5: cache prices are optional here; the run refuses a cache module without them.
    if (v.cache_write_usd_per_mtok !== undefined) {
      out.cache_write_milli = milliFromUsd(v.cache_write_usd_per_mtok, `${id}.cache_write_usd_per_mtok`);
    }
    if (v.cache_hit_usd_per_mtok !== undefined) {
      out.cache_read_milli = milliFromUsd(v.cache_hit_usd_per_mtok, `${id}.cache_hit_usd_per_mtok`);
    }
    return out;
  }
  const inp = spec.input_milli_per_mtok;
  const out = spec.output_milli_per_mtok;
  if (!Number.isInteger(inp) || !Number.isInteger(out)) {
    throw new Error("pricing: inline prices must be integers (input_milli_per_mtok, output_milli_per_mtok)");
  }
  const price = { input_milli: inp, output_milli: out };
  for (const [key, field] of [["cache_write_milli_per_mtok", "cache_write_milli"], ["cache_read_milli_per_mtok", "cache_read_milli"]]) {
    if (spec[key] === undefined) continue;
    if (!Number.isInteger(spec[key])) throw new Error(`pricing: ${key} must be an integer`);
    price[field] = spec[key];
  }
  return price;
}
