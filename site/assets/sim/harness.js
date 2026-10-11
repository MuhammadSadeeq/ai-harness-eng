// The run (docs/ENGINE.md section 7.1), with 7.2 to 7.7, amendments A1 and A2, and A14 (sub-agents,
// sessions, crash and resume, side effects, model profiles) with the rulings of A15.
// The order of steps, events and PRNG draws follows the pseudocode exactly.
import { createPrng } from "./prng.js";
import { tokens } from "./tokens.js";
import { pyjson } from "./pyjson.js";
import { ScriptedModel, ERROR_MESSAGE, stringsIn } from "./model.js";
import { Vfs, isInside } from "./vfs.js";
import {
  Tools, toolDefs, applyOverrides, checksHold, testsHold, catPath, searchMatches, TOOL_SEARCH_DEF, TOOL_SEARCH_MAX,
  RUN_AGENT_DEF, RUN_AGENT_MS, rejectedTools,
} from "./tools.js";
import { decidePermission, egressHost } from "./policy.js";
import { createHuman } from "./human.js";
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
const TOOL_SEARCH_MS = 100;
// A14.4: what a ledger tool returns when its reply is lost.
const TIMED_OUT = "Timed out waiting for the reply; the action may have happened.";
// A15.1 as overruled by A16.1: the board modules that apply inside a sub-agent. Its own turn limit replaces
// turn_limit there. tool_pins, model, request_params and capability_check apply inside too.
const SUB_MODULES = [
  "permissions", "sandbox", "validate_inputs", "tool_overrides", "output_cap", "retry", "breaker", "effort",
  "redact", "cost_attribution", "tool_retry", "idempotency", "tool_pins", "model", "request_params",
  "capability_check",
];
// A14.2: a session that ends one of these hands over to the next; any other end status ends the run.
const HANDOVER = new Set(["done", "max_turns", "unverified"]);

const textBlock = (text) => ({ type: "text", text });
const user = (blocks) => ({ role: "user", content: blocks });
const toolResult = (id, content, isError) => ({
  type: "tool_result",
  tool_use_id: id,
  content,
  is_error: isError,
});

// A11.1: the last user message of the history has a tool_result whose content contains the text.
function lastResultContains(messages, text) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content.some((b) => b.type === "tool_result" && typeof b.content === "string" && b.content.includes(text));
    }
  }
  return false;
}

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

// A9.4: the largest part of a request by tokens, as [name, tokens]; ties go to the earliest part.
function largestPart(system, tools, messages) {
  const parts = [["system", tokens(system)], ["tools", tokens(tools)]];
  messages.forEach((m, k) => parts.push([`messages[${k}]`, tokens(m)]));
  return parts.reduce((best, p) => (p[1] > best[1] ? p : best));
}

// A14.1 (forked): the parent's sent messages up to the user message before the reply that holds the call,
// with the brief appended to that user message (one user message, never two in a row).
function forkedMessages(sentAtCall, brief) {
  const copy = structuredClone(sentAtCall);
  copy[copy.length - 1].content.push(textBlock(brief));
  return copy;
}

// One trial. tape and board must already be validated (loadTape, loadBoard).
export function runCore(tape, board, seed, facts) {
  if (!Number.isInteger(seed)) throw new TypeError(`seed must be an integer, got ${seed}`);
  const mods = board.modules;
  // A14.5: the model module selects a profile; its pricing, rejects and script apply (the tape's otherwise).
  const profile = mods.model ? tape.models[mods.model.id] : undefined;
  const modelId = mods.model ? mods.model.id : tape.model_id;
  const price = resolvePricing(profile ? profile.pricing : tape.pricing, facts);
  if (mods.cache && (!tape.cache_rules || price.cache_write_milli === undefined || price.cache_read_milli === undefined)) {
    throw new Error("cache needs cache_rules and cache prices on the tape (A6.5)");
  }
  const st = { t: 0, turn: 0 };
  const run = `${tape.id}:${board.id}:${seed}`;
  const trace = new Trace(run, mods.redact?.patterns ?? [], st);
  const prng = createPrng(seed);
  const vfs = new Vfs(tape.workspace, tape.outside);
  const simHuman = createHuman(tape.human, prng);
  // A11.5: tool_pins rejects some custom tools for the main agent. A rejected tool is never sent and runs as an unknown tool.
  // A15.1: tool_pins is not a sub-agent module, so sub-agents keep every tool.
  const rejects = rejectedTools(tape.custom_tools, mods.tool_pins?.pins);
  const rejectedNames = new Set(rejects.map((r) => r.tool));
  const tools = new Tools(tape, vfs, rejectedNames);
  // A9.1: every tool definition, with the board's overrides. A12.1: a rejected tool has no definition to send or check.
  const allDefs = applyOverrides(toolDefs(tape), mods.tool_overrides).filter((d) => !rejectedNames.has(d.name));
  const subMods = {};
  for (const name of SUB_MODULES) if (mods[name] !== undefined) subMods[name] = mods[name];
  const alwaysTools = new Set(mods.tool_search?.always ?? []);
  const hasRunAgent = mods.subagents !== undefined;
  // A14.5: request_params go with every request. With capability_check the rejected ones are dropped and listed;
  // without it, the first rejected one fails the call (permanent).
  const reqParams = mods.request_params ?? {};
  const rejectList = profile?.rejects ?? [];
  const dropped = mods.capability_check ? Object.keys(reqParams).filter((n) => rejectList.includes(n)) : [];
  const sentParams = {};
  for (const [n, v] of Object.entries(reqParams)) if (!dropped.includes(n)) sentParams[n] = v;
  const rejectedParam = mods.capability_check ? undefined : Object.keys(reqParams).find((n) => rejectList.includes(n));

  // Run-level totals: every agent's calls count (A14.2: token_budget spans the run).
  const totals = { cost: 0, tokensIn: 0, tokensOut: 0 };
  const applied = new Map(); // A15.7: real applications per custom tool, counted across the run
  const keyStore = new Map(); // A14.4: idempotency keys per tool: key -> the first application's output
  const branches = [];
  const wire = [];
  let started = 0; // sub-agents started in the run (A14.1)
  let crashed = false;

  const newAgent = (cfg) => ({
    isSub: cfg.isSub,
    label: cfg.label,
    mods: cfg.mods,
    toolsInst: cfg.toolsInst,
    defs: cfg.defs,
    rejected: cfg.rejected,
    modelId: cfg.modelId,
    price: cfg.price,
    system: cfg.system,
    layers: cfg.layers,
    script: cfg.script,
    scriptBase: cfg.scriptBase ?? "/script",
    maxTurns: cfg.maxTurns,
    params: cfg.params ?? {},
    rejectedParam: cfg.rejectedParam,
    idTag: cfg.idTag ?? "",
    session: 1,
    model: null,
    messages: [],
    curDefs: cfg.defs,
    turnStart: 0,
    loaded: new Set(),
    consecutiveFailures: 0,
    feedbackCount: 0,
    lastPermission: null,
    lastTruncated: false,
    lastIsFeedback: false,
    recent: [],
    cacheMap: new Map(),
    compactedThisTurn: false,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    lastText: "",
  });
  const newModel = (ag) => new ScriptedModel({ script: ag.script, faults: tape.faults, outage: tape.outage }, prng, ag.scriptBase);
  const retireModel = (ag) => {
    if (ag.model) branches.push(...ag.model.branches);
    ag.model = null;
  };

  // The loop of one agent (7.1). Every closure reads the agent's own state through ag.
  const agentLoop = (ag) => {
    const m = ag.mods;
    // A8.1 and A5.1: with resend off the request carries the task alone.
    const sentFor = (msgs) => (m.history?.resend === false ? [user([textBlock(tape.task)])] : msgs);
    const systemNow = () => (m.system_clock ? `Current time: t=${st.t} ms\n\n` : "") + ag.system;
    // A9.2 and A14.1: the request's tools for this turn. The main agent adds tool_search, then run_agent (A15.10).
    const requestDefs = () => {
      if (ag.isSub) return ag.defs;
      const base = m.tool_search
        ? [
          ...ag.defs.filter((d) => alwaysTools.has(d.name)),
          ...ag.defs.filter((d) => !alwaysTools.has(d.name) && ag.loaded.has(d.name)),
          TOOL_SEARCH_DEF,
        ]
        : ag.defs;
      return hasRunAgent ? [...base, RUN_AGENT_DEF] : base;
    };
    const requestFor = (msgs) => ({ system: systemNow(), tools: ag.curDefs, messages: sentFor(msgs) });
    // A6.5: the prefixes P(1..n) of a request: keys (canonical JSON) and token counts.
    const cachePrefixes = (curSystem, sentMsgs) => {
      const parts = [{ tools: ag.curDefs }, { system: curSystem, tools: ag.curDefs }];
      for (let j = 1; j <= sentMsgs.length; j += 1) parts.push({ system: curSystem, tools: ag.curDefs, messages: sentMsgs.slice(0, j) });
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

    // A1 and the resume rule: the request cannot be sent. One model_call, 300 ms, a permanent invalid_request,
    // and the run ends "error". No draw and no step.
    const invalidRequest = (promptTokens, message) => {
      trace.emit("model_call", { attempt: 1, tokens_in: promptTokens });
      st.t += INVALID_REQUEST_MS;
      trace.emit("model_error", { type: "invalid_request", attempt: 1, retry_after_ms: 0, message });
      return "error";
    };

    // A3.8 and A13.1: "too many levels of links: <path>"; "path outside the workspace: <path>", where <path>
    // reads "<path> -> <resolved>" when a link was followed to an outside path.
    const checkPath = (raw) => {
      const r = vfs.resolve(raw);
      if (!r.ok) return { allowed: false, reason: `too many levels of links: ${raw}` };
      if (isInside(r.path)) return TOOL_OK;
      if (r.hops > 0) return { allowed: false, reason: `path outside the workspace: ${raw} -> ${r.path}` };
      return { allowed: false, reason: `path outside the workspace: ${raw}` };
    };

    // Sandbox (7.7): paths of file tools and cat, and the host of a network tool's url.
    const sandboxCheck = (call) => {
      if (SANDBOX_PATH_TOOLS.includes(call.name)) return checkPath(typeof call.input.path === "string" ? call.input.path : "");
      if (call.name === "run_command") {
        const p = catPath(call.input.cmd);
        if (p !== null) return checkPath(p);
      }
      // A12.1: a rejected tool is an unknown tool; the harness no longer knows its effect, so no egress check.
      const def = ag.rejected.has(call.name) ? undefined : ag.toolsInst.custom.get(call.name);
      if (def && def.effect === "network" && typeof call.input.url === "string") {
        const host = egressHost(call.input.url);
        if (m.sandbox.egress.includes(host)) return TOOL_OK;
        return { allowed: false, reason: `host not in egress: ${host}` };
      }
      return TOOL_OK;
    };

    // Output cap (7.4): keep 2*max_tokens characters at each end.
    const cap = (output) => {
      const oc = m.output_cap;
      if (!oc) return { shown: output, truncated: false };
      const lim = oc.max_tokens;
      if (!(tokens(output) > lim && output.length > 4 * lim)) return { shown: output, truncated: false };
      const head = output.slice(0, 2 * lim);
      const tail = output.slice(output.length - 2 * lim);
      const n = output.length - 4 * lim;
      const shown = `${head}\n[... ${n} characters cut; ask for a smaller range ...]\n${tail}`;
      return { shown, truncated: true };
    };

    // A9.2 and A10.5: a tool_search call loads the matching tools not yet sent (at most five), in A3.1 order.
    const searchOut = (query) => {
      const q = typeof query === "string" ? query : "";
      const sentNow = (name) => alwaysTools.has(name) || ag.loaded.has(name);
      const hits = searchMatches(q, allDefs.filter((d) => !sentNow(d.name))).slice(0, TOOL_SEARCH_MAX);
      if (hits.length > 0) {
        for (const d of hits) ag.loaded.add(d.name);
        return { ok: true, output: `Loaded: ${hits.map((d) => d.name).join(", ")}` };
      }
      const sentHits = searchMatches(q, allDefs.filter((d) => sentNow(d.name)));
      if (sentHits.length > 0) return { ok: true, output: `Already loaded: ${sentHits.map((d) => d.name).join(", ")}` };
      return { ok: false, output: `No tool matched: ${q}` };
    };

    // A14.4: a ledger line is appended to a workspace file; the file is created on the first append.
    const appendLine = (path, line) => {
      const r = vfs.lookup(path);
      if (r.kind === "links") return;
      vfs.write(path, (r.kind === "file" ? r.text : "") + line);
    };
    // One application of a tool. A ledger tool's real applications are counted for lose_reply; with
    // idempotency a repeated key returns the first application's output, with ok true and no new line (A15.8).
    const applyTool = (call) => {
      const def = ag.rejected.has(call.name) ? undefined : ag.toolsInst.custom.get(call.name);
      if (!def || def.ledger === null) return ag.toolsInst.run(call);
      const keys = keyStore.get(def.name) ?? new Map();
      keyStore.set(def.name, keys);
      if (m.idempotency && keys.has(call.id)) return { ok: true, output: keys.get(call.id) };
      const n = (applied.get(def.name) ?? 0) + 1;
      applied.set(def.name, n);
      const out = ag.toolsInst.run(call);
      appendLine(def.ledger, `${pyjson(call.input)}\n`);
      if (m.idempotency) keys.set(call.id, out.output);
      if (def.lose_reply.includes(n)) return { ok: false, output: TIMED_OUT };
      return out;
    };

    const emitToolCall = (call, out, capped, attempt) => trace.emit("tool_call", {
      tool: call.name,
      input: call.input,
      ok: out.ok,
      output: capped.shown,
      output_tokens: tokens(capped.shown),
      truncated: capped.truncated,
      tool_use_id: call.id,
      ...(m.tool_retry ? { attempt } : {}),
    });

    // After a call's final result: the truncation flag, the loop window, the leak check, the result block.
    const finish = (call, out, capped, results) => {
      ag.lastTruncated = capped.truncated;
      ag.recent.push(`${call.name} ${pyjson(call.input)}`);
      // A11.3: a network custom tool that ran (not rejected) and got a canary in its input leaks it.
      const netTool = ag.toolsInst.custom.get(call.name);
      if (netTool && netTool.effect === "network" && !ag.rejected.has(call.name)) {
        const found = tape.canaries.filter((c) => stringsIn(call.input).some((x) => x.includes(c)));
        if (found.length > 0) trace.emit("leak", { tool: call.name, canaries: found, tool_use_id: call.id });
      }
      results.push(toolResult(call.id, capped.shown, !out.ok));
    };

    // One turn's tool uses (7.1 tool_use branch). Results go to the agent's messages.
    const runToolUses = (calls, sentAtCall) => {
      const results = [];
      for (const call of calls) {
        const pol = decidePermission(call, m.permissions);
        let humanAnswer = null;
        let final;
        if (pol.decision === "ask") {
          humanAnswer = simHuman.ask(call);
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
        ag.lastPermission = final;
        if (final === "deny") {
          results.push(toolResult(call.id, `Denied: ${pol.reason}`, true));
          continue;
        }
        if (m.sandbox) {
          const chk = sandboxCheck(call);
          trace.emit("sandbox", { tool: call.name, allowed: chk.allowed, reason: chk.reason, tool_use_id: call.id });
          if (!chk.allowed) {
            results.push(toolResult(call.id, `Blocked by the sandbox: ${chk.reason}`, true));
            continue;
          }
        }
        if (m.validate_inputs) {
          // A9.2: the harness's own tools are checked against their own definitions.
          const def = call.name === "tool_search" && m.tool_search
            ? TOOL_SEARCH_DEF
            : call.name === "run_agent" && hasRunAgent && !ag.isSub
              ? RUN_AGENT_DEF
              : ag.defs.find((d) => d.name === call.name);
          const reason = def ? checkInput(def.input_schema, call.input) : "";
          trace.emit("input_check", { tool: call.name, valid: reason === "", reason, tool_use_id: call.id });
          if (reason !== "") {
            results.push(toolResult(call.id, `Invalid input: ${reason}`, true));
            continue;
          }
        }
        // A14.1: run_agent. Its own latency is paid in runAgentCall; its result is one tool_call, after the sub-agent.
        if (call.name === "run_agent" && hasRunAgent && !ag.isSub) {
          const out = runAgentCall(call, sentAtCall);
          const capped = cap(out.output);
          emitToolCall(call, out, capped, 1);
          finish(call, out, capped, results);
          continue;
        }
        const searching = m.tool_search !== undefined && call.name === "tool_search";
        let attempt = 1;
        let out = searching ? searchOut(call.input.query) : applyTool(call);
        let capped = cap(out.output);
        st.t += searching ? TOOL_SEARCH_MS : ag.toolsInst.latency(call.name);
        emitToolCall(call, out, capped, attempt);
        // A14.4 and A15.8: tool_retry repeats only the tool's run, at once, for a result starting "Timed out".
        while (m.tool_retry && out.output.startsWith("Timed out") && attempt < m.tool_retry.max_attempts) {
          attempt += 1;
          out = applyTool(call);
          capped = cap(out.output);
          st.t += ag.toolsInst.latency(call.name);
          emitToolCall(call, out, capped, attempt);
        }
        finish(call, out, capped, results);
      }
      if (m.split_results) {
        for (const r of results) ag.messages.push(user([r]));
      } else {
        ag.messages.push(user(results));
      }
      ag.lastIsFeedback = false;
      trace.flush();
    };

    // The loop (7.1). Returns the status; the caller writes run_end.
    const loop = () => {
      for (;;) {
        // loop wire: guards before a new turn. A15.5: turn_limit counts the turns of the current session.
        const limit = ag.isSub ? ag.maxTurns : m.turn_limit?.max_turns;
        if (limit !== undefined && st.turn - ag.turnStart >= limit) {
          guard("max_turns", limit, st.turn - ag.turnStart);
          return "max_turns";
        }
        if (m.token_budget) {
          const used = totals.tokensIn + totals.tokensOut;
          if (used >= m.token_budget.max_tokens) {
            guard("budget", m.token_budget.max_tokens, used);
            return "budget";
          }
        }
        if (m.loop_detect) {
          const w = m.loop_detect.window;
          if (ag.recent.length >= w) {
            const last = ag.recent.slice(-w);
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
        // A14.3 and A15.6: the crash fires once, after turn n's results are recorded and before the next model call.
        if (!ag.isSub && tape.crash && !crashed && st.turn === tape.crash.turn) {
          crashed = true;
          trace.emit("crash", { turn: st.turn });
          if (mods.durable_session) {
            // The harness rebuilds the history from its own log, which is the messages it already holds.
            trace.emit("resume", { from_turn: st.turn + 1 });
          } else {
            // The run starts over: the history is the task alone, the script cursor is back at the start.
            retireModel(ag);
            ag.messages = [user([textBlock(tape.task)])];
            ag.model = newModel(ag);
          }
        }
        st.turn += 1;
        // A9.2: the request's tools for this turn, from what the model has loaded so far.
        ag.curDefs = requestDefs();

        // compaction (A6.3): harness code, no model call. Once per turn, before the control wire.
        ag.compactedThisTurn = false;
        // A8.1: with history resend off the sent request is the task alone, so compaction is inert.
        if (m.compaction && m.history?.resend !== false) {
          const comp = m.compaction;
          const before = tokens(requestFor(ag.messages));
          if (100 * before > comp.threshold_percent * tape.window && ag.messages.length >= 5 &&
              ag.messages[ag.messages.length - 1].role === "user") {
            const summary = compactionSummary(tape.notes, comp.keep, st.turn);
            const dropped = ag.messages.length - 2;
            const tail = ag.messages.slice(-2);
            ag.messages.splice(0, ag.messages.length, user([textBlock(summary.text)]), ...tail);
            const after = tokens(requestFor(ag.messages));
            trace.emit("compaction", { tokens_before: before, tokens_after: after, dropped_messages: dropped, kept_notes: summary.kept });
            ag.compactedThisTurn = true;
          }
        }

        // control wire
        // A5.1: without resend the request carries only the task; the harness keeps the full history.
        const sent = sentFor(ag.messages);
        const sentAtCall = sent.slice();
        const curSystem = systemNow();
        const request = { system: curSystem, tools: ag.curDefs, messages: sent };
        // A16.2: request params are on the wire only; the prompt is counted from system, tools and messages.
        const promptTokens = tokens(request);
        trace.emit("prompt_built", { layers: ag.layers, tokens: promptTokens });

        // context wire
        const over = promptTokens > tape.window;
        trace.emit("context_check", {
          tokens: promptTokens,
          window: tape.window,
          percent: Math.floor((100 * promptTokens) / tape.window),
          action: over ? "overflow" : ag.compactedThisTurn ? "compacted" : "none",
        });
        if (over) {
          return invalidRequest(promptTokens, `prompt is too long: ${promptTokens} tokens > ${tape.window} maximum`);
        }
        // A5 ruling (a): before every call, on the harness's own history (A3.16).
        if (hasDanglingToolUse(ag.messages)) {
          return invalidRequest(promptTokens, "tool_use ids were found without tool_result blocks immediately after");
        }
        // A14.5: a rejected request parameter fails the call, permanently.
        if (ag.rejectedParam !== undefined) {
          return invalidRequest(promptTokens, `${ag.rejectedParam}: this parameter is not supported on ${ag.modelId}`);
        }

        // loop and errors wires: the call, with recovery
        const snap = {
          turn: st.turn,
          id_tag: ag.idTag,
          session: ag.session,
          sent: sent.length,
          request,
          request_tokens: promptTokens,
          window: tape.window,
          last_result_error: lastResultError(ag.messages),
          last_denied: ag.lastPermission === "deny",
          verify_feedback: ag.lastIsFeedback,
          last_truncated: ag.lastTruncated,
          effort: effortLevel,
          results_split: hasConsecutiveUsers(sent),
          last_result_contains: (text) => lastResultContains(ag.messages, text),
        };
        let attempt = 0;
        let reply;
        for (;;) {
          attempt += 1;
          trace.emit("model_call", { attempt, tokens_in: promptTokens });
          const outcome = ag.model.call(st.t, snap);
          if (outcome.kind === "error") {
            st.t += outcome.error_ms;
            ag.consecutiveFailures += 1;
            trace.emit("model_error", {
              type: outcome.type,
              attempt,
              retry_after_ms: outcome.retry_after_ms,
              message: ERROR_MESSAGE[outcome.type],
            });
            if (m.breaker && ag.consecutiveFailures >= m.breaker.threshold) {
              trace.emit("breaker", { state: "open", failures: ag.consecutiveFailures });
              return "circuit_open";
            }
            if (m.retry && attempt < m.retry.max_attempts && TRANSIENT.has(outcome.type)) {
              const wait = backoffWait(attempt, m.retry, prng, outcome.retry_after_ms);
              trace.emit("retry_wait", { attempt, wait_ms: wait });
              st.t += wait;
              continue;
            }
            return "error";
          }
          ag.consecutiveFailures = 0;
          reply = outcome;
          break;
        }
        trace.emit("recovery_check", { attempts: attempt, breaker: m.breaker ? "closed" : "none" });

        // cache (A6.5): consulted for a call that returned a reply, at t_call = st.t here.
        let cacheAcc = null;
        if (m.cache) {
          cacheAcc = cacheAccount(ag.cacheMap, cachePrefixes(curSystem, sent), promptTokens, st.t, tape.cache_rules);
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
        totals.tokensIn += promptTokens;
        totals.tokensOut += outTokens;
        ag.tokensIn += promptTokens;
        ag.tokensOut += outTokens;
        // A9.4: this call's cost in parts (nano-units): input (uncached), output, and the cache read and write.
        const inputCost = cacheAcc ? cacheAcc.uncached * ag.price.input_milli : promptTokens * ag.price.input_milli;
        const outputCost = outTokens * ag.price.output_milli;
        const cacheCost = cacheAcc
          ? cacheAcc.write * ag.price.cache_write_milli + cacheAcc.read * ag.price.cache_read_milli
          : 0;
        const callCost = inputCost + outputCost + cacheCost;
        totals.cost += callCost;
        ag.cost += callCost;
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
        const reqWire = wireRequest(ag.modelId, curSystem, ag.curDefs, m.cache ? withBreakpoint(sent) : sent, outputConfig, ag.params);
        // A9.4: the largest part of the request as it was sent, measured before the reply joins the history.
        const topPart = m.cost_attribution ? largestPart(curSystem, ag.curDefs, sentAtCall) : null;
        ag.messages.push({ role: "assistant", content: reply.content });
        ag.lastText = reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        wire.push(reqWire);
        wire.push(wireResponse(ag.modelId, st.turn, reply.content, reply.stop_reason, usageOut, ag.idTag));
        trace.emit("model_reply", {
          stop_reason: reply.stop_reason,
          text: reply.say ?? "",
          tool_uses: reply.tool_uses.map((u) => ({ id: u.id, name: u.name, input: u.input })),
          usage: usageOut,
          cost: totals.cost,
        });

        if (m.cost_attribution) {
          trace.emit("cost", {
            call_cost: callCost,
            input_cost: inputCost,
            output_cost: outputCost,
            cache_cost: cacheCost,
            top_part: topPart[0],
            top_tokens: topPart[1],
          });
        }

        const calls = m.first_block_only ? firstBlockCalls(reply) : reply.tool_uses;

        // interrupts (7.6): before any tool runs. The parent's turn only.
        const iv = tape.interrupt;
        // A5 ruling (b): "the reply asked for tools" means the harness read a call (calls is that list).
        if (!ag.isSub && iv && iv.turn === st.turn && calls.length > 0) {
          const pending = calls.map((u) => u.id);
          trace.emit("interrupt", { by: "human", pending });
          if (m.close_books) {
            ag.messages.push(user(pending.map((id) => toolResult(id, INTERRUPTED_RESULT, true))));
            ag.lastIsFeedback = false;
          }
          if (!iv.resume) return "interrupted";
          trace.flush();
          continue;
        }

        if (reply.stop_reason === "tool_use" && calls.length > 0) {
          runToolUses(calls, sentAtCall);
          continue;
        }
        // end_turn, and tool_use with no call read (A5.3): the end_turn branch, verify gate included
        if (reply.stop_reason === "end_turn" || reply.stop_reason === "tool_use") {
          if (m.verify_gate) {
            // A9.3: with a tape suite the gate runs it; pristine_tests reads the markers from the original workspace.
            const pristine = m.verify_gate.pristine_tests === true && tape.tests !== null;
            const passed = tape.tests
              ? testsHold(pristine ? new Vfs(tape.workspace, tape.outside) : vfs, vfs, tape.tests)
              : checksHold(vfs, tape.checks);
            trace.emit("verify", {
              check: pristine ? "tests (pristine)" : "tests",
              passed,
              output: passed ? tape.test_output.pass : tape.test_output.fail,
            });
            if (passed) return "done";
            if (ag.feedbackCount < m.verify_gate.max_feedback) {
              ag.feedbackCount += 1;
              ag.messages.push(user([textBlock(`Verification failed: ${tape.test_output.fail} Fix it, then say done.`)]));
              ag.lastIsFeedback = true;
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

    // A14.1: a run_agent call. Its latency is paid first; then an unknown agent or the limit refuses it, and
    // otherwise the sub-agent runs inline under its own label and turn numbers.
    const runAgentCall = (call, sentAtCall) => {
      st.t += RUN_AGENT_MS;
      const name = typeof call.input.agent === "string" ? call.input.agent : "";
      if (!Object.prototype.hasOwnProperty.call(tape.agents, name)) return { ok: false, output: `Unknown agent: ${name}` };
      const max = mods.subagents.max;
      if (started >= max) return { ok: false, output: `Sub-agent limit reached (${max})` };
      started += 1;
      const k = started;
      const brief = typeof call.input.brief === "string" ? call.input.brief : "";
      const context = mods.subagents.context;
      trace.emit("subagent_start", { name, k, context, brief });
      const def = tape.agents[name];
      // A16.1: the sub-agent has the board's tools (tool_pins included), model, pricing and request params;
      // its own script and system prompt. A16.3: its tool ids and responses carry its tag, a<k>_.
      const sub = newAgent({
        isSub: true,
        label: `${name}#${k}`,
        mods: subMods,
        toolsInst: tools,
        defs: allDefs,
        rejected: rejectedNames,
        modelId,
        price,
        system: def.system ?? tape.system,
        layers: ["system", "tools", "history"],
        script: def.script,
        scriptBase: `/agents/${name}/script`,
        maxTurns: mods.subagents.max_turns,
        params: sentParams,
        rejectedParam,
        idTag: `a${k}_`,
      });
      sub.model = newModel(sub);
      sub.messages = context === "forked" ? forkedMessages(sentAtCall, brief) : [user([textBlock(brief)])];
      const parentTurn = st.turn;
      const parentLabel = trace.label;
      trace.label = sub.label;
      st.turn = 0;
      // The sub-agent's pending events are flushed by the parent's next trace_write, as the parent's own are.
      const status = agentLoop(sub).loop();
      const subTurns = st.turn;
      st.turn = parentTurn;
      trace.label = parentLabel;
      retireModel(sub);
      trace.emit("subagent_end", {
        name,
        k,
        status,
        turns: subTurns,
        tokens: { input: sub.tokensIn, output: sub.tokensOut },
        cost: sub.cost,
        output: sub.lastText,
      });
      if (status === "done") return { ok: true, output: sub.lastText };
      return { ok: false, output: `Sub-agent ended ${status}: ${sub.lastText}` };
    };

    // A14.1 and A15.2: a sub-agent's system prompt has no layers; A15.2 keeps the layers list fixed.
    // The effort level and the thinking tokens come from this agent's modules (A7.3).
    const effortLevel = m.effort?.level ?? tape.effort?.default ?? "high";
    const thinking = tape.effort?.thinking_tokens?.[effortLevel] ?? 0;
    const outputConfig = m.effort ? { effort: m.effort.level } : null;
    return { loop };
  };

  // The main agent, and its sessions (A14.2 and A15.5).
  const systemBase = tape.system +
    (mods.rules_file && tape.rules.length > 0 ? "\n\nProject rules:\n- " + tape.rules.join("\n- ") : "");
  const layersFor = (progress) => {
    const pre = mods.system_clock ? ["clock", "system"] : ["system"];
    if (mods.rules_file && tape.rules.length > 0) pre.push("rules");
    if (progress) pre.push("progress");
    return [...pre, "tools", mods.history?.resend === false ? "history (not resent)" : "history"];
  };
  const scriptFor = (s) => (tape.sessions ? tape.sessions[s].script : (profile?.script ?? tape.script));
  // A18: the pointer of the script scriptFor(s) returns: a session's, a profile's, or the tape's.
  const scriptBaseFor = (s) => {
    if (tape.sessions) return `/sessions/${s}/script`;
    return profile?.script !== undefined ? `/models/${mods.model.id}/script` : "/script";
  };
  const main = newAgent({
    isSub: false,
    label: "main",
    mods,
    toolsInst: tools,
    defs: allDefs,
    rejected: rejectedNames,
    modelId,
    price,
    system: systemBase,
    layers: layersFor(false),
    script: scriptFor(0),
    scriptBase: scriptBaseFor(0),
    maxTurns: undefined,
    params: sentParams,
    rejectedParam,
  });

  trace.emit("run_start", { task: tape.task, board: board.id, seed, model_id: modelId });
  // A11.5: right after run_start, before the first turn, in tape order of the custom tools.
  for (const r of rejects) trace.emit("tool_rejected", { tool: r.tool, server: r.server, version: r.version, reason: r.reason });
  // A15.9: once per run when capability_check is plugged; dropped is empty when nothing was dropped.
  if (mods.capability_check) trace.emit("capability", { dropped });
  const count = tape.sessions ? tape.sessions.length : 1;
  let status = "";
  for (let s = 0; s < count; s += 1) {
    // A14.2: from session 2 on, the progress file is read once, at the start of the session, when it exists.
    const progress = s > 0 && mods.progress_file ? vfs.read(mods.progress_file.path) : null;
    main.system = progress === null || mods.progress_file === undefined
      ? systemBase
      : `${systemBase}\n\nProgress so far (from ${mods.progress_file.path}):\n${progress}`;
    main.layers = layersFor(progress !== null && mods.progress_file !== undefined);
    main.script = scriptFor(s);
    main.scriptBase = scriptBaseFor(s);
    main.session = s + 1;
    retireModel(main);
    main.model = newModel(main);
    main.messages = [user([textBlock(tape.task)])];
    main.turnStart = st.turn;
    main.consecutiveFailures = 0;
    main.feedbackCount = 0;
    main.lastIsFeedback = false;
    main.recent = [];
    if (tape.sessions) trace.emit("session_start", { session: s + 1 });
    status = agentLoop(main).loop();
    if (!HANDOVER.has(status) || s === count - 1) break;
  }
  retireModel(main);
  trace.flush();
  const passed = checksHold(vfs, tape.checks);
  const tokensObj = { input: totals.tokensIn, output: totals.tokensOut };
  trace.emit("run_end", { status, passed, turns: st.turn, tokens: tokensObj, cost: totals.cost });
  return {
    events: trace.events,
    wire,
    result: { status, passed, turns: st.turn, tokens: tokensObj, cost: totals.cost },
    branches,
  };
}
