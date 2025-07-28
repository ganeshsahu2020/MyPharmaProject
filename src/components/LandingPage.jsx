import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Settings,
  Users,
  FileText,
  Package,
  FlaskConical,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const modules = [
  {
    name: 'Masters',
    icon: <Settings size={22} />,
    route: 'masters',
    submodules: [
      'Plant Master',
      'SubPlant',
      'Department Master',
      'Area Master',
      'Location Master',
      'Equipment Master',
      'Uom Master',
      'Product Master',
      'Material Master'
    ]
  },
  {
    name: 'User Authorization',
    icon: <Users size={22} />,
    route: 'user-authorization',
    submodules: ['User Management', 'Role Management', 'Password Management']
  },
  {
    name: 'Document Management',
    icon: <FileText size={22} />,
    route: 'document-management',
    submodules: ['Log Books', 'Check Lists', 'Label Master']
  },
  {
    name: 'Material Inward',
    icon: <Package size={22} />,
    route: 'material-inward',
    submodules: [
      'Gate Entry',
      'Vehicle Inspection',
      'Material Inspection',
      'Weight Capture',
      'GRN Posting',
      'Label Printing',
      'Palletization'
    ]
  },
  {
    name: 'Sampling',
    icon: <FlaskConical size={22} />,
    route: 'sampling',
    submodules: ['Area Assignment', 'Sampling', 'Stage Out', 'Relocate to WH']
  }
];

const LandingPage = () => {
  const [activeModule, setActiveModule] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        navigate('/login');
      }
      setLoading(false);
    };
    checkSession();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-blue-600 font-medium text-lg">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* ✅ Sidebar */}
      <aside
        className={`bg-blue-900 text-white flex flex-col relative transition-[width] duration-300 ease-in-out`}
        style={{ width: collapsed ? '5rem' : '16rem', minWidth: collapsed ? '5rem' : '16rem' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-blue-800">
          <h2 className={`font-bold text-lg transition-opacity duration-300 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
            Modules
          </h2>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          {modules.map((mod, index) => (
            <div key={index} className="mb-2">
              <button
                onClick={() => setActiveModule(activeModule === index ? null : index)}
                className={`flex items-center w-full px-3 py-2 rounded-lg transition relative group 
                  ${activeModule === index ? 'bg-blue-800' : ''}`}
              >
                <div className="flex items-center justify-center w-6">{mod.icon}</div>
                {!collapsed && <span className="ml-3 text-sm">{mod.name}</span>}
                {collapsed && (
                  <span className="absolute left-16 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                    {mod.name}
                  </span>
                )}
              </button>

              {activeModule === index && (
                <div className="pl-8 mt-1 space-y-1">
                  {mod.submodules.map((sub, idx) => {
                    const routePath = `/${mod.route}/${sub.toLowerCase().replace(/\s+/g, '-')}`;
                    return (
                      <div key={idx} className="relative group">
                        <Link
                          to={routePath}
                          className="block px-2 py-1 text-xs rounded hover:bg-blue-700 transition text-white"
                        >
                          {collapsed ? mod.icon : sub}
                        </Link>
                        {collapsed && (
                          <span className="absolute left-16 top-1/2 -translate-y-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                            {sub}
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

        <div className="p-3 border-t border-blue-800 flex justify-center">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 bg-blue-800 hover:bg-blue-700 rounded-full transition"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>

      {/* ✅ Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between bg-white shadow px-6 py-3">
          <div className="flex-1 flex justify-center">
            <h1 className="text-2xl font-bold text-blue-700">DigitizerX</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm hidden md:block">{session?.user?.email}</span>
            <div className="w-8 h-8 bg-blue-500 text-white flex items-center justify-center rounded-full font-bold">
              {session?.user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-8 flex flex-col items-center bg-gray-50">
          <div className="w-full max-w-6xl">
            <div className="bg-white rounded-xl shadow p-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
