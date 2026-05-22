// State machine for distributed order processing
// Multiple services transition order through states concurrently

type OrderState = 
  | 'pending' 
  | 'payment_processing' 
  | 'payment_confirmed' 
  | 'inventory_reserved' 
  | 'shipped' 
  | 'failed';

const transitions: Record<OrderState, OrderState[]> = {
  'pending': ['payment_processing', 'failed'],
  'payment_processing': ['payment_confirmed', 'failed'],
  'payment_confirmed': ['inventory_reserved', 'failed'],
  'inventory_reserved': ['shipped', 'failed'],
  'shipped': [],
  'failed': ['pending']  // Allow retry
};

function canTransition(from: OrderState, to: OrderState): boolean {
  return transitions[from].includes(to);
}

// PROBLEM: Race condition when two services try to transition simultaneously
// Example: Payment service moves pending→payment_processing
//          Meanwhile, cancellation service tries pending→failed
// Result: One succeeds, one fails. Inconsistent global state.
// No deterministic ordering or atomic transitions across services.
// Retry mechanism (failed→pending) can cause loops without circuit breaker.