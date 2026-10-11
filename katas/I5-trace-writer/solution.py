import json
import re

KEY = re.compile(r"sk-[A-Za-z0-9_-]{16,}")


def trace_lines(run, events):
    """Write one JSON line per trace event, in order, and return the lines.

    run is the run's id, a string. events is a list of dicts, each with "t" (seconds, a number),
    "turn" (an int), "kind" (a string) and "wire" (a string), and "text" (a string; a missing
    text counts as the empty string).

    Each line is one JSON object with these keys and no others: "v" (always 1), "run", "seq" (0 for
    the first event of the run, then 1, 2 and so on, across turns), "t", "turn", "kind", "wire" and
    "text". Any run of "sk-" followed by 16 or more letters, digits, "-" or "_" in the text is
    replaced by "[redacted]". Return an empty list for no events.
    """
    lines = []
    for seq, event in enumerate(events):
        record = {
            "v": 1,
            "run": run,
            "seq": seq,
            "t": event["t"],
            "turn": event["turn"],
            "kind": event["kind"],
            "wire": event["wire"],
            "text": KEY.sub("[redacted]", event.get("text", "")),
        }
        lines.append(json.dumps(record))
    return lines
