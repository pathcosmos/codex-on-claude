package main
import "sync"
var mu sync.Mutex
var counter int
func inc() {
  c := counter
  mu.Lock()
  counter = c + 1
  mu.Unlock()
}