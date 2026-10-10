def search(query, tools, loaded):
    text = query if isinstance(query, str) else ""
    words = text.lower().split()
    if not words:
        return f"No tool matched: {text}", False, []

    def matches(tool):
        haystack = f"{tool['name']} {tool['description']}".lower()
        return all(word in haystack for word in words)

    fresh = [tool["name"] for tool in tools if tool["name"] not in loaded and matches(tool)]
    if fresh:
        newly = fresh[:5]
        return f"Loaded: {', '.join(newly)}", True, newly
    old = [tool["name"] for tool in tools if tool["name"] in loaded and matches(tool)]
    if old:
        return f"Already loaded: {', '.join(old)}", True, []
    return f"No tool matched: {text}", False, []
