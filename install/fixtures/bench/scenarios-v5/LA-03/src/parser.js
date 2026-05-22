/**
 * Parse ISO datetime string
 */
function parseDateTime(str) {
  if (!str) throw new Error('Invalid input');
  const parts = str.split('T');
  if (parts.length !== 2) throw new Error('Invalid format');
  
  const [datePart, timePart] = parts;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  if (month < 1 || month > 12) throw new Error('Invalid month');
  if (day < 1 || day > 31) throw new Error('Invalid day');
  if (hour < 0 || hour > 23) throw new Error('Invalid hour');
  
  return new Date(year, month - 1, day, hour, minute, second);
}