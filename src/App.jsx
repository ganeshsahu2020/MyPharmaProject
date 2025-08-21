// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AuthGuard from './components/AuthGuard';
import UpdatePassword from './components/UpdatePassword';
import ModuleRenderer from './components/ModuleRenderer';
import EquipmentDetail from './pages/EquipmentDetail';
import PMWorkOrderDetail from './pages/PMWorkOrderDetail';
import ScanPage from './routes/ScanPage';

import PartDetail from './pages/PartDetail';   // ← new
import BinDetail from './pages/BinDetail';     // ← new

import { UOMProvider } from './contexts/UOMContext'; // ← wrap everything

export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <UOMProvider>
        <Routes>
          {/* Public/auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/update-password" element={<UpdatePassword />} />

          {/* Public scan route (keep public, or move into AuthGuard if desired) */}
          <Route path="/scan" element={<ScanPage />} />

          {/* Equipment detail by internal id (public) */}
          <Route path="/equipment/:id" element={<EquipmentDetail />} />

          {/* Authenticated app shell */}
          <Route path="/" element={<AuthGuard><LandingPage /></AuthGuard>}>
            <Route index element={<Dashboard />} />

            {/* PM Work Order detail (HR code or UUID) */}
            <Route path="pm/wo/:ref" element={<PMWorkOrderDetail />} />

            {/* Inventory deep-links (from labels / scanner) */}
            <Route path="inventory/part/:id" element={<PartDetail />} />
            <Route path="inventory/part/by-code/:code" element={<PartDetail />} />
            <Route path="inventory/bin/:plant_id/:bin_code" element={<BinDetail />} />

            {/* Dynamic module routes */}
            <Route path=":moduleKey" element={<ModuleRenderer />} />
            <Route path=":moduleKey/:submoduleKey" element={<ModuleRenderer />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UOMProvider>
    </>
  );
}
