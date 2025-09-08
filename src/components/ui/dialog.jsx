// src/components/ui/dialog.jsx
import * as React from 'react';

export const Dialog = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    if (open) {
      document.addEventListener('keydown', onEsc);
    }
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
};

export const DialogContent = ({ children, className = '' }) => (
  <div className={`relative z-50 w-[95%] max-w-lg rounded-xl bg-white p-4 shadow-xl ${className}`}>
    {children}
  </div>
);

export const DialogHeader = ({ children }) => (
  <div className="mb-2">{children}</div>
);

export const DialogTitle = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>
);

export const DialogFooter = ({ children, className = '' }) => (
  <div className={`mt-4 flex justify-end gap-2 ${className}`}>{children}</div>
);
