// Wire payloads (docs/ENGINE.md section 10): one request and one response per turn
// that produced a reply. Failed attempts and A1/resume invalid requests send nothing.

export const WIRE_MAX_TOKENS = 4096;

// outputConfig (A7.3): {effort: L} when the board sets the effort; absent otherwise.
// A14.5: extra holds the board's request_params (after capability_check); each one is a top-level field.
export function wireRequest(modelId, system, tools, messages, outputConfig = null, extra = {}) {
  const req = {
    model: modelId,
    max_tokens: WIRE_MAX_TOKENS,
    system,
    tools: structuredClone(tools),
    messages: structuredClone(messages),
  };
  if (outputConfig) req.output_config = { ...outputConfig };
  for (const [k, v] of Object.entries(extra)) req[k] = v;
  return req;
}

export function wireResponse(modelId, turn, content, stopReason, usage, tag = "") {
  return {
    id: `msg_${tag}${turn}`,
    type: "message",
    role: "assistant",
    model: modelId,
    content: structuredClone(content),
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { ...usage },
  };
}
