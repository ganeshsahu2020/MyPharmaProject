// Vite default: src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UOMProvider } from './contexts/UOMContext';
import { AlertProvider } from './contexts/AlertContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <UOMProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </UOMProvider>
    </AuthProvider>
  </BrowserRouter>
);
