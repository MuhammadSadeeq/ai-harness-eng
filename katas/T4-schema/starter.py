from typing import Any


def check(value: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    """Return the errors of value against schema, each as '<path>: <what is wrong>'.

    Support: type (object, array, string, boolean, number, integer), enum,
    properties (checked in place), required, items, and additionalProperties
    set to False. A missing required field: "<path>: missing required field '<name>'".
    An extra field under additionalProperties False: "<path>: unexpected field '<name>'".
    A wrong type: "<path>: expected <type>". A bad enum value: "<path>: must be one of <list>".
    """
    raise NotImplementedError("check the type, then the enum, then the object or array")
