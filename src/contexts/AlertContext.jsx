import React, { createContext, useContext, useState } from 'react';
import toast from 'react-hot-toast';

const AlertContext = createContext();

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  const addAlert = (alert) => {
    setAlerts((prev) => [...prev, alert]);
    toast.success(`✅ New alert: ${alert.source}`, {
      style: {
        background: '#d1fae5',
        color: '#065f46',
        fontSize: '14px',
        borderRadius: '4px',
        padding: '10px 14px',
      },
    });
  };

  const removeAlert = (id) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  return (
    <AlertContext.Provider value={{ alerts, addAlert, removeAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => useContext(AlertContext);