private AtomicInteger counter = new AtomicInteger();
public void incIfEven() {
  if (counter.get() % 2 == 0) counter.incrementAndGet();
}