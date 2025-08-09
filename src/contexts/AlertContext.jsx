import { createContext, useContext, useState } from 'react';

const AlertContext = createContext();

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  // ✅ Combine alerts from WeightBox and StandardWeight with source tags
  const updateAlerts = (newAlerts) => {
    setAlerts((prev) => {
      const merged = [...prev.filter(a => a.source !== newAlerts.source), ...newAlerts];
      return merged;
    });
  };

  return (
    <AlertContext.Provider value={{ alerts, updateAlerts }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => useContext(AlertContext);
