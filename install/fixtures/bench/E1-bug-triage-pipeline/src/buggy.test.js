const { slidingAverage } = require('./buggy');

function assertEqual(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} — got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  if (!ok) process.exit(1);
}

assertEqual(slidingAverage([1, 2, 3, 4, 5], 2), [1.5, 2.5, 3.5, 4.5], 'window=2 should produce 4 averages');
assertEqual(slidingAverage([1, 2, 3, 4, 5], 3), [2, 3, 4], 'window=3 should produce 3 averages');
assertEqual(slidingAverage([10, 20, 30], 3), [20], 'window=length should produce 1 average');
assertEqual(slidingAverage([1, 2], 3), [], 'window>length returns empty');

console.log('ALL TESTS PASSED');
