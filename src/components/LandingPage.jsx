import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Settings, Users, FileText, Package, FlaskConical, Scale,
  ChevronLeft, ChevronRight, Menu, UserCheck, QrCode, Search
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import logo from '../assets/logo.png';
import { supabase } from '../utils/supabaseClient';
import { resolveInputToPath } from '../utils/globalResolver';

// ⬇️ Mount once so it controls the yellow HUD everywhere
import DebugOverlayTamer from './common/DebugOverlayTamer';

/** Sidebar module + submodule listing */
const modules = [
  {
    name: 'Masters',
    icon: <Settings size={22} />,
    route: 'masters',
    submodules: [
      'Plant Master',
      'SubPlant Master',
      'Department Master',
      'Area Master',
      'Location Master',
      'Equipment Master',
      'Uom Master'
    ]
  },
  {
    name: 'User Authorization',
    icon: <Users size={22} />,
    route: 'user-authorization',
    submodules: ['User Management', 'Role Management', 'Password Management', 'SuperAdmin Password Reset']
  },
  {
    name: 'Engineering',
    icon: <FlaskConical size={22} />,
    route: 'engineering',
    submodules: [
      'Asset Management',
      'PM Scheduler',
      'Work Orders Management',
      'Inventory Spare Parts Management',
      'Compliance Audit Module',
      'Environmental Monitoring Integration',
      'Breakdown Management' // Added new submodule
    ]
  },
  {
    name: 'HR',
    icon: <UserCheck size={22} />,
    route: 'hr',
    submodules: [
      'HR Dashboard',
      'Leave Management',
      'Attendance Management',
      'Shift Schedule Management',
      'Payroll Management',
      'Paystub Editor',
      'Performance Review',
      'Recruitment Management',
      'Training Management',
      'Employee Self-Service',
      'HR Reports',
      'HR Settings',
      'Announcements',
      'Document Management'
    ]
  },
  {
    name: 'Document Management',
    icon: <FileText size={22} />,
    route: 'document-management',
    submodules: ['Label Master', 'Check List Master']
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
    name: 'Weighing Balance',
    icon: <Scale size={22} />,
    route: 'weighing-balance',
    submodules: [
      'WeightBox Master',
      'StandardWeight Master',
      'Weighing Modules',
      'DailyVerification Log',
      'MonthlyCalibration Log'
    ]
  }
];

// Label → slug (matches ModuleRenderer keys)
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');

const LandingPage = () => {
  const [activeModule, setActiveModule] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const username = session?.user?.email?.split('@')[0] || 'Admin';

  // ===== Global Scan & Lookup (generic) =====
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [attemptedLookup, setAttemptedLookup] = useState(false);

  // NEW: allow/disallow typing toggle (persisted)
  const [manualAllowed, setManualAllowed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dx.manualAllowed') ?? 'true'); }
    catch { return true; }
  });
  useEffect(() => {
    localStorage.setItem('dx.manualAllowed', JSON.stringify(manualAllowed));
  }, [manualAllowed]);

  const [supportsDetector, setSupportsDetector] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const detectorRef = useRef(null);

  useEffect(() => {
    setSupportsDetector(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  useEffect(() => () => stopScan(), []); // stop camera on unmount

  // stop camera when collapsing sidebar or closing on mobile
  useEffect(() => {
    if (collapsed || (!mobileOpen && window.innerWidth < 768)) stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, mobileOpen]);

  // Clear stale lookup errors on any navigation
  useEffect(() => {
    setErr('');
    setAttemptedLookup(false);
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  /** Central route builder */
  const toRoute = (modRoute, sub) =>
    sub === 'Weighing Modules'
      ? '/weighing-balance/weighing-modules'
      : sub === 'DailyVerification Log'
      ? '/weighing-balance/dailyverification-log'
      : sub === 'MonthlyCalibration Log'
      ? '/weighing-balance/monthlycalibration-log'
      : modRoute === 'hr' && sub === 'Document Management'
      ? '/hr/hr-document-management'
      : sub === 'Breakdown Management' // Added route mapping for new submodule
      ? '/engineering/breakdown-management'
      : `/${modRoute}/${slug(sub)}`;

  // Triggered by Enter or clicking "Open"
  const handleLookup = async (raw, source = 'manual') => {
    if (source === 'manual' && !manualAllowed) return;
    const input = String((raw ?? val) || '').trim();
    if (!input) return;
    setErr('');
    setAttemptedLookup(true);
    setBusy(true);
    try {
      const path = await resolveInputToPath(input, supabase);
      if (path) {
        navigate(path);
        setVal('');
        stopScan();
        setAttemptedLookup(false);
      } else {
        setErr('No match found. Try another code or scan.');
      }
    } finally {
      setBusy(false);
    }
  };

  // ===== Inline camera scan (BarcodeDetector) =====
  const startScan = async () => {
    setScanErr('');
    if (!supportsDetector) {
      navigate('/scan'); // fallback to dedicated scan page
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      setScanning(true);

      const tick = async () => {
        if (!scanning || !videoRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const first = codes?.[0];
          const text = first?.rawValue || '';
          if (text) {
            await handleLookup(text, 'scan'); // <-- mark as scanner-originated
            return;
          }
        } catch {
          // ignore frame errors
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setScanErr(e?.message || 'Camera/scan not available');
      setScanning(false);
    }
  };

  const stopScan = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      for (const t of (streamRef.current.getTracks?.() || [])) t.stop();
      streamRef.current = null;
    }
    setScanning(false);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Global HUD controller for the yellow debug overlay */}
      <DebugOverlayTamer />

      {/* Sidebar */}
      <aside
        className={`bg-blue-800 text-white flex flex-col min-w-[16rem] fixed md:relative z-40 h-full transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ width: collapsed ? '5rem' : '16rem' }}
      >
        <div className="flex items-center justify-center p-4 border-b border-white/10">
          {!collapsed && <h2 className="font-bold text-lg">Modules</h2>}
        </div>

        {/* Global Scan & Lookup */}
        {!collapsed && (
          <div className="p-3 border-b border-white/10">
            <div className="text-xs uppercase tracking-wide opacity-80 mb-2 flex items-center gap-1">
              <QrCode size={14} /> Scan &amp; lookup
            </div>

            {manualAllowed ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2 top-2.5 opacity-80" />
                  <input
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup(undefined, 'manual')}
                    placeholder="Enter WO code, equipment ID/serial/UUID, or scan"
                    className="w-full text-sm text-slate-900 placeholder:text-slate-500 pl-7 pr-2 py-1.5 rounded border border-white/20 focus:border-white/40 bg-white"
                    disabled={busy}
                  />
                </div>
                <button
                  onClick={() => handleLookup(undefined, 'manual')}
                  disabled={busy || !val.trim()}
                  className="px-3 py-1.5 rounded bg-white text-blue-800 text-sm hover:bg-blue-50 disabled:opacity-60"
                  title="Open"
                >
                  Open
                </button>
              </div>
            ) : (
              <div className="text-[12px] bg-white/10 rounded p-2">
                Manual typing is <b>disabled</b>. Use the camera scanner or the full-screen scanner.
              </div>
            )}

            {attemptedLookup && err && (
              <div className="text-[11px] mt-2 text-rose-200">{err}</div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={scanning ? stopScan : startScan}
                className="px-3 py-1.5 rounded bg-white text-blue-800 text-sm hover:bg-blue-50"
                title="Scan with camera"
              >
                {scanning ? 'Stop camera' : 'Scan (camera)'}
              </button>
              {!supportsDetector && (
                <button
                  onClick={() => navigate('/scan')}
                  className="px-3 py-1.5 rounded bg-white text-blue-800 text-sm hover:bg-blue-50"
                  title="Open full-screen scanner"
                >
                  Open /scan
                </button>
              )}

              {/* NEW: toggle for allowing typing */}
              <label className="ml-auto text-[12px] flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={manualAllowed}
                  onChange={(e) => setManualAllowed(e.target.checked)}
                />
                Allow typing
              </label>
            </div>

            {scanning && supportsDetector && (
              <div className="mt-3">
                <div className="text-[11px] opacity-80 mb-1">
                  Point the camera at a QR with a UUID/code. You can also type a WO code or equipment ID above.
                </div>
                <video ref={videoRef} className="w-full rounded border border-white/20" playsInline muted autoPlay />
                {scanErr && <div className="text-[11px] mt-2 text-rose-200">{scanErr}</div>}
              </div>
            )}
          </div>
        )}

        {/* Modules nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {modules.map((mod, index) => (
            <div key={mod.name} className="mb-2">
              <Button
                variant="ghost"
                className={`flex items-center w-full px-3 py-2 rounded-lg transition ${
                  activeModule === index ? 'bg-white/20' : ''
                }`}
                onClick={() => setActiveModule(activeModule === index ? null : index)}
              >
                <div className="w-10 flex items-center justify-center">{mod.icon}</div>
                {!collapsed && (
                  <span className="ml-2 text-sm text-white flex-1 text-left">{mod.name}</span>
                )}
              </Button>

              {activeModule === index && !collapsed && (
                <div className="pl-12 mt-1 space-y-1">
                  {mod.submodules.map((sub) => (
                    <div key={`${mod.route}-${sub}`}>
                      <Link
                        to={toRoute(mod.route, sub)}
                        className="block px-2 py-1 text-xs rounded hover:bg-white/10 transition text-white text-left"
                        onClick={() => setMobileOpen(false)}
                      >
                        {sub}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="bg-white/20 hover:bg-white/30 rounded-full transition"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col ml-[16rem] md:ml-0">
        <header className="flex items-center justify-between bg-gray-100 shadow px-4 md:px-6 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="md:hidden"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </Button>

          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="w-16 h-auto" />
              <h1 className="text-2xl font-bold text-blue-700">DigitizerX</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold text-gray-700">{username}</p>
              <p className="text-xs text-gray-500">User</p>
            </div>
            <div className="w-8 h-8 bg-blue-700 text-white flex items-center justify-center rounded-full font-bold">
              {username?.[0]?.toUpperCase() || 'A'}
            </div>
            <Button variant="destructive" onClick={handleLogout} className="px-3 py-1">
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-white overflow-auto">
          <div className="w-full px-4 md:px-8 py-6">
            <Card className="max-w-6xl mx-auto">
              <Outlet />
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;