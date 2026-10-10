from kata import build_args

FOLDER = "/home/me/notes"


def test_the_list_starts_with_docker_run():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert args[:2] == ["docker", "run"], "the command starts with docker run"


def test_the_network_is_off():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert "--network" in args, "a network setting is in the list"
    assert args[args.index("--network") + 1] == "none", "the network setting is none"


def test_the_root_filesystem_is_read_only():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert "--read-only" in args, "the root filesystem flag is in the list"


def test_exactly_one_mount_of_the_folder():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert args.count("-v") == 1, "one mount, and only one"
    assert args[args.index("-v") + 1] == "/home/me/notes:/work", "the mount is the folder the task needs"


def test_no_other_mount_flag():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert "--mount" not in args, "use the one -v mount, not a second kind of mount"


def test_the_image_then_the_command_come_last():
    args = build_args(FOLDER, "python:3", ["python", "count.py"])
    assert args[-3:] == ["python:3", "python", "count.py"], "the image is followed by the command"
