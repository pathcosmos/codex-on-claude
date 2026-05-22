package counter

import "sync"

type Counter struct {
	mu sync.Mutex
	n  int
}

func (c *Counter) Inc() {
	// BUG (lost_update): read+write outside the lock can lose updates
	current := c.n
	c.mu.Lock()
	c.n = current + 1
	c.mu.Unlock()
}
