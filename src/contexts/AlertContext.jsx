// src/contexts/AlertContext.jsx
import React, { createContext, useContext, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

const AlertContext = createContext({
  alerts: [],
  addAlert: () => {},
  removeAlert: () => {},
  clearAlerts: () => {},
});

function toastForLevel(level, message) {
  const baseStyle = {
    fontSize: '14px',
    borderRadius: '4px',
    padding: '10px 14px',
  };

  switch (String(level || '').toLowerCase()) {
    case 'error':
      return toast.error(message, {
        style: { ...baseStyle, background: '#fee2e2', color: '#991b1b' },
      });
    case 'warn':
    case 'warning':
      return toast(message, {
        icon: '⚠️',
        style: { ...baseStyle, background: '#fef3c7', color: '#7c2d12' },
      });
    case 'info':
      return toast(message, {
        icon: 'ℹ️',
        style: { ...baseStyle, background: '#e0f2fe', color: '#075985' },
      });
    default:
      return toast.success(message, {
        style: { ...baseStyle, background: '#d1fae5', color: '#065f46' },
      });
  }
}

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  const addAlert = (alert) => {
    // normalize + id
    const id = alert?.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const level = alert?.level ?? 'success';
    const source = alert?.source ?? 'Alert';
    const message = alert?.message ?? `New alert from ${source}`;

    setAlerts((prev) => [...prev, { id, level, source, message, ...alert }]);

    // toast
    toastForLevel(level, `✅ ${message}`);
    return id;
  };

  const removeAlert = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAlerts = () => setAlerts([]);

  const value = useMemo(
    () => ({ alerts, addAlert, removeAlert, clearAlerts }),
    [alerts]
  );

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
};

export const useAlerts = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within <AlertProvider>');
  return ctx;
};

// Optional default export for compatibility
export default AlertContext;
