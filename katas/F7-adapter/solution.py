class Adapter:
    """One place for the model's rules: which parameters it rejects, and what to do about them.

    With the capability check on, a rejected parameter is dropped and named in dropped.
    With it off, the first rejected parameter (in the caller's order) is refused.
    """

    def __init__(self, model_id, rejects, capability_check):
        self.model_id = model_id
        self.rejects = list(rejects)
        self.capability_check = capability_check
        self.dropped = []

    def request_fields(self, params):
        fields = {}
        self.dropped = []
        for name, value in params.items():
            if name in self.rejects:
                if not self.capability_check:
                    raise ValueError(f"{name}: this parameter is not supported on {self.model_id}")
                self.dropped.append(name)
                continue
            fields[name] = value
        return fields
