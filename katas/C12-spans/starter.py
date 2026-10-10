"""Turn a trace into spans. The span structure (run, turn, model call, tool call) is the course's own;
the names and attribute keys follow the OpenTelemetry GenAI conventions (C12.o3).

events: the trace's events in order. Each is a dict with "kind", "t" and, where the kind has one, "turn".
Return a list of spans in the order each one first appears in events. A span is a dict with
"name", "kind", "parent" (the index in the list of the parent span, None for the run), "start", "end" (t values)
and "attributes" (a dict).

- The run span comes first. It is kind "run", named "invoke_agent <agent>" from run_start, and it ends at the t
  of the last event (run_end included).
- A turn span, kind "turn", named "turn <n>", is a child of the run. It starts at the first event whose turn is n
  and ends at the last such event; run_end is not part of a turn.
- A model span, kind "model", named "chat <model_id>" from run_start, is a child of its turn. It starts at
  model_call and ends at the model_reply of the same turn. Its attributes are gen_ai.request.model (model_id),
  gen_ai.usage.input_tokens (tokens_in of model_call) and gen_ai.usage.output_tokens (usage.output_tokens of the reply).
- A tool span, kind "tool", named "execute_tool <tool>", is a child of its turn. It starts and ends at tool_call.
  Its attributes are gen_ai.tool.name (tool) and gen_ai.tool.call.id (tool_use_id).

An empty trace gives an empty list.
"""


def spans(events):
    raise NotImplementedError("one run span, then turns, model calls and tool calls, each with its parent and end")
