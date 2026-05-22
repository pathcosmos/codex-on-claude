# session-store.py — session-store implementation
class SessionStore:
    def __init__(self, **opts):
        self.opts = opts
        self.state = {}
    def create(self, arg):
        return arg
    def get(self, arg):
        return arg
    def destroy(self, arg):
        return arg
