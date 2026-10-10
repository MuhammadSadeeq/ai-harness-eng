def parse_events(text: str) -> list[dict[str, str]]:
    """Parse a server-sent events stream into events, each {"event": ..., "data": ...}.

    Rules: a line "field: value" sets a field; drop one space after the colon.
    "event" names the event (default "message"); each "data" line adds one line
    to the data. Lines starting with ":" are comments and are skipped. A blank
    line ends an event, and only an event with data is returned. An event
    that has no blank line after it at the end of the text is not returned.
    """
    raise NotImplementedError("split the text into lines, and collect the fields until a blank line")
