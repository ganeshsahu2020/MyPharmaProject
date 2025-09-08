// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

/* Auth & guards */
import AuthGuard from "./components/AuthGuard";

/* Public/auth pages */
import Login from "./components/Login";
import UpdatePassword from "./components/UpdatePassword";

/* Shell & dashboard */
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";

/* Feature pages & deep links */
import InboundFlowPage from "./pages/InboundFlowPage";
import EquipmentDetail from "./pages/EquipmentDetail";
import PMWorkOrderDetail from "./pages/PMWorkOrderDetail";
import ScanPage from "./routes/ScanPage";
import PartDetail from "./pages/PartDetail";
import BinDetail from "./pages/BinDetail";
import PurchaseOrderDetail from "./components/submodules/Procurement/PurchaseOrderDetail.jsx";

/* AI pages */
import AIChatPanel from "./components/AIChatPanel";
import PalletAIReport from "./components/PalletAIReport";

/* Dynamic module renderer */
import ModuleRenderer from "./components/ModuleRenderer";

/* Dev helper (safe in dev only) */
import DebugOverlayTamer from "./components/common/DebugOverlayTamer.jsx";

function App() {
  return (
    <>
      <Toaster position="top-right" />

      <Routes>
        {/* Public/auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/update-password" element={<UpdatePassword />} />

        {/* Public scan route */}
        <Route path="/scan" element={<ScanPage />} />

        {/* Public equipment detail */}
        <Route path="/equipment/:id" element={<EquipmentDetail />} />

        {/* Authenticated app shell */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <LandingPage />
            </AuthGuard>
          }
        >
          {/* Default to /dashboard when inside the shell */}
          <Route index element={<Navigate to="dashboard" replace />} />

          {/* Explicit routes under shell (use relative paths to keep the layout) */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inbound-flow" element={<InboundFlowPage />} />

          {/* AI routes (kept before dynamic :moduleKey so they don't get captured) */}
          <Route
            path="ai"
            element={<AIChatPanel title="DigitizerX • AI Assistant" />}
          />
          <Route path="ai/pallet" element={<PalletAIReport />} />

          {/* PM Work Order detail */}
          <Route path="pm/wo/:ref" element={<PMWorkOrderDetail />} />

          {/* Inventory deep-links */}
          <Route path="inventory/part/:id" element={<PartDetail />} />
          <Route path="inventory/part/by-code/:code" element={<PartDetail />} />
          <Route
            path="inventory/bin/:plant_id/:bin_code"
            element={<BinDetail />}
          />

          {/* Procurement: PO detail/print */}
          <Route
            path="procurement/purchase-order/:poId"
            element={<PurchaseOrderDetail />}
          />

          {/* Dynamic module routes (Procurement, HR, Engineering, etc.) */}
          <Route path=":moduleKey" element={<ModuleRenderer />} />
          <Route path=":moduleKey/:submoduleKey" element={<ModuleRenderer />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Dev-only HUD controller */}
      {import.meta.env.DEV && <DebugOverlayTamer />}
    </>
  );
}

export default App;
