type LockManager struct {
  locks map[string]*sync.Mutex
  mu    sync.Mutex
}

func (lm *LockManager) Lock(key string) {
  lm.mu.Lock()
  if _, exists := lm.locks[key]; !exists {
    lm.locks[key] = &sync.Mutex{}
  }
  mutex := lm.locks[key]
  lm.mu.Unlock()
  // DEADLOCK RISK: If two threads lock different keys then try to lock again,
  // and another thread locks in opposite order, deadlock occurs
  // No timeout mechanism
  mutex.Lock()
}

func (lm *LockManager) Unlock(key string) {
  lm.mu.Lock()
  if mutex, ok := lm.locks[key]; ok {
    mutex.Unlock()
  }
  lm.mu.Unlock()
}