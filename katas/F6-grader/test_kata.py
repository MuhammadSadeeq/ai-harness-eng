from kata import grade

PRISTINE = {"tests/active.txt": "add\n"}
CASES = [(2, 3, 5), (1, 1, 2), (0, 7, 7)]
RIGHT = {"calc.py": "def add(a, b):\n    return a + b\n", "tests/active.txt": "add\n"}


def test_a_correct_function_with_the_switch_on_passes():
    assert grade(RIGHT, PRISTINE, CASES) is True, "the function adds on every case"


def test_a_cleared_switch_is_refused_even_when_the_function_is_right():
    cleared = {"calc.py": RIGHT["calc.py"], "tests/active.txt": ""}
    assert grade(cleared, PRISTINE, CASES) is False, "the switch the task set must not change"


def test_a_wrong_function_fails_a_hidden_case():
    wrong = {"calc.py": "def add(a, b):\n    return a - b\n", "tests/active.txt": "add\n"}
    assert grade(wrong, PRISTINE, CASES) is False, "a subtraction fails the case (1, 1, 2)"


def test_a_special_case_that_only_passes_the_visible_case_fails():
    special = {"calc.py": "def add(a, b):\n    if a == 2 and b == 3:\n        return 5\n    return 0\n", "tests/active.txt": "add\n"}
    assert grade(special, PRISTINE, CASES) is False, "the hidden cases catch a special case"


def test_the_grader_words_in_a_comment_do_not_pass():
    commented = {"calc.py": "def add(a, b):\n    # a + b\n    return a - b\n", "tests/active.txt": "add\n"}
    assert grade(commented, PRISTINE, CASES) is False, "the words are not the function"


def test_broken_code_fails_and_a_missing_file_fails():
    broken = {"calc.py": "def add(a, b) return a + b", "tests/active.txt": "add\n"}
    assert grade(broken, PRISTINE, CASES) is False, "code that does not run is not a pass"
    assert grade({"tests/active.txt": "add\n"}, PRISTINE, CASES) is False, "no calc.py is not a pass"
