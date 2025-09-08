// src/components/layout/Topbar.jsx
import React from 'react';

const Topbar = () => {
  return (
    <header className="bg-white shadow flex items-center justify-between px-6 py-3">
      <div className="text-lg font-semibold">Dashboard</div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">user@digitizerx.com</span>
        <button className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
          Logout
        </button>
      </div>
    </header>
  );
};

export default Topbar;
