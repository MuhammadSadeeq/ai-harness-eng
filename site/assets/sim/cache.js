// The prompt cache's accounting (docs/ENGINE.md, A6.5). Shared by the harness and the labs
// (hx-cacheline), so the rule is never copied.

/**
 * cacheAccount(cacheMap, prefixes, promptTokens, tCall, rules) -> {read, write, uncached, matchedIndex}
 *   cacheMap:     a Map from key to the time it was last written or read. Mutated, as A6.5 says.
 *   prefixes:     [{key, tokens}] in prefix order: prefixes[k-1] is P(k), k = 1..n. The last one
 *                 is the whole request, so its tokens equal promptTokens.
 *   promptTokens: tokens of the request (tokens(P(n))).
 *   tCall:        the harness clock when the reply came back (recovery_check).
 *   rules:        {min_tokens, ttl_ms} from the tape's cache_rules.
 * matchedIndex is i: the largest k whose key is cached within ttl_ms (0 when none, or when the
 * prompt is shorter than min_tokens, in which case nothing is read, written or stored).
 */
export function cacheAccount(cacheMap, prefixes, promptTokens, tCall, rules) {
  const n = prefixes.length;
  if (promptTokens < rules.min_tokens) {
    return { read: 0, write: 0, uncached: promptTokens, matchedIndex: 0 };
  }
  let i = 0;
  for (let k = 1; k <= n; k += 1) {
    const at = cacheMap.get(prefixes[k - 1].key);
    if (at !== undefined && tCall - at < rules.ttl_ms) i = k;
  }
  const read = i > 0 ? prefixes[i - 1].tokens : 0;
  const write = promptTokens - read;
  if (i > 0) cacheMap.set(prefixes[i - 1].key, tCall);
  cacheMap.set(prefixes[n - 1].key, tCall);
  const uncached = promptTokens - read - write;
  return { read, write, uncached, matchedIndex: i };
}
