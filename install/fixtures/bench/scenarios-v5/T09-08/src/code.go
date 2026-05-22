func read() *Data {
  d := globalData // copy of pointer
  time.Sleep(100 * time.Millisecond)
  return d // d may be stale
}