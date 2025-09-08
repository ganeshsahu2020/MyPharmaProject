import React, { Suspense } from 'react';
import { NavLink, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ClipboardList, Truck, PackageSearch } from 'lucide-react';

const GatePassIndex = React.lazy(() => import('./GatePassIndex'));
const GateEntry = React.lazy(() => import('../gateentry/GateEntry'));
const VehicleInspection = React.lazy(() => import('./VehicleInspection'));
const MaterialInspection = React.lazy(() => import('./MaterialInspection'));

const Tab = ({ to, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `px-3 py-2 rounded-md text-sm font-medium border ${
        isActive
          ? 'bg-white text-blue-800 border-blue-200 shadow-sm'
          : 'bg-white/70 text-slate-700 hover:bg-white border-slate-200'
      }`
    }
  >
    {children}
  </NavLink>
);

function Tabs() {
  const { gpNo } = useParams();
  const base = gpNo ? `/${encodeURIComponent(gpNo)}` : '';
  return (
    <div className="bg-white px-3 sm:px-4 py-2.5 border-b flex flex-wrap gap-2">
      <Tab to=".">List</Tab>
      <Tab to={`${base}/gate-entry`}>
        <Truck className="w-4 h-4 inline mr-1" /> Gate Entry
      </Tab>
      <Tab to={`${base}/inspection/vehicle`}>
        <PackageSearch className="w-4 h-4 inline mr-1" /> Vehicle
      </Tab>
      <Tab to={`${base}/inspection/material`}>
        <PackageSearch className="w-4 h-4 inline mr-1" /> Material
      </Tab>
    </div>
  );
}

export default function GatePassManager() {
  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Material Inward</div>
          <span className="ml-auto text-xs opacity-90">Gate Entry • Vehicle • Material</span>
        </div>
        <Tabs />
      </div>

      <Suspense fallback={<div className="text-sm text-slate-500 px-2">Loading…</div>}>
        <Routes>
          {/* index shows list */}
          <Route index element={<GatePassIndex />} />
          {/* with param */}
          <Route path=":gpNo/gate-entry" element={<GateEntry />} />
          <Route path=":gpNo/inspection/vehicle" element={<VehicleInspection />} />
          <Route path=":gpNo/inspection/material" element={<MaterialInspection />} />
          {/* legacy no-param routes still usable */}
          <Route path="gate-entry" element={<GateEntry />} />
          <Route path="inspection/vehicle" element={<VehicleInspection />} />
          <Route path="inspection/material" element={<MaterialInspection />} />
          {/* fallback */}
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
