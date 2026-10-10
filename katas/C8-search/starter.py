def search(query, tools, loaded):
    """Find tools by keyword, the way the harness's tool search does (ENGINE A9.2 and A10.5).

    query: the keywords the model sent. A non-string query reads as "". tools: the tool definitions, each a dict with
    "name" and "description", in the order the request lists them. loaded: the set of names already in the request.
    The query is split on whitespace after lowercasing it. A tool matches when every word appears in its lowercased
    name + " " + description. The candidates are the tools that are not loaded yet.

    Return (output, ok, newly). newly is the list of names to load, in tools order, at most five:
    - the query has no words: ("No tool matched: <query>", False, []);
    - some candidates match: ("Loaded: name, name", True, the names loaded);
    - nothing new matches, but some tools match and are already loaded: ("Already loaded: name, name", True, []),
      listing every match in tools order;
    - nothing matches: ("No tool matched: <query>", False, []).
    """
    raise NotImplementedError("match every word, load at most five new tools in order, and report the rest")
