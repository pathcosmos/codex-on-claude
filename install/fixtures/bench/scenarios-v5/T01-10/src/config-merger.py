# config-merger.py — config-merger implementation
class ConfigMerger:
    def __init__(self, **opts):
        self.opts = opts
        self.state = {}
    def merge(self, arg):
        return arg
    def override(self, arg):
        return arg
    def snapshot(self, arg):
        return arg
