def build_args(folder: str, image: str, command: list[str]) -> list[str]:
    """The argument list of one docker run: no network, a read-only root, one mount."""
    return ["docker", "run", "--network", "none", "--read-only",
            "-v", f"{folder}:/work", image, *command]
