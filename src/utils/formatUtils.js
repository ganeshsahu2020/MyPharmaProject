```javascript
/**
 * Formats a numeric value to a specified number of decimal places based on least_count_digits.
 * Returns '-' for invalid numbers and handles null/undefined cases.
 * @param {number|string} value - The numeric value to format.
 * @param {number} digits - The number of decimal places (from least_count_digits).
 * @returns {string} - Formatted string or '-' if invalid.
 */
export const formatWithLeastCountDigits = (value, digits) => {
  const n = parseFloat(value);
  return isNaN(n) ? '-' : n.toFixed(parseInt(digits || 0));
};
```