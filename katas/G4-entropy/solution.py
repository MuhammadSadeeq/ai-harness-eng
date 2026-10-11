import ast
import re

CALL = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\(\)")


def defined_names(source):
    """Every function and class name defined anywhere in the source."""
    names = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
    return names


def stale_references(rules, names):
    """(line number, name) for every call written with empty parentheses whose name is not defined."""
    found = []
    for number, line in enumerate(rules.splitlines(), start=1):
        for match in CALL.finditer(line):
            if match.group(1) not in names:
                found.append((number, match.group(1)))
    return found
