def parse_events(text: str) -> list[dict[str, str]]:
    """Parse a server-sent events stream (the rules the kata tests) into events."""
    events: list[dict[str, str]] = []
    event = "message"
    data: list[str] = []
    for line in text.split("\n"):
        if line == "":  # a blank line ends an event
            if data:
                events.append({"event": event, "data": "\n".join(data)})
            event = "message"
            data = []
            continue
        if line.startswith(":"):  # a comment, such as a keep-alive
            continue
        field, _, value = line.partition(":")
        if value.startswith(" "):  # one space after the colon is not part of the value
            value = value[1:]
        if field == "event":
            event = value
        elif field == "data":
            data.append(value)
    return events
