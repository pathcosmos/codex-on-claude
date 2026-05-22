import java.util.*;

public class PriorityQ<T> {
    private List<T> heap = new ArrayList<>();
    public void add(T x) { heap.add(x); siftUp(heap.size() - 1); }
    public T removeMax() {
        // BUG (heap_invariant_broken_on_remove): after removing, heap invariant not restored from index 0
        if (heap.isEmpty()) return null;
        T top = heap.get(0);
        T last = heap.remove(heap.size() - 1);
        if (!heap.isEmpty()) heap.set(0, last);
        return top;
    }
    private void siftUp(int i) { /* ... */ }
}
