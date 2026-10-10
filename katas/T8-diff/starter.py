def changed_lines(diff: str) -> dict[str, list[int]]:
    """Map each file in a unified diff to the new-file line numbers it adds.

    Read the diff line by line. "+++ b/<path>" names the file after the change;
    "+++ /dev/null" means the file was deleted, so leave it out. A hunk header
    "@@ -a,b +c,d @@" starts the new-file count at c. A line that starts with "+"
    is added and is listed. A line that starts with " " is unchanged and counts.
    A line that starts with "-" is not in the new file and does not count.
    Return a dict from file path to its list of added line numbers. A file with
    only removed lines maps to an empty list.
    """
    raise NotImplementedError("walk the lines: track the file, then the hunk's line number")
