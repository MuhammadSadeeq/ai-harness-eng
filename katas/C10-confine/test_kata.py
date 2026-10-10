from kata import confine


def test_a_plain_path_inside_is_returned():
    assert confine("notes/a.txt", {}) == "notes/a.txt", "a path inside the root is returned as it is"


def test_a_dot_dot_that_stays_inside_is_fine():
    assert confine("notes/../notes/a.txt", {}) == "notes/a.txt", "normalize, then check"


def test_a_path_that_leaves_the_root_is_refused():
    for bad in ("../secrets.env", "notes/../../secrets.env"):
        try:
            confine(bad, {})
        except ValueError as exc:
            assert "outside" in str(exc), "say that the path is outside the workspace"
            continue
        assert False, f"{bad} should be refused"


def test_a_prefix_that_looks_inside_is_not_enough():
    try:
        confine("notesX/../../secrets.env", {})
    except ValueError:
        return
    assert False, "a path that starts like an inside path can still leave the root"


def test_an_absolute_path_is_refused():
    try:
        confine("/etc/passwd", {})
    except ValueError as exc:
        assert "outside" in str(exc), "an absolute path is outside the workspace"
        return
    assert False, "an absolute path must be refused"


def test_a_link_inside_is_followed():
    assert confine("notes/link.txt", {"notes/link.txt": "a.txt"}) == "notes/a.txt", (
        "a link's target is relative to the link's own folder"
    )


def test_a_link_that_leaves_is_refused_and_says_where_it_points():
    try:
        confine("notes/creds.txt", {"notes/creds.txt": "../../secrets.env"})
    except ValueError as exc:
        assert "notes/creds.txt" in str(exc) and "outside" in str(exc), "name the link and where it points"
        assert "../secrets.env" in str(exc), "the message gives the resolved target"
        return
    assert False, "a link that leaves the root must be refused"


def test_links_are_followed_one_after_another():
    assert confine("a.txt", {"a.txt": "b.txt", "b.txt": "c.txt"}) == "c.txt", "follow the chain to its end"


def test_too_many_links_are_refused():
    try:
        confine("l0", {"l0": "l1", "l1": "l0"})
    except ValueError as exc:
        assert "too many levels of links" in str(exc), "a loop of links gets its own message"
        return
    assert False, "a loop of links must stop after a set number of hops"
