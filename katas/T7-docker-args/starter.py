def build_args(folder: str, image: str, command: list[str]) -> list[str]:
    """Build the argument list of one `docker run` command, as a list of strings.

    The list starts with "docker", "run". It turns the network off with
    "--network", "none"; it makes the root filesystem read-only with
    "--read-only"; it mounts one folder with "-v", "<folder>:/work"; then the
    image, then the command.
    """
    raise NotImplementedError("return the list: docker run, the network, the read-only flag, one mount, the image, the command")
