from kata import cap_output


def test_a_short_output_is_returned_unchanged():
    assert cap_output("ok", 10) == "ok", "at or under the limit the text is returned as it is"


def test_an_output_exactly_at_the_limit_is_unchanged():
    text = "x" * 20
    assert len(text) // 4 == 5, "twenty characters estimate to five tokens"
    assert cap_output(text, 5) == text, "at the limit, nothing is cut"


def test_a_long_output_keeps_its_start_and_its_end():
    text = "ABCDEFGHIJ" + "middle" * 20 + "UVWXYZ"
    shown = cap_output(text, 2)
    assert shown.startswith("ABCD"), "the first 2 * max_tokens characters are kept"
    assert shown.endswith("WXYZ"), "the last 2 * max_tokens characters are kept"


def test_the_cut_says_how_many_characters_went():
    text = "0123456789" * 4
    removed = len(text) - 2 * (2 * 2)
    assert "\n[... " + str(removed) + " characters cut; ask for a smaller range ...]\n" in cap_output(text, 2), "the marker names the count"


def test_the_middle_is_gone():
    text = "start" + "-" * 60 + "middle-part" + "-" * 60 + "finish"
    shown = cap_output(text, 3)
    assert "middle-part" not in shown, "the cut removes the middle"
