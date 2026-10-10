from kata import changed_lines

ONE_FILE = """diff --git a/notes/a.txt b/notes/a.txt
index 1111111..2222222 100644
--- a/notes/a.txt
+++ b/notes/a.txt
@@ -1,3 +1,4 @@
 Buy milk.
-Call Sam.
+Call Sam at nine.
+Book the room.
 Fix the car.
"""

NEW_FILE = """diff --git a/notes/new.txt b/notes/new.txt
new file mode 100644
--- /dev/null
+++ b/notes/new.txt
@@ -0,0 +1,2 @@
+one
+two
"""

DELETED = """diff --git a/notes/old.txt b/notes/old.txt
deleted file mode 100644
--- a/notes/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-gone
-gone too
"""


def test_one_hunk_gives_the_added_lines():
    assert changed_lines(ONE_FILE) == {"notes/a.txt": [2, 3]}, "the two + lines are new lines 2 and 3"


def test_a_new_file_counts_from_line_one():
    assert changed_lines(NEW_FILE) == {"notes/new.txt": [1, 2]}, "a new file starts at line 1"


def test_two_files_are_kept_apart():
    result = changed_lines(ONE_FILE + NEW_FILE)
    assert sorted(result) == ["notes/a.txt", "notes/new.txt"], "one entry per file"
    assert result["notes/new.txt"] == [1, 2], "the second file keeps its own count"


def test_a_second_hunk_starts_at_its_own_line():
    diff = """+++ b/notes/a.txt
@@ -10,1 +20,2 @@
 context
+added
"""
    assert changed_lines(diff) == {"notes/a.txt": [21]}, "the hunk header sets the count"


def test_a_deleted_file_is_not_listed():
    assert changed_lines(DELETED) == {}, "a file deleted by the diff is not in the result"


def test_removed_lines_do_not_count():
    removed_only = """+++ b/notes/a.txt
@@ -1,2 +1,1 @@
-first
 second
"""
    assert changed_lines(removed_only) == {"notes/a.txt": []}, "a removed line is not in the new file"
