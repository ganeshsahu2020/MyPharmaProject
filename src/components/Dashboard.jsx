import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAlerts } from '../contexts/AlertContext';

const Dashboard = () => {
  const { session, role, passwordWarning } = useAuth();
  const { alerts } = useAlerts();
  const alertCount = alerts.length;

  const [openModule, setOpenModule] = useState(null);

  const navModules = [
    { name: 'Masters', submodules: ['Plant Master','SubPlant Master','Department Master','Area Master','Location Master','Equipment Master','Uom Master','Product Master','Material Master'] },
    { name: 'User Authorization', submodules: ['User Management','Role Management','Password Management'] },
    { name: 'Document Management', submodules: ['Log Books','Check Lists','Label Master'] },
    { name: 'Material Inward', submodules: ['Gate Entry','Vehicle Inspection','Material Inspection','Weight Capture','GRN Posting','Label Printing','Palletization'] },
    { name: 'Sampling', submodules: ['Area Assignment','Sampling','Stage Out','Relocate to WH'] },
    { name: 'Weighing Balance', submodules: ['WeightBox Master','StandardWeight Master'] }
  ];

  const toggleModule = (idx) => {
    setOpenModule(openModule === idx ? null : idx);
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      {/* ✅ Global Password Warning Banner */}
      {passwordWarning && (
        <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-sm text-center">
          {passwordWarning}
        </div>
      )}

      <div className="w-full px-4 md:px-8 py-6">
        <div className="bg-white rounded-xl shadow p-6 max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-blue-600 mb-4">Dashboard</h1>

          {/* ✅ User Info */}
          {session?.user?.email && (
            <div className="mb-4 bg-gray-50 border rounded p-3">
              <p><strong>Email:</strong> {session.user.email}</p>
              <p><strong>Role:</strong> {role || 'N/A'}</p>
            </div>
          )}

          {/* ✅ Alerts Panel */}
          {alertCount > 0 && (
            <div className="bg-yellow-100 border border-yellow-400 p-3 rounded mb-6">
              <h3 className="font-semibold mb-2">⚠️ Upcoming Stamping Alerts</h3>
              <ul className="list-disc ml-5 text-sm">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <strong>[{a.source}]</strong> {a.weightbox_id} - {a.standard_weight_id || ''} - {a.area || ''} - Due in {a.days_left} days ({a.due_on})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ✅ Navigation */}
          <div className="space-y-3">
            {navModules.map((mod, idx) => (
              <div key={idx} className="border rounded-lg bg-gray-50 shadow-sm">
                <button
                  onClick={() => toggleModule(idx)}
                  className="w-full flex justify-between items-center px-4 py-2 bg-blue-100 rounded-t-lg"
                >
                  <span className="font-bold text-blue-700">{mod.name}</span>
                  <span className="text-blue-600">{openModule === idx ? '−' : '+'}</span>
                </button>

                {openModule === idx && (
                  <div className="p-3 space-y-1">
                    {mod.submodules.map((sub, sidx) => {
                      const path = `/${mod.name.toLowerCase().replace(/\s+/g,'-')}/${sub.toLowerCase().replace(/\s+/g,'-')}`;
                      const isAlerted = (sub === 'WeightBox Master' || sub === 'StandardWeight Master') && alertCount > 0;
                      return (
                        <div key={sidx} className="flex items-center justify-between bg-white rounded px-3 py-1 hover:bg-gray-100">
                          <Link to={path} className="text-blue-600 hover:underline text-sm flex-1">
                            {sub}
                          </Link>
                          {isAlerted && (
                            <span className="ml-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                              {alertCount}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
