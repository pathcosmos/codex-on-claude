// buggy.js — calculates sliding-window averages. Has an off-by-one bug.
function slidingAverage(arr, window) {
  if (window <= 0 || window > arr.length) return [];
  const result = [];
  // BUG: should be i <= arr.length - window, not i < arr.length - window
  for (let i = 0; i < arr.length - window; i++) {
    let sum = 0;
    for (let j = 0; j < window; j++) sum += arr[i + j];
    result.push(sum / window);
  }
  return result;
}

module.exports = { slidingAverage };
