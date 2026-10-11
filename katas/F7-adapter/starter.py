class Adapter:
    """One place for the model's rules: which parameters it rejects, and what to do about them.

    With the capability check on, a rejected parameter is dropped and named in dropped.
    With it off, the first rejected parameter (in the caller's order) is refused.
    """

    def __init__(self, model_id, rejects, capability_check):
        raise NotImplementedError("keep the model id, the rejected names, the check and the dropped list")

    def request_fields(self, params):
        raise NotImplementedError("copy the accepted fields; drop or refuse the rejected ones; never change params")
