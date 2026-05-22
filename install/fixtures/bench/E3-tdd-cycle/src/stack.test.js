const { Stack } = require('./stack');

function assert(cond, name) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) process.exit(1);
}

const s = new Stack();
assert(s.isEmpty() === true, 'new stack is empty');
assert(s.size() === 0, 'new stack size is 0');
assert(s.pop() === undefined, 'pop on empty returns undefined');
assert(s.peek() === undefined, 'peek on empty returns undefined');

s.push(1); s.push(2); s.push(3);
assert(s.size() === 3, 'size after 3 pushes is 3');
assert(s.peek() === 3, 'peek returns top');
assert(s.pop() === 3, 'pop returns top');
assert(s.size() === 2, 'size after pop is 2');
assert(s.isEmpty() === false, 'not empty after 2 pushes');

s.clear();
assert(s.size() === 0, 'clear empties');
assert(s.isEmpty() === true, 'isEmpty true after clear');

console.log('ALL TESTS PASSED');
