import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UOMProvider } from './contexts/UOMContext';
import { AlertProvider } from './contexts/AlertContext';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthGuard from './components/AuthGuard';
import UpdatePassword from './components/UpdatePassword';
import ModuleRenderer from './components/ModuleRenderer';

const App = () => {
  return (
    <AuthProvider>
      <UOMProvider>
        <AlertProvider>
          <Routes>
            {/* Login Route */}
            <Route path="/login" element={<Login />} />
            {/* Update Password Route */}
            <Route path="/update-password" element={<UpdatePassword />} />
            {/* Authenticated Routes */}
            <Route path="/" element={<AuthGuard><LandingPage /></AuthGuard>}>
              {/* Default Dashboard Route */}
              <Route index element={<Dashboard />} />
              {/* Module and Submodule Routes */}
              <Route path=":moduleKey" element={<ModuleRenderer />} />
              <Route path=":moduleKey/:submoduleKey" element={<ModuleRenderer />} />
            </Route>
            {/* Redirect to Home if no match */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AlertProvider>
      </UOMProvider>
    </AuthProvider>
  );
};

export default App;