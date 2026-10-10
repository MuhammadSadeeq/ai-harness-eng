// The run (docs/ENGINE.md section 7.1), with 7.2 to 7.7 and amendments A1 and A2.
// The order of steps, events and PRNG draws follows the pseudocode exactly.
import { createPrng } from "./prng.js";
import { tokens } from "./tokens.js";
import { pyjson } from "./pyjson.js";
import { ScriptedModel, ERROR_MESSAGE } from "./model.js";
import { Vfs, isInside } from "./vfs.js";
import { Tools, toolDefs, checksHold, catPath } from "./tools.js";
import { decide, fieldMatch, egressHost } from "./policy.js";
import { Trace } from "./trace.js";
import { wireRequest, wireResponse } from "./wire.js";
import { resolvePricing } from "./pricing.js";
import { compactionSummary } from "./compaction.js";
import { cacheAccount } from "./cache.js";
import { checkInput } from "./inputs.js";
import { backoffWait } from "./backoff.js";

const TRANSIENT = new Set(["overloaded", "rate_limit", "api_error", "timeout"]);
export const SAFETY_TURN = 60;
const INVALID_REQUEST_MS = 300;
const INTERRUPTED_RESULT = "Interrupted by the user before this ran.";
const SANDBOX_PATH_TOOLS = ["read_file", "write_file", "edit_file"];
const TOOL_OK = { allowed: true, reason: "" };

const textBlock = (text) => ({ type: "text", text });
const user = (blocks) => ({ role: "user", content: blocks });
const toolResult = (id, content, isError) => ({
  type: "tool_result",
  tool_use_id: id,
  content,
  is_error: isError,
});

// A5.3: the buggy harness reads a tool call only from content[0]; no call when that block is not a tool_use.
function firstBlockCalls(reply) {
  const first = reply.content[0];
  return first && first.type === "tool_use" ? [reply.tool_uses[0]] : [];
}

function lastResultError(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content.some((b) => b.type === "tool_result" && b.is_error === true);
    }
  }
  return false;
}

// True when a tool_use has no matching tool_result in the message right after it.
function hasDanglingToolUse(messages) {
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const uses = m.content.filter((b) => b.type === "tool_use");
    if (uses.length === 0) continue;
    // A7.2: the results may be split over consecutive user messages; all of the run counts.
    const got = new Set();
    for (let j = i + 1; j < messages.length && messages[j].role === "user"; j += 1) {
      for (const b of messages[j].content) if (b.type === "tool_result") got.add(b.tool_use_id);
    }
    if (uses.some((u) => !got.has(u.id))) return true;
  }
  return false;
}

// A7.2: two user messages in a row (the results_split condition).
function hasConsecutiveUsers(msgs) {
  for (let i = 0; i + 1 < msgs.length; i += 1) {
    if (msgs[i].role === "user" && msgs[i + 1].role === "user") return true;
  }
  return false;
}

// One trial. tape and board must already be validated (loadTape, loadBoard).
export function runCore(tape, board, seed, facts) {
  if (!Number.isInteger(seed)) throw new TypeError(`seed must be an integer, got ${seed}`);
  const price = resolvePricing(tape.pricing, facts);
  const mods = board.modules;
  if (mods.cache && (!tape.cache_rules || price.cache_write_milli === undefined || price.cache_read_milli === undefined)) {
    throw new Error("cache needs cache_rules and cache prices on the tape (A6.5)");
  }
  const st = { t: 0, turn: 0 };
  const run = `${tape.id}:${board.id}:${seed}`;
  const trace = new Trace(run, mods.redact?.patterns ?? [], st);
  const prng = createPrng(seed);
  const vfs = new Vfs(tape.workspace, tape.outside);
  const tools = new Tools(tape, vfs);
  const defs = toolDefs(tape);
  const model = new ScriptedModel(tape, prng);
  const human = tape.human;
  const system = tape.system +
    (mods.rules_file && tape.rules.length > 0 ? "\n\nProject rules:\n- " + tape.rules.join("\n- ") : "");
  const layers = mods.system_clock ? ["clock", "system"] : ["system"];
  if (mods.rules_file && tape.rules.length > 0) layers.push("rules");
  layers.push("tools", mods.history?.resend === false ? "history (not resent)" : "history");

  const wire = [];
  const messages = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let consecutiveFailures = 0;
  let feedbackCount = 0;
  let asks = 0;
  let lastPermission = null;
  let lastTruncated = false;
  let lastIsFeedback = false;
  const recent = [];
  const cacheMap = new Map();
  // A7.3: the level in force is the board's, else the tape's default, else high. Thinking tokens
  // come from the tape's table for that level (0 when none). They count as output, not as content.
  const effortLevel = mods.effort?.level ?? tape.effort?.default ?? "high";
  const thinking = tape.effort?.thinking_tokens?.[effortLevel] ?? 0;
  const outputConfig = mods.effort ? { effort: mods.effort.level } : null;
  let compactedThisTurn = false;
  // A6.4 and A5.1: the system prompt with the clock on top, and the messages a request sends.
  const systemNow = () => (mods.system_clock ? `Current time: t=${st.t} ms\n\n` : "") + system;
  const sentFor = (msgs) => (mods.history?.resend === false ? [user([textBlock(tape.task)])] : msgs);
  const requestFor = (msgs) => ({ system: systemNow(), tools: defs, messages: sentFor(msgs) });
  // A6.5: the prefixes P(1..n) of a request: keys (canonical JSON) and token counts.
  const cachePrefixes = (curSystem, sentMsgs) => {
    const parts = [{ tools: defs }, { system: curSystem, tools: defs }];
    for (let j = 1; j <= sentMsgs.length; j += 1) parts.push({ system: curSystem, tools: defs, messages: sentMsgs.slice(0, j) });
    return parts.map((obj) => ({ key: pyjson(obj), tokens: tokens(obj) }));
  };
  // A6.5: the one breakpoint, at the end of the request; in the wire payload only.
  const withBreakpoint = (msgs) => {
    const copy = structuredClone(msgs);
    const last = copy[copy.length - 1];
    last.content[last.content.length - 1].cache_control = { type: "ephemeral" };
    return copy;
  };

  const guard = (name, limit, value) => trace.emit("guard", { guard: name, limit, value });

  // A1 and the resume rule: the request cannot be sent. One model_call, 300 ms, a
  // permanent invalid_request, and the run ends "error". No draw and no step.
  const invalidRequest = (promptTokens, message) => {
    trace.emit("model_call", { attempt: 1, tokens_in: promptTokens });
    st.t += INVALID_REQUEST_MS;
    trace.emit("model_error", { type: "invalid_request", attempt: 1, retry_after_ms: 0, message });
    return "error";
  };

  // Simulated human (A2). Every ask counts. Fatigue draws only after `after` asks.
  const answer = (call) => {
    asks += 1;
    if (human.fatigue && asks > human.fatigue.after) {
      if (prng.percent() < human.fatigue.approve_percent) return "approve";
    }
    const pairs = Object.entries(human.deny_if);
    if (pairs.length > 0 && pairs.every(([f, g]) => fieldMatch(call.input, f, g))) return "deny";
    return human.default;
  };

  // A3.8: "too many levels of links: <path>"; "<path> -> <resolved>" when a link was
  // followed to an outside path; "path outside the workspace: <path>" otherwise.
  const checkPath = (raw) => {
    const r = vfs.resolve(raw);
    if (!r.ok) return { allowed: false, reason: `too many levels of links: ${raw}` };
    if (isInside(r.path)) return TOOL_OK;
    if (r.hops > 0) return { allowed: false, reason: `${raw} -> ${r.path}` };
    return { allowed: false, reason: `path outside the workspace: ${raw}` };
  };

  // Sandbox (7.7): paths of file tools and cat, and the host of a network tool's url.
  const sandboxCheck = (call) => {
    if (SANDBOX_PATH_TOOLS.includes(call.name)) return checkPath(typeof call.input.path === "string" ? call.input.path : "");
    if (call.name === "run_command") {
      const p = catPath(call.input.cmd);
      if (p !== null) return checkPath(p);
    }
    const def = tools.custom.get(call.name);
    if (def && def.effect === "network" && typeof call.input.url === "string") {
      const host = egressHost(call.input.url);
      if (mods.sandbox.egress.includes(host)) return TOOL_OK;
      return { allowed: false, reason: `host not in egress: ${host}` };
    }
    return TOOL_OK;
  };

  // Output cap (7.4): keep 2*max_tokens characters at each end.
  const cap = (output) => {
    const oc = mods.output_cap;
    if (!oc) return { shown: output, truncated: false };
    const m = oc.max_tokens;
    if (!(tokens(output) > m && output.length > 4 * m)) return { shown: output, truncated: false };
    const head = output.slice(0, 2 * m);
    const tail = output.slice(output.length - 2 * m);
    const n = output.length - 4 * m;
    const shown = `${head}\n[... ${n} characters cut; ask for a smaller range ...]\n${tail}`;
    return { shown, truncated: true };
  };

  // Backoff (7.3). Jitter draws only when retry is plugged with "full".
  const backoff = (attempt, retry, retryAfter) => backoffWait(attempt, retry, prng, retryAfter);

  // One turn's tool uses (7.1 tool_use branch). Returns nothing; results go to messages.
  const runToolUses = (calls) => {
    const results = [];
    for (const call of calls) {
      const pol = mods.permissions
        ? decide(mods.permissions, call)
        : { decision: "allow", rule: "none", reason: "no permission policy" };
      let humanAnswer = null;
      let final;
      if (pol.decision === "ask") {
        humanAnswer = answer(call);
        final = humanAnswer === "approve" ? "allow" : "deny";
      } else {
        final = pol.decision;
      }
      trace.emit("permission", {
        tool: call.name,
        decision: pol.decision,
        rule: pol.rule,
        reason: pol.reason,
        human: humanAnswer,
        final,
        tool_use_id: call.id,
      });
      lastPermission = final;
      if (final === "deny") {
        results.push(toolResult(call.id, `Denied: ${pol.reason}`, true));
        continue;
      }
      if (mods.sandbox) {
        const chk = sandboxCheck(call);
        trace.emit("sandbox", { tool: call.name, allowed: chk.allowed, reason: chk.reason, tool_use_id: call.id });
        if (!chk.allowed) {
          results.push(toolResult(call.id, `Blocked by the sandbox: ${chk.reason}`, true));
          continue;
        }
      }
      if (mods.validate_inputs) {
        const def = defs.find((d) => d.name === call.name);
        const reason = def ? checkInput(def.input_schema, call.input) : "";
        trace.emit("input_check", { tool: call.name, valid: reason === "", reason, tool_use_id: call.id });
        if (reason !== "") {
          results.push(toolResult(call.id, `Invalid input: ${reason}`, true));
          continue;
        }
      }
      const out = tools.run(call);
      const capped = cap(out.output);
      st.t += tools.latency(call.name);
      trace.emit("tool_call", {
        tool: call.name,
        input: call.input,
        ok: out.ok,
        output: capped.shown,
        output_tokens: tokens(capped.shown),
        truncated: capped.truncated,
        tool_use_id: call.id,
      });
      lastTruncated = capped.truncated;
      recent.push(`${call.name} ${pyjson(call.input)}`);
      results.push(toolResult(call.id, capped.shown, !out.ok));
    }
    if (mods.split_results) {
      for (const r of results) messages.push(user([r]));
    } else {
      messages.push(user(results));
    }
    lastIsFeedback = false;
    trace.flush();
  };

  // The loop (7.1). Returns the status; the caller writes run_end.
  const loop = () => {
    for (;;) {
      // loop wire: guards before a new turn
      if (mods.turn_limit && st.turn >= mods.turn_limit.max_turns) {
        guard("max_turns", mods.turn_limit.max_turns, st.turn);
        return "max_turns";
      }
      if (mods.token_budget) {
        const used = tokensIn + tokensOut;
        if (used >= mods.token_budget.max_tokens) {
          guard("budget", mods.token_budget.max_tokens, used);
          return "budget";
        }
      }
      if (mods.loop_detect) {
        const w = mods.loop_detect.window;
        if (recent.length >= w) {
          const last = recent.slice(-w);
          if (last.every((x) => x === last[0])) {
            guard("loop", w, w);
            return "loop";
          }
        }
      }
      if (st.turn >= SAFETY_TURN) {
        trace.emit("interrupt", { by: "operator", pending: [] });
        return "interrupted";
      }
      st.turn += 1;

      // compaction (A6.3): harness code, no model call. Once per turn, before the control wire.
      compactedThisTurn = false;
      // A8.1: with history resend off the sent request is the task alone, so compaction is inert.
      if (mods.compaction && mods.history?.resend !== false) {
        const comp = mods.compaction;
        const before = tokens(requestFor(messages));
        if (100 * before > comp.threshold_percent * tape.window && messages.length >= 5 &&
            messages[messages.length - 1].role === "user") {
          const summary = compactionSummary(tape.notes, comp.keep, st.turn);
          const dropped = messages.length - 2;
          const tail = messages.slice(-2);
          messages.splice(0, messages.length, user([textBlock(summary.text)]), ...tail);
          const after = tokens(requestFor(messages));
          trace.emit("compaction", { tokens_before: before, tokens_after: after, dropped_messages: dropped, kept_notes: summary.kept });
          compactedThisTurn = true;
        }
      }

      // control wire
      // A5.1: without resend the request carries only the task; the harness keeps the full history.
      const sent = sentFor(messages);
      const curSystem = systemNow();
      const request = { system: curSystem, tools: defs, messages: sent };
      const promptTokens = tokens(request);
      trace.emit("prompt_built", { layers, tokens: promptTokens });

      // context wire
      const over = promptTokens > tape.window;
      trace.emit("context_check", {
        tokens: promptTokens,
        window: tape.window,
        percent: Math.floor((100 * promptTokens) / tape.window),
        action: over ? "overflow" : compactedThisTurn ? "compacted" : "none",
      });
      if (over) {
        return invalidRequest(promptTokens, `prompt is too long: ${promptTokens} tokens > ${tape.window} maximum`);
      }
      // A5 ruling (a): before every call, on the harness's own history (A3.16).
      if (hasDanglingToolUse(messages)) {
        return invalidRequest(promptTokens, "tool_use ids were found without tool_result blocks immediately after");
      }

      // loop and errors wires: the call, with recovery
      const snap = {
        turn: st.turn,
        sent: sent.length,
        request,
        request_tokens: promptTokens,
        window: tape.window,
        last_result_error: lastResultError(messages),
        last_denied: lastPermission === "deny",
        verify_feedback: lastIsFeedback,
        last_truncated: lastTruncated,
        effort: effortLevel,
        results_split: hasConsecutiveUsers(sent),
      };
      let attempt = 0;
      let reply;
      for (;;) {
        attempt += 1;
        trace.emit("model_call", { attempt, tokens_in: promptTokens });
        const outcome = model.call(st.t, snap);
        if (outcome.kind === "error") {
          st.t += outcome.error_ms;
          consecutiveFailures += 1;
          trace.emit("model_error", {
            type: outcome.type,
            attempt,
            retry_after_ms: outcome.retry_after_ms,
            message: ERROR_MESSAGE[outcome.type],
          });
          if (mods.breaker && consecutiveFailures >= mods.breaker.threshold) {
            trace.emit("breaker", { state: "open", failures: consecutiveFailures });
            return "circuit_open";
          }
          if (mods.retry && attempt < mods.retry.max_attempts && TRANSIENT.has(outcome.type)) {
            const wait = backoff(attempt, mods.retry, outcome.retry_after_ms);
            trace.emit("retry_wait", { attempt, wait_ms: wait });
            st.t += wait;
            continue;
          }
          return "error";
        }
        consecutiveFailures = 0;
        reply = outcome;
        break;
      }
      trace.emit("recovery_check", { attempts: attempt, breaker: mods.breaker ? "closed" : "none" });

      // cache (A6.5): consulted for a call that returned a reply, at t_call = st.t here.
      let cacheAcc = null;
      if (mods.cache) {
        cacheAcc = cacheAccount(cacheMap, cachePrefixes(curSystem, sent), promptTokens, st.t, tape.cache_rules);
        const i = cacheAcc.matchedIndex;
        const matched = i === 0 ? "none" : i === 1 ? "tools" : i === 2 ? "system" : `messages[${i - 3}]`;
        trace.emit("cache", {
          read: cacheAcc.read,
          write: cacheAcc.write,
          uncached: cacheAcc.uncached,
          matched,
          hit_percent: Math.floor((100 * cacheAcc.read) / promptTokens),
        });
      }

      const outTokens = tokens(reply.content) + thinking;
      st.t += reply.latency_ms ?? (600 + 20 * outTokens);
      tokensIn += promptTokens;
      tokensOut += outTokens;
      if (cacheAcc) {
        cost += cacheAcc.uncached * price.input_milli + cacheAcc.write * price.cache_write_milli +
          cacheAcc.read * price.cache_read_milli + outTokens * price.output_milli;
      } else {
        cost += promptTokens * price.input_milli + outTokens * price.output_milli;
      }
      const usage = cacheAcc
        ? {
          input_tokens: cacheAcc.uncached,
          cache_creation_input_tokens: cacheAcc.write,
          cache_read_input_tokens: cacheAcc.read,
          output_tokens: outTokens,
        }
        : { input_tokens: promptTokens, output_tokens: outTokens };
      // A7.3: the thinking tokens are reported when the tape has an effort block.
      const usageOut = tape.effort ? { ...usage, output_tokens_details: { thinking_tokens: thinking } } : usage;
      const reqWire = wireRequest(tape.model_id, curSystem, defs, mods.cache ? withBreakpoint(sent) : sent, outputConfig);
      messages.push({ role: "assistant", content: reply.content });
      wire.push(reqWire);
      wire.push(wireResponse(tape.model_id, st.turn, reply.content, reply.stop_reason, usageOut));
      trace.emit("model_reply", {
        stop_reason: reply.stop_reason,
        text: reply.say ?? "",
        tool_uses: reply.tool_uses.map((u) => ({ id: u.id, name: u.name, input: u.input })),
        usage: usageOut,
        cost,
      });

      const calls = mods.first_block_only ? firstBlockCalls(reply) : reply.tool_uses;

      // interrupts (7.6): before any tool runs
      const iv = tape.interrupt;
      // A5 ruling (b): "the reply asked for tools" means the harness read a call (calls is that list).
      if (iv && iv.turn === st.turn && calls.length > 0) {
        const pending = calls.map((u) => u.id);
        trace.emit("interrupt", { by: "human", pending });
        if (mods.close_books) {
          messages.push(user(pending.map((id) => toolResult(id, INTERRUPTED_RESULT, true))));
          lastIsFeedback = false;
        }
        if (!iv.resume) return "interrupted";
        trace.flush();
        continue;
      }

      if (reply.stop_reason === "tool_use" && calls.length > 0) {
        runToolUses(calls);
        continue;
      }
      // end_turn, and tool_use with no call read (A5.3): the end_turn branch, verify gate included
      if (reply.stop_reason === "end_turn" || reply.stop_reason === "tool_use") {
        if (mods.verify_gate) {
          const passed = checksHold(vfs, tape.checks);
          trace.emit("verify", {
            check: "tests",
            passed,
            output: passed ? tape.test_output.pass : tape.test_output.fail,
          });
          if (passed) return "done";
          if (feedbackCount < mods.verify_gate.max_feedback) {
            feedbackCount += 1;
            messages.push(user([textBlock(`Verification failed: ${tape.test_output.fail} Fix it, then say done.`)]));
            lastIsFeedback = true;
            trace.flush();
            continue;
          }
          return "unverified";
        }
        return "done";
      }
      if (reply.stop_reason === "max_tokens") return "max_tokens_reply";
      if (reply.stop_reason === "refusal") return "refused";
      return "error";
    }
  };

  trace.emit("run_start", { task: tape.task, board: board.id, seed, model_id: tape.model_id });
  messages.push(user([textBlock(tape.task)]));
  const status = loop();
  trace.flush();
  const passed = checksHold(vfs, tape.checks);
  const tokensObj = { input: tokensIn, output: tokensOut };
  trace.emit("run_end", { status, passed, turns: st.turn, tokens: tokensObj, cost });
  return {
    events: trace.events,
    wire,
    result: { status, passed, turns: st.turn, tokens: tokensObj, cost },
    branches: model.branches,
  };
}

