"""The checker fixtures are data, not tests: keep pytest out of this tree.

The kata fixtures contain test_kata.py files that import `kata`, which only exists when the
checker copies a candidate into a temp directory. Without this, a bare pytest run over
tools/tests would collect them and fail.
"""

collect_ignore_glob = ["*"]
