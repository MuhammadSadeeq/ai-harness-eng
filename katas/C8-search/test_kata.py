from kata import search

TOOLS = [
    {"name": "ticket_lookup", "description": "Look up a support ticket by its id. Use it when the user names a ticket."},
    {"name": "ticket_list", "description": "List open tickets for a customer."},
    {"name": "invoice_pdf", "description": "Make a PDF of an invoice."},
    {"name": "invoice_send", "description": "Send an invoice to a customer by email."},
]


def test_loads_the_matching_tool_by_its_keywords():
    assert search("ticket lookup", TOOLS, set()) == ("Loaded: ticket_lookup", True, ["ticket_lookup"]), "every word matches the name and description"


def test_every_word_has_to_match():
    assert search("ticket email", TOOLS, set()) == ("No tool matched: ticket email", False, []), "no tool has both ticket and email"


def test_the_query_is_not_case_sensitive():
    assert search("TICKET LOOKUP", TOOLS, set()) == ("Loaded: ticket_lookup", True, ["ticket_lookup"]), "the search lowercases the query"


def test_an_empty_query_loads_nothing():
    assert search("", TOOLS, set()) == ("No tool matched: ", False, []), "a query with no words loads nothing"


def test_a_non_string_query_reads_as_empty():
    assert search(42, TOOLS, set()) == ("No tool matched: ", False, []), "a non-string query reads as the empty string"


def test_at_most_five_load_in_tools_order():
    tools = [{"name": f"report_{letter}", "description": "Make a report."} for letter in "ecagbfd"]
    output, ok, newly = search("report", tools, set())
    assert newly == ["report_e", "report_c", "report_a", "report_g", "report_b"], "five, in the order the request lists them"
    assert output == "Loaded: report_e, report_c, report_a, report_g, report_b", output
    assert ok is True


def test_a_loaded_tool_is_not_loaded_again_and_the_new_match_still_loads():
    assert search("ticket", TOOLS, {"ticket_lookup"}) == ("Loaded: ticket_list", True, ["ticket_list"]), "only the tool not yet loaded"


def test_when_every_match_is_already_loaded_the_output_says_so():
    assert search("ticket lookup", TOOLS, {"ticket_lookup"}) == ("Already loaded: ticket_lookup", True, []), "already loaded is not a failure"


def test_no_match_says_so_and_loads_nothing():
    assert search("bake cake", TOOLS, set()) == ("No tool matched: bake cake", False, []), "nothing matches"
