from kata import keyed_call

TIMEOUT = "Timed out waiting for the reply; the action may have happened."


def scripted(replies):
    """A send that answers from a list and records the keys it was given."""
    seen = []

    def send(key):
        seen.append(key)
        return replies[len(seen) - 1]

    return send, seen


def test_a_clean_payment_is_sent_once_with_its_key():
    send, keys = scripted([(True, "Paid.")])
    assert keyed_call(send, "invoice-77", 3) == (True, "Paid.", 1), "one send, the reply as it came"
    assert keys == ["invoice-77"], "the key is the action's id"


def test_a_timed_out_reply_is_retried_with_the_same_key():
    send, keys = scripted([(False, TIMEOUT), (True, "Paid.")])
    result = keyed_call(send, "invoice-77", 3)
    assert result == (True, "Paid.", 2), "the retry's reply is the result"
    assert keys == ["invoice-77", "invoice-77"], "both attempts carry one key, so the tool can tell them apart"


def test_a_normal_failure_is_not_retried():
    send, keys = scripted([(False, "Invalid amount."), (True, "Paid.")])
    assert keyed_call(send, "invoice-77", 3) == (False, "Invalid amount.", 1), "a refusal is final"
    assert len(keys) == 1, "no second send"


def test_the_attempts_stop_at_the_maximum():
    send, keys = scripted([(False, TIMEOUT)] * 5)
    ok, output, attempts = keyed_call(send, "invoice-77", 3)
    assert attempts == 3 and len(keys) == 3, "three attempts in all, then the caller decides"
    assert ok is False and output == TIMEOUT, "the timeout is returned, not turned into a success"


def test_two_actions_get_two_keys():
    send_a, keys_a = scripted([(True, "Paid.")])
    send_b, keys_b = scripted([(True, "Paid.")])
    keyed_call(send_a, "invoice-77", 3)
    keyed_call(send_b, "invoice-78", 3)
    assert keys_a != keys_b, "a different action never reuses another action's key"


def test_the_key_is_the_same_on_every_run_of_the_same_action():
    first, keys_first = scripted([(True, "Paid.")])
    second, keys_second = scripted([(True, "Paid.")])
    keyed_call(first, "invoice-77", 3)
    keyed_call(second, "invoice-77", 3)
    assert keys_first, "the call must send a key"
    assert keys_first == keys_second, "the key comes from the action, not from chance or the clock"
