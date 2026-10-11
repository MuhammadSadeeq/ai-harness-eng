from kata import legs_open, lethal

READER = {"name": "read_file", "trifecta": ["private_data"]}
FETCH = {"name": "fetch_page", "trifecta": ["untrusted_content"]}
POST = {"name": "send_report", "trifecta": ["exfiltration"]}
SHELL = {"name": "run_command", "trifecta": []}


def test_no_tools_open_no_legs():
    assert legs_open([]) == [], "an empty tool set opens no leg"


def test_one_tool_opens_its_leg():
    assert legs_open([READER]) == ["private_data"], "read_file opens private data"


def test_a_tool_can_carry_two_legs():
    both = {"name": "sync", "trifecta": ["private_data", "exfiltration"]}
    assert legs_open([both]) == ["private_data", "exfiltration"], "each leg is named once, in the fixed order"


def test_a_leg_opened_twice_is_named_once():
    assert legs_open([READER, READER]) == ["private_data"], "two readers still open one leg"


def test_legs_come_out_in_the_fixed_order():
    assert legs_open([POST, FETCH, READER]) == ["private_data", "untrusted_content", "exfiltration"], (
        "the order is the course's order, whatever the order of the tools"
    )


def test_two_legs_are_not_the_trifecta():
    assert not lethal([READER, FETCH]), "two open legs are not the lethal trifecta"


def test_all_three_open_is_lethal():
    assert lethal([READER, FETCH, POST]), "all three open is the lethal trifecta"


def test_a_cut_leg_is_not_open():
    assert legs_open([READER, FETCH, POST], cut=("exfiltration",)) == ["private_data", "untrusted_content"], (
        "a control that cuts a leg closes it"
    )


def test_one_cut_leg_breaks_the_trifecta():
    assert not lethal([READER, FETCH, POST], cut=("untrusted_content",)), "one cut leg means no trifecta"


def test_a_tool_with_no_legs_opens_none():
    assert legs_open([SHELL]) == [], "a tool that carries no leg opens none"


def test_an_unknown_leg_is_refused():
    try:
        legs_open([{"name": "x", "trifecta": ["exfil"]}])
    except ValueError as exc:
        assert "exfil" in str(exc), "say which leg name is unknown"
        return
    assert False, "an unknown leg must be refused, not ignored"
