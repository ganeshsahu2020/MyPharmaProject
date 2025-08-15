import React from 'react';
  import ReactDOM from 'react-dom/client';
  import { BrowserRouter } from 'react-router-dom';
  import App from './App.jsx';
  import './index.css';
  import { AuthProvider } from './contexts/AuthContext';
  import { UOMProvider } from './contexts/UOMContext';
  import { AlertProvider } from './contexts/AlertContext';

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <UOMProvider>
          <AuthProvider>
            <AlertProvider>
              <App />
            </AlertProvider>
          </AuthProvider>
        </UOMProvider>
      </BrowserRouter>
    </React.StrictMode>
  );