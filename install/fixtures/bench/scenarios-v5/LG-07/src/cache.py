import threading
import time

class TokenCache:
    def __init__(self, fetch_token):
        self.fetch_token = fetch_token
        self.token = None
        self.expires_at = 0
        self.lock = threading.Lock()

    def get(self):
        now = time.time()
        if self.token and now < self.expires_at:
            return self.token
        with self.lock:
            token, ttl = self.fetch_token()
            self.token = token
            self.expires_at = time.time() + ttl
            return token

    def clear(self):
        self.token = None
        self.expires_at = 0