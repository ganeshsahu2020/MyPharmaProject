// src/components/ui/badge.jsx
import React from 'react';

export const Badge = ({ children, variant = 'secondary', className = '' }) => {
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium';
  const look =
    variant === 'secondary'
      ? 'border-gray-200 bg-gray-50 text-gray-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <span className={`${base} ${look} ${className}`}>{children}</span>;
};

export default Badge;
