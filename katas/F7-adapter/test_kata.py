from kata import Adapter


def test_an_accepted_parameter_passes_through():
    adapter = Adapter("model-new", ["temperature"], True)
    assert adapter.request_fields({"max_tokens": 1024}) == {"max_tokens": 1024}, "nothing rejected, nothing changed"
    assert adapter.dropped == [], "the dropped list is empty when nothing is dropped"


def test_a_rejected_parameter_is_dropped_when_the_check_is_on():
    adapter = Adapter("model-new", ["temperature"], True)
    fields = adapter.request_fields({"temperature": 0, "max_tokens": 1024})
    assert fields == {"max_tokens": 1024}, "the rejected parameter is not sent"
    assert adapter.dropped == ["temperature"], "the dropped list names what was removed"


def test_without_the_check_a_rejected_parameter_is_refused_with_the_model_name():
    adapter = Adapter("model-new", ["temperature"], False)
    try:
        adapter.request_fields({"temperature": 0})
    except ValueError as error:
        assert str(error) == "temperature: this parameter is not supported on model-new", "the message names the parameter and the model"
    else:
        raise AssertionError("a rejected parameter must be refused when the check is off")


def test_the_first_rejected_name_in_the_callers_order_is_the_one_named():
    adapter = Adapter("model-new", ["temperature", "top_k"], False)
    try:
        adapter.request_fields({"top_k": 5, "temperature": 0})
    except ValueError as error:
        assert str(error).startswith("top_k:"), "the caller's order decides which name is refused"
    else:
        raise AssertionError("a rejected parameter must be refused when the check is off")


def test_the_callers_dictionary_is_not_changed():
    params = {"temperature": 0, "max_tokens": 1024}
    Adapter("model-new", ["temperature"], True).request_fields(params)
    assert params == {"temperature": 0, "max_tokens": 1024}, "the caller still has every parameter it passed"


def test_a_second_call_starts_with_a_fresh_dropped_list():
    adapter = Adapter("model-new", ["temperature"], True)
    adapter.request_fields({"temperature": 0})
    adapter.request_fields({"max_tokens": 1024})
    assert adapter.dropped == [], "the list describes the last call only"
