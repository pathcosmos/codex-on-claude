package retry

import "math/rand"

func Backoff(attempt int) int {
	// BUG (jitter_seeded_deterministic): rand.Seed never called → deterministic across runs
	base := 1 << attempt
	return base + rand.Intn(100)
}
