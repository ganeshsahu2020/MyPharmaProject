// src/utils/timeMath.js

export const parseIntSafe = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

// minutes → hours (number)
export const minToH = (min) => (Number(min) || 0) / 60;

// format hours to 2 decimals as string
export const h2 = (h) =>
  (Math.round(((Number(h) || 0) + Number.EPSILON) * 100) / 100).toFixed(2);

// overtime hours from total work minutes and a base (default 480 min = 8h)
export const overtimeH = (workMin, baseMin = 480) =>
  Math.max(0, (Number(workMin) || 0) - (Number(baseMin) || 0)) / 60;
