# LRU cache
class LRU:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = {}
    def get(self, key):
        if key not in self.data: return None
        return self.data[key]
    def set(self, key, value):
        # BUG (lru_recency_not_updated): get() didn't refresh recency, so eviction is broken
        if len(self.data) >= self.capacity:
            oldest = next(iter(self.data))
            del self.data[oldest]
        self.data[key] = value
