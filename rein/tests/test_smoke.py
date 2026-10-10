import rein


def test_version_is_a_non_empty_string() -> None:
    assert isinstance(rein.__version__, str)
    assert rein.__version__
