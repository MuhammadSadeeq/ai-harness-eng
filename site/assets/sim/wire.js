// Wire payloads (docs/ENGINE.md section 10): one request and one response per turn
// that produced a reply. Failed attempts and A1/resume invalid requests send nothing.

export const WIRE_MAX_TOKENS = 4096;

// outputConfig (A7.3): {effort: L} when the board sets the effort; absent otherwise.
export function wireRequest(modelId, system, tools, messages, outputConfig = null) {
  const req = {
    model: modelId,
    max_tokens: WIRE_MAX_TOKENS,
    system,
    tools: structuredClone(tools),
    messages: structuredClone(messages),
  };
  if (outputConfig) req.output_config = { ...outputConfig };
  return req;
}

export function wireResponse(modelId, turn, content, stopReason, usage) {
  return {
    id: `msg_${turn}`,
    type: "message",
    role: "assistant",
    model: modelId,
    content: structuredClone(content),
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { ...usage },
  };
}
