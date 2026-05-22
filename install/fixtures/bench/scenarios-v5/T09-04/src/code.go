var a, b sync.Mutex
func f1() { a.Lock(); b.Lock(); /* work */ b.Unlock(); a.Unlock() }
func f2() { b.Lock(); a.Lock(); /* work */ a.Unlock(); b.Unlock() }