// src/components/submodules/weighingbalance/DailyVerificationLog.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import {
  ArrowLeft, Building2, GitBranch, Layers, MapPin, Scale, Calendar,
  Save, Trash2, CheckCircle, User, ShieldCheck, Ban, Archive,
  ClipboardList, FileDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../utils/supabaseClient';
import logo from '../../../assets/logo.png';

/* ─────────────────────────────
   Constants / helpers
   ───────────────────────────── */
const BACK_TARGET = '/dashboard';
const todayYMD = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

const asNum = (v, def = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};
const asFixed = (v, d) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : Number(0).toFixed(d));
const stepFromDigits = (d) => (d > 0 ? `0.${'0'.repeat(Math.max(d - 1, 0))}1` : '1');

/* ─────────────────────────────
   Small UI bits
   ───────────────────────────── */
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`} role="status" aria-label="loading" />
);

const FieldShell = ({ icon: Icon, colorClass = 'text-indigo-600', children }) => (
  <div className="relative">
    <Icon className={`absolute left-2 top-2 ${colorClass}`} size={18} />
    <div className="pl-8">{children}</div>
  </div>
);

const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div className="p-4 text-red-600">
    <h2 className="text-2xl font-bold">Something went wrong!</h2>
    <p className="mt-1">{error?.message || 'Unknown error'}</p>
    <button onClick={resetErrorBoundary} className="mt-3 bg-blue-600 text-white px-4 py-2 rounded">
      Try Again
    </button>
  </div>
);

/* ─────────────────────────────
   Component
   ───────────────────────────── */
const DailyVerificationLog = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // auth/session
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [userManagement, setUserManagement] = useState(null);
  const authSubRef = useRef(null); // store auth subscription for safe cleanup

  // masters
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [balances, setBalances] = useState([]);
  const [areaNames, setAreaNames] = useState({});
  const [availableUsers, setAvailableUsers] = useState([]);

  // selections
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedSubplant, setSelectedSubplant] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedBalance, setSelectedBalance] = useState(null);

  // verification
  const [leastCountDigits, setLeastCountDigits] = useState(3);
  const [checklist, setChecklist] = useState([]);
  const [verificationLevels, setVerificationLevels] = useState([]);
  const [weightBoxes, setWeightBoxes] = useState([]);
  const [standardWeights, setStandardWeights] = useState([]);
  const [bdvData, setBdvData] = useState([]);

  const [isSaved, setIsSaved] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifierUserId, setVerifierUserId] = useState('');
  const [logData, setLogData] = useState(null);
  const [logId, setLogId] = useState(null);

  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [showLogbook, setShowLogbook] = useState(false);
  const [exporting, setExporting] = useState(false);

  const logbookRef = useRef(null);

  const checklistItems = [
    'Visual inspection for damage',
    'Cleanliness of balance, pan, and chamber',
    'Stable placement and environmental conditions',
    'Leveling adjustment',
    'Power stability and warm-up completion',
    'Zero/tare function check',
    'Internal calibration (if applicable)'
  ];

  /* ───── bootstrapping auth and static data ───── */
  useEffect(() => {
    const init = async () => {
      const { data: { session: ses } } = await supabase.auth.getSession();
      setSession(ses || null);
      if (ses?.user?.id) {
        const { data: um } = await supabase
          .from('user_management')
          .select('id,first_name,last_name,email,auth_uid')
          .eq('auth_uid', ses.user.id)
          .single();
        if (um) {
          setUserManagement(um);
          await loadStatic(um.id);
        } else {
          setErrorMessage('User not found in user_management. Contact admin.');
        }
      }
      setCheckingSession(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, newSession) => {
      setSession(newSession || null);
      if (newSession?.user?.id) {
        const { data: um } = await supabase
          .from('user_management')
          .select('id,first_name,last_name,email,auth_uid')
          .eq('auth_uid', newSession.user.id)
          .single();
        if (um) {
          setUserManagement(um);
          await loadStatic(um.id);
        }
      } else {
        setUserManagement(null);
      }
    });
    authSubRef.current = sub;

    return () => {
      try {
        authSubRef.current?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  const loadStatic = async (currentUserId) => {
    try {
      setLoading(true);
      await toast.promise(
        (async () => {
          const [{ data: plantData }, { data: areaAll }] = await Promise.all([
            supabase.from('plant_master').select('id,description').eq('status', 'Active'),
            supabase.from('area_master').select('id,area_name').eq('status', 'Active')
          ]);
          setPlants(plantData || []);
          setAreaNames((areaAll || []).reduce((acc, a) => ({ ...acc, [a.id]: a.area_name }), {}));

          const [{ data: boxes }, { data: bdv }] = await Promise.all([
            supabase.from('weightbox_master').select('weightbox_id,weightbox_type,status').eq('status', 'Active'),
            supabase
              .from('balance_daily_verification')
              .select(
                'id,balance_uid,std_weight_no,standard_weight,set_limit,operating_range_kg,min_operating_range,max_operating_range'
              )
          ]);
          setWeightBoxes(boxes || []);
          setBdvData(bdv || []);

          let q = supabase.from('user_management').select('id,email').eq('status', 'Active');
          if (currentUserId) q = q.neq('id', currentUserId);
          const { data: users } = await q;
          setAvailableUsers(users || []);

          // static weights for dropdowns
          setStandardWeights([
            { id: 'SS-SW-005', weight: 1.0, weightbox_id: 'SWB-001', description: 'SS-SW-005 - 1.000 kg' },
            { id: 'SS-SW-004', weight: 0.5, weightbox_id: 'SWB-001', description: 'SS-SW-004 - 0.500 kg' },
            { id: 'SS-SW-006', weight: 2.0, weightbox_id: 'SWB-001', description: 'SS-SW-006 - 2.000 kg' },
            { id: 'SS-SW-018', weight: 1.0, weightbox_id: 'SWB-002', description: 'SS-SW-018 - 1.000 kg' },
            { id: 'SS-SW-019', weight: 2.0, weightbox_id: 'SWB-002', description: 'SS-SW-019 - 2.000 kg' },
            { id: 'SS-SW-022', weight: 20.0, weightbox_id: 'SWB-001', description: 'SS-SW-022 - 20.000 kg' },
            { id: 'SS-SW-023', weight: 20.0, weightbox_id: 'SWB-001', description: 'SS-SW-023 - 20.000 kg' },
            { id: 'SS-SW-024', weight: 20.0, weightbox_id: 'SWB-001', description: 'SS-SW-024 - 20.000 kg' },
            { id: 'SS-SW-025', weight: 20.0, weightbox_id: 'SWB-002', description: 'SS-SW-025 - 20.000 kg' },
            { id: 'SS-SW-033', weight: 20.0, weightbox_id: 'SWB-002', description: 'SS-SW-033 - 20.000 kg' },
            { id: 'SS-SW-045', weight: 20.0, weightbox_id: 'SWB-003', description: 'SS-SW-045 - 20.000 kg' },
            { id: 'SS-SW-046', weight: 20.0, weightbox_id: 'SWB-003', description: 'SS-SW-046 - 20.000 kg' }
          ]);
        })(),
        { success: 'Ready', error: 'Load failed' }
      );
    } finally {
      setLoading(false);
    }
  };

  /* ───── cascades ───── */
  const handlePlantSelect = (e) => {
    const id = `${e.target.value || ''}`.trim();
    setSelectedPlant(id);
    setSelectedSubplant(''); setSelectedDepartment(''); setSelectedArea(''); setSelectedBalance(null);
    setSubplants([]); setDepartments([]); setAreas([]); setBalances([]);
    if (id) fetchSubplants(id);
  };
  const handleSubplantSelect = (e) => {
    const id = `${e.target.value || ''}`.trim();
    setSelectedSubplant(id);
    setSelectedDepartment(''); setSelectedArea(''); setSelectedBalance(null);
    setDepartments([]); setAreas([]); setBalances([]);
    if (id) fetchDepartments(id);
  };
  const handleDepartmentSelect = (e) => {
    const id = `${e.target.value || ''}`.trim();
    setSelectedDepartment(id);
    setSelectedArea(''); setSelectedBalance(null);
    setAreas([]); setBalances([]);
    if (id) fetchAreas(id);
  };
  const handleAreaSelect = (e) => {
    const id = `${e.target.value || ''}`.trim();
    setSelectedArea(id);
    setSelectedBalance(null); setBalances([]);
    if (id) fetchBalances(id);
  };

  const fetchSubplants = async (plantId) => {
    if (!plantId) return;
    await toast.promise(
      (async () => {
        const { data } = await supabase
          .from('subplant_master')
          .select('id,subplant_name')
          .eq('plant_uid', plantId)
          .eq('status', 'Active');
        setSubplants(data || []);
      })(),
      { success: 'Subplants ready', error: 'Failed to fetch subplants', loading: 'Loading subplants…' }
    );
  };
  const fetchDepartments = async (subplantId) => {
    if (!subplantId) return;
    await toast.promise(
      (async () => {
        const { data } = await supabase
          .from('department_master')
          .select('id,department_name')
          .eq('subplant_uid', subplantId)
          .eq('status', 'Active');
        setDepartments(data || []);
      })(),
      { success: 'Departments ready', error: 'Failed to fetch departments', loading: 'Loading departments…' }
    );
  };
  const fetchAreas = async (deptId) => {
    if (!deptId) return;
    await toast.promise(
      (async () => {
        const { data } = await supabase
          .from('area_master')
          .select('id,area_name')
          .eq('department_uid', deptId)
          .eq('status', 'Active');
        setAreas(data || []);
      })(),
      { success: 'Areas ready', error: 'Failed to fetch areas', loading: 'Loading areas…' }
    );
  };
  const fetchBalances = async (areaId) => {
    if (!areaId) return;
    await toast.promise(
      (async () => {
        const { data } = await supabase
          .from('weighing_balance_master')
          .select(
            'id,balance_id,description,balance_type,capacity,model,status,min_operating_capacity,max_operating_capacity,least_count_digits,area_uid'
          )
          .eq('area_uid', areaId)
          .eq('status', 'Active');
        setBalances(data || []);
      })(),
      { success: 'Balances ready', error: 'Failed to fetch balances', loading: 'Loading balances…' }
    );
  };

  const handleBalanceSelect = (e) => {
    const bid = e.target.value;
    const bal = balances.find((x) => x.balance_id === bid) || null;
    setSelectedBalance(bal);
    setLeastCountDigits(asNum(bal?.least_count_digits, 3));
    setIsSaved(false); setIsVerified(false); setShowLogbook(false); setLogId(null);
    seedLevels(bal);
  };

  const seedLevels = async (bal) => {
    const initials = userManagement ? `${userManagement.first_name?.[0] || ''}${userManagement.last_name?.[0] || ''}` : '';
    setChecklist(checklistItems.map((cp) => ({ checkpoint: cp, status: '', remarks: '', initials })));
    if (!bal) return;

    await toast.promise(
      (async () => {
        const { data: rows } = await supabase
          .from('daily_verification_log')
          .select('*')
          .eq('balance_id', bal.id)
          .eq('verification_status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);

        if (rows?.length) {
          const log = rows[0];
          setLogId(log.id);
          setChecklist(JSON.parse(log.checklist || '[]') || []);
          const vr = JSON.parse(log.verification_results || '[]') || [];
          setVerificationLevels(
            vr.map((v) => ({
              ...v,
              selectedWeightBoxes: v.selectedWeightBoxes || [],
              selectedWeights: v.selectedWeights || [],
              weightBoxDescriptions: (v.selectedWeightBoxes || [])
                .map((id) => weightBoxes.find((wb) => wb.weightbox_id === id)?.weightbox_id || 'N/A')
                .join(', '),
              standardWeightDescriptions: (v.selectedWeights || [])
                .map((id) => standardWeights.find((sw) => sw.id === id)?.description || 'N/A')
                .join(', ')
            }))
          );
          setIsSaved(true);
        } else {
          let levels = (bdvData || []).filter((d) => d.balance_uid === bal.id);
          if (!levels.length) {
            const cap = asNum(bal.capacity, 0);
            if (cap) {
              levels = [
                { standard_weight: 0.001 * cap, min_operating_range: asNum(bal.min_operating_capacity, 0), max_operating_range: asNum(bal.max_operating_capacity, 0) },
                { standard_weight: 0.3 * cap, min_operating_range: 0.3 * cap - 0.1 * cap * 0.001, max_operating_range: 0.3 * cap + 0.1 * cap * 0.001 },
                { standard_weight: 0.8 * cap, min_operating_range: 0.8 * cap - 0.1 * cap * 0.001, max_operating_range: 0.8 * cap + 0.1 * cap * 0.001 }
              ].filter((l) => Number.isFinite(l.standard_weight));
            }
          }
          setVerificationLevels(
            (levels || []).map((l) => ({
              ...l,
              standard_weight: asNum(l.standard_weight, 0),
              min_operating_range: asNum(l.min_operating_range, 0),
              max_operating_range: asNum(l.max_operating_range, 0),
              selectedWeightBoxes: [],
              selectedWeights: [],
              weightBoxDescriptions: '',
              standardWeightDescriptions: '',
              capturedWeight: '',
              result: '',
              remarks: ''
            }))
          );
        }
      })(),
      { success: 'Ready to record', error: 'Failed to initialize verification', loading: 'Preparing…' }
    );
  };

  const updateChecklist = (idx, field, val) => {
    const next = [...checklist]; next[idx][field] = val; setChecklist(next);
    if (field === 'status' && val === 'Not OK') setErrorMessage('Checklist item not OK. Resolve before proceeding.');
    else setErrorMessage('');
  };

  const updateLevel = (idx, field, val) => {
    const next = [...verificationLevels]; next[idx][field] = val;
    if (field === 'capturedWeight') {
      const w = asNum(val, null),
        min = asNum(next[idx].min_operating_range, null),
        max = asNum(next[idx].max_operating_range, null);
      next[idx].result = w !== null && min !== null && max !== null && w >= min && w <= max ? 'Pass' : 'Fail';
      if (next[idx].result === 'Fail') toast.error('Reading out of tolerance. Recheck or recalibrate.');
    }
    if (field === 'selectedWeightBoxes' || field === 'selectedWeights') {
      const bx = (field === 'selectedWeightBoxes' ? val : next[idx].selectedWeightBoxes) || [];
      const ws = (field === 'selectedWeights' ? val : next[idx].selectedWeights) || [];
      next[idx].weightBoxDescriptions = bx
        .map((id) => weightBoxes.find((wb) => wb.weightbox_id === id)?.weightbox_id || 'N/A')
        .join(', ');
      next[idx].standardWeightDescriptions = ws
        .map((id) => standardWeights.find((sw) => sw.id === id)?.description || 'N/A')
        .join(', ');
    }
    setVerificationLevels(next);
  };
  const handleWeightBoxesChange = (i, e) => {
    const options = Array.from(e.target.options).filter((o) => o.selected).map((o) => o.value);
    updateLevel(i, 'selectedWeightBoxes', options);
  };
  const handleWeightsChange = (i, e) => {
    const options = Array.from(e.target.options).filter((o) => o.selected).map((o) => o.value);
    updateLevel(i, 'selectedWeights', options);
  };
  const getAvailableWeights = (selectedBoxes) => standardWeights.filter((w) => selectedBoxes.includes(w.weightbox_id));

  /* ───── actions ───── */
  const savePrimary = async () => {
    if (!userManagement) { setErrorMessage('User not found in user_management.'); return; }
    if (!selectedBalance) { setErrorMessage('Select a balance.'); return; }
    if (checklist.some((i) => i.status !== 'OK')) { toast.error('All checklist items must be OK.'); return; }
    if (verificationLevels.some((l) => !l.capturedWeight || l.result !== 'Pass')) { toast.error('All weight checks must pass.'); return; }

    await toast.promise(
      (async () => {
        const payload = {
          balance_id: selectedBalance.id,
          department: selectedDepartment,
          area: selectedArea,
          date: todayYMD(),
          user_id: userManagement.id,
          checklist: JSON.stringify(checklist),
          initial_reading: null, tare_reading: null,
          standard_weights: JSON.stringify(
            verificationLevels.map((v) => ({
              standard_weight: v.standard_weight, selectedWeightBoxes: v.selectedWeightBoxes, selectedWeights: v.selectedWeights
            }))
          ),
          verification_results: JSON.stringify(
            verificationLevels.map((v) => ({
              standard_weight: v.standard_weight,
              capturedWeight: v.capturedWeight || '',
              selectedWeightBoxes: v.selectedWeightBoxes || [],
              selectedWeights: v.selectedWeights || [],
              result: v.result,
              remarks: v.remarks || ''
            }))
          ),
          verification_status: 'pending'
        };
        const { data } = await supabase.from('daily_verification_log').insert(payload).select().single();
        setVerificationLevels(
          verificationLevels.map((v) => ({
            ...v,
            weightBoxDescriptions: (v.selectedWeightBoxes || [])
              .map((id) => weightBoxes.find((wb) => wb.weightbox_id === id)?.weightbox_id || 'N/A')
              .join(', '),
            standardWeightDescriptions: (v.selectedWeights || [])
              .map((id) => standardWeights.find((sw) => sw.id === id)?.description || 'N/A')
              .join(', ')
          }))
        );
        setLogId(data.id); setIsSaved(true);
      })(),
      { success: 'Saved. Awaiting secondary verification.', error: 'Save failed', loading: 'Saving…' }
    );
  };

  const verifySecondary = async () => {
    if (!userManagement) { setErrorMessage('User not found in user_management.'); return; }
    if (!selectedBalance) { setErrorMessage('Select a balance first.'); return; }
    if (!verifierUserId) { toast.error('Please select a verifier.'); return; }

    await toast.promise(
      (async () => {
        let id = logId;
        if (!id) {
          const { data: rows } = await supabase
            .from('daily_verification_log')
            .select('id')
            .eq('balance_id', selectedBalance.id)
            .eq('verification_status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);
          if (!rows?.length) throw new Error('No pending verification found.');
          id = rows[0].id;
        }
        const { data: updated } = await supabase
          .from('daily_verification_log')
          .update({ secondary_verifier_id: verifierUserId, verification_status: 'verified', updated_at: new Date().toISOString() })
          .eq('id', id).eq('verification_status', 'pending').select('*').single();

        const savedChecklist = JSON.parse(updated.checklist || '[]') || [];
        const vr = JSON.parse(updated.verification_results || '[]') || [];

        const [{ data: userRow }, { data: verRows }] = await Promise.all([
          supabase.from('user_management').select('first_name,last_name,email').eq('id', updated.user_id).limit(1),
          supabase.from('user_management').select('first_name,last_name,email').eq('id', updated.secondary_verifier_id).limit(1)
        ]);

        setChecklist(savedChecklist);
        setVerificationLevels(
          vr.map((v) => ({
            ...v,
            selectedWeightBoxes: v.selectedWeightBoxes || [],
            selectedWeights: v.selectedWeights || [],
            weightBoxDescriptions: (v.selectedWeightBoxes || [])
              .map((id) => weightBoxes.find((wb) => wb.weightbox_id === id)?.weightbox_id || 'N/A')
              .join(', '),
            standardWeightDescriptions: (v.selectedWeights || [])
              .map((id) => standardWeights.find((sw) => sw.id === id)?.description || 'N/A')
              .join(', ')
          }))
        );
        setIsVerified(true); setShowLogbook(true);
        setLogData({ ...updated, user: (userRow?.[0] || {}), verifier: (verRows?.[0] || null) });
        setLogId(id);
      })(),
      { success: 'Verification complete.', error: 'Verification failed', loading: 'Verifying…' }
    );
  };

  const deleteLog = async () => {
    if (!logId) return;
    await toast.promise(
      (async () => {
        await supabase.from('daily_verification_log').delete().eq('id', logId);
        clearForm();
      })(),
      { success: 'Log deleted.', error: 'Delete failed', loading: 'Deleting…' }
    );
  };

  const clearForm = () => {
    setSelectedPlant(''); setSelectedSubplant(''); setSelectedDepartment(''); setSelectedArea('');
    setSubplants([]); setDepartments([]); setAreas([]); setBalances([]);
    setSelectedBalance(null);
    setChecklist([]); setVerificationLevels([]);
    setIsSaved(false); setIsVerified(false); setShowLogbook(false); setLogData(null); setLogId(null);
    setSelectedDate(todayYMD()); setErrorMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchLogByDate = async () => {
    if (!selectedBalance) { setErrorMessage('Please select a balance first.'); return; }
    await toast.promise(
      (async () => {
        const { data } = await supabase
          .from('daily_verification_log')
          .select(`
            *,
            user:user_id(first_name,last_name,email),
            verifier:secondary_verifier_id(first_name,last_name,email)
          `)
          .eq('balance_id', selectedBalance.id)
          .eq('date', selectedDate)
          .eq('verification_status', 'verified')
          .order('created_at', { ascending: false })
          .limit(1);
        if (data?.length) {
          const log = data[0];
          setChecklist(JSON.parse(log.checklist || '[]') || []);
          const vr = JSON.parse(log.verification_results || '[]') || [];
          setVerificationLevels(
            vr.map((v) => ({
              ...v,
              selectedWeightBoxes: v.selectedWeightBoxes || [],
              selectedWeights: v.selectedWeights || [],
              weightBoxDescriptions: (v.selectedWeightBoxes || [])
                .map((id) => weightBoxes.find((wb) => wb.weightbox_id === id)?.weightbox_id || 'N/A')
                .join(', '),
              standardWeightDescriptions: (v.selectedWeights || [])
                .map((id) => standardWeights.find((sw) => sw.id === id)?.description || 'N/A')
                .join(', ')
            }))
          );
          setLogData(log); setShowLogbook(true); setIsVerified(true);
        } else {
          setShowLogbook(false); setIsVerified(false);
          throw new Error('No verified log found for the selected date.');
        }
      })(),
      { success: 'Log loaded.', error: (e) => e.message, loading: 'Fetching log…' }
    );
  };

  /* ───── PDF export (jsPDF + autotable) ───── */
  const exportToPdf = async () => {
    if (exporting) return;
    if (!logbookRef.current) { toast.error('Nothing to export'); return; }
    setExporting(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);

      // image helper
      const toDataURL = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth || img.width;
              c.height = img.naturalHeight || img.height;
              c.getContext('2d').drawImage(img, 0, 0);
              resolve(c.toDataURL('image/png'));
            } catch (e) {
              resolve(null);
            }
          };
          img.onerror = reject;
          img.src = src;
        });

      const logoData = await toDataURL(logo).catch(() => null);

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 10;

      // Header
      if (logoData) doc.addImage(logoData, 'PNG', margin, 10, 10, 10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('DigitizerX', margin + (logoData ? 14 : 0) + 6, 18);

      doc.setFontSize(13);
      doc.text('Daily Verification Log', pageW / 2, 22, { align: 'center' });

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const metaX = pageW - margin;
      doc.text('Document No: WBL-VER-XXX', metaX, 12, { align: 'right' });
      doc.text('Version: 1.0', metaX, 17, { align: 'right' });
      doc.text(`Effective Date: ${selectedDate}`, metaX, 22, { align: 'right' });

      // Balance/context
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      let y = 30;
      const line = (label, val, x) => {
        doc.setFont('helvetica', 'bold'); doc.text(`${label}`, x, y);
        doc.setFont('helvetica', 'normal'); doc.text(` ${val ?? '-'}`, x + doc.getTextWidth(label), y);
      };
      line('Balance ID:', selectedBalance?.balance_id || '-', margin);
      line('Model:', selectedBalance?.model || '-', pageW / 2);
      y += 6;
      line('Area:', areaNames?.[selectedArea] || selectedArea || '-', margin);
      line('Capacity:', `${selectedBalance?.capacity ?? '-'} kg`, pageW / 2);
      y += 6;
      line('Date:', selectedDate, margin);
      y += 4;

      // Checklist table
      const checklistBody = (checklist || []).map((c, i) => [
        String(i + 1),
        c.checkpoint || '',
        c.status || '',
        c.remarks || '',
        c.initials || ''
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Sr. No.', 'Checkpoint', 'OK/Not OK', 'Remarks', 'Initials']],
        body: checklistBody,
        styles: { font: 'helvetica', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 2 },
        headStyles: { fillColor: [243, 244, 246], textColor: [15, 23, 42], halign: 'center' },
        columnStyles: { 1: { halign: 'left' } },
        theme: 'grid',
        margin: { left: margin, right: margin }
      });

      // Weight checks table
      const tY = (doc.lastAutoTable?.finalY || y) + 6;
      const fmt = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n.toFixed(leastCountDigits || 0) : '';
      };

      const weightBody = (verificationLevels || []).map((v, i) => [
        String(i + 1),
        fmt(v.standard_weight),
        v.weightBoxDescriptions || 'N/A',
        v.standardWeightDescriptions || 'N/A',
        v.capturedWeight ? fmt(v.capturedWeight) : '',
        v.result || '',
        v.result || ''
      ]);

      autoTable(doc, {
        startY: tY,
        head: [['Sr. No.', 'Standard Weight (kg)', 'Weight Box', 'Standard Weight', 'Captured Weight', 'Result', 'Status']],
        body: weightBody,
        styles: { font: 'helvetica', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 2 },
        headStyles: { fillColor: [243, 244, 246], textColor: [15, 23, 42], halign: 'center' },
        columnStyles: { 2: { halign: 'left' }, 3: { halign: 'left' } },
        theme: 'grid',
        margin: { left: margin, right: margin }
      });

      // Footer
      const fY = (doc.lastAutoTable?.finalY || tY) + 8;
      const doneBy = logData?.user
        ? `${logData.user.first_name || ''} ${logData.user.last_name || ''}`.trim()
        : userManagement
        ? `${userManagement.first_name || ''} ${userManagement.last_name || ''}`.trim()
        : '';
      const checkedBy = logData?.verifier ? `${logData.verifier.first_name || ''} ${logData.verifier.last_name || ''}`.trim() : '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(`Done By: ${doneBy || '-'}   |   Checked By: ${checkedBy || '-'}`, pageW / 2, fY, { align: 'center' });
      doc.setFontSize(9);
      doc.text('Confidential - For Internal Use Only', pageW / 2, fY + 6, { align: 'center' });

      doc.save(`DigitizerX_DailyVerification_${selectedDate}.pdf`);
      toast.success('PDF saved.');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  };

  /* ───── Back handler: cleanup → navigate (no window.location) ───── */
  const handleBack = () => {
    clearForm(); // stop any pending UI updates
    try { authSubRef.current?.subscription?.unsubscribe?.(); } catch {}
    requestAnimationFrame(() => navigate(BACK_TARGET));
  };

  /* ───── auth gating ───── */
  if (checkingSession) {
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" /><Skeleton className="h-6 w-56" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="p-5">
        <h2 className="text-2xl font-bold mb-4">Login Required</h2>
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={['google', 'github']} redirectTo={window.location.origin} />
      </div>
    );
  }

  /* ───── UI ───── */
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[location.pathname]}>
      <div className="p-5 font-sans">
        {/* Back */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={loading || exporting}
            className="inline-flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        <div className="border border-gray-200 p-6 rounded-lg">
          {/* Page title (branding added only inside the PDF) */}
          <h1 className="text-xl font-bold mb-4">Daily Verification Log</h1>

          {/* Filter grid with ONE icon per field */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block">Plant</label>
              <FieldShell icon={Building2} colorClass="text-indigo-600">
                <select value={selectedPlant} onChange={handlePlantSelect} className="w-full p-2 border rounded">
                  <option value="">Select Plant</option>
                  {plants.map((p) => (<option key={p.id} value={p.id}>{p.description}</option>))}
                </select>
              </FieldShell>
            </div>
            <div>
              <label className="mb-1 block">Subplant</label>
              <FieldShell icon={GitBranch} colorClass="text-emerald-600">
                <select value={selectedSubplant} onChange={handleSubplantSelect} className="w-full p-2 border rounded" disabled={!selectedPlant}>
                  <option value="">Select Subplant</option>
                  {subplants.map((sp) => (<option key={sp.id} value={sp.id}>{sp.subplant_name}</option>))}
                </select>
              </FieldShell>
            </div>
            <div>
              <label className="mb-1 block">Department</label>
              <FieldShell icon={Layers} colorClass="text-cyan-600">
                <select value={selectedDepartment} onChange={handleDepartmentSelect} className="w-full p-2 border rounded" disabled={!selectedSubplant}>
                  <option value="">Select Department</option>
                  {departments.map((d) => (<option key={d.id} value={d.id}>{d.department_name}</option>))}
                </select>
              </FieldShell>
            </div>
            <div>
              <label className="mb-1 block">Area</label>
              <FieldShell icon={MapPin} colorClass="text-rose-600">
                <select value={selectedArea} onChange={handleAreaSelect} className="w-full p-2 border rounded" disabled={!selectedDepartment}>
                  <option value="">Select Area</option>
                  {areas.map((a) => (<option key={a.id} value={a.id}>{a.area_name}</option>))}
                </select>
              </FieldShell>
            </div>
            <div>
              <label className="mb-1 block">Weighing Balance</label>
              <FieldShell icon={Scale} colorClass="text-blue-600">
                <select
                  value={selectedBalance?.balance_id || ''}
                  onChange={handleBalanceSelect}
                  className="w-full p-2 border rounded"
                  disabled={!selectedArea}
                >
                  <option value="">Select</option>
                  {balances
                    .filter((b) => !selectedArea || b.area_uid === selectedArea)
                    .map((b) => (
                      <option key={b.id} value={b.balance_id}>
                        {b.balance_id} - {b.description} ({b.capacity} kg)
                      </option>
                    ))}
                </select>
              </FieldShell>
              {selectedBalance && (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <ClipboardList size={14} className="text-slate-500" />
                  {selectedBalance.status === 'Active' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-800">
                      <ShieldCheck size={14} />Active
                    </span>
                  )}
                  {selectedBalance.status === 'Out of Service' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800">
                      <Ban size={14} />Out of Service
                    </span>
                  )}
                  {selectedBalance.status === 'Retired' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-200 text-gray-800">
                      <Archive size={14} />Retired
                    </span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block">View by Date</label>
              <FieldShell icon={Calendar} colorClass="text-violet-600">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </FieldShell>
              <button
                onClick={fetchLogByDate}
                className="mt-2 bg-blue-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
              >
                <Calendar size={16} /> View Log
              </button>
            </div>
          </div>

          {/* Loading spinner */}
          {loading && (
            <div className="mt-4 flex justify-center">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          )}

          {/* Checklist + Levels */}
          {selectedBalance && !loading && (
            <>
              <h2 className="text-lg font-semibold mt-6">Checklist</h2>
              <table className="w-full border-collapse mt-2">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-center">Sr. No.</th>
                    <th className="border p-2 text-center">Checkpoint</th>
                    <th className="border p-2 text-center">OK/Not OK</th>
                    <th className="border p-2 text-center">Remarks</th>
                    <th className="border p-2 text-center">Initials</th>
                  </tr>
                </thead>
                <tbody>
                  {checklist.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2 text-center">{index + 1}</td>
                      <td className="border p-2">{item.checkpoint}</td>
                      <td className="border p-2 text-center">
                        <select
                          value={item.status}
                          onChange={(e) => updateChecklist(index, 'status', e.target.value)}
                          className="w-full p-1 border rounded text-center"
                        >
                          <option value="">Select</option>
                          <option value="OK">OK</option>
                          <option value="Not OK">Not OK</option>
                        </select>
                      </td>
                      <td className="border p-2 text-center">
                        <input
                          type="text"
                          value={item.remarks}
                          onChange={(e) => updateChecklist(index, 'remarks', e.target.value)}
                          className="w-full p-1 border rounded text-center"
                        />
                      </td>
                      <td className="border p-2 text-center">{item.initials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="text-lg font-semibold mt-6">Weight Checks</h2>
              {verificationLevels.map((level, index) => (
                <div key={index} className="mt-4 p-4 border rounded">
                  <h3 className="text-base font-semibold">
                    Std No. {index + 1}: Standard Weight {asFixed(level.standard_weight, leastCountDigits)} kg
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1">Select Weight Box</label>
                      <FieldShell icon={Scale} colorClass="text-green-600">
                        <select
                          multiple
                          value={level.selectedWeightBoxes || []}
                          onChange={(e) => handleWeightBoxesChange(index, e)}
                          className="w-full p-2 border rounded text-center"
                        >
                          {weightBoxes.map((box) => (
                            <option key={box.weightbox_id} value={box.weightbox_id}>
                              {box.weightbox_id}
                            </option>
                          ))}
                        </select>
                      </FieldShell>
                      <p className="mt-1 text-sm text-gray-600">Selected: {level.weightBoxDescriptions || 'None'}</p>
                    </div>
                    <div>
                      <label className="block mb-1">Select Standard Weights</label>
                      <FieldShell icon={Scale} colorClass="text-green-600">
                        <select
                          multiple
                          value={level.selectedWeights || []}
                          onChange={(e) => handleWeightsChange(index, e)}
                          className="w-full p-2 border rounded text-center"
                        >
                          {getAvailableWeights(level.selectedWeightBoxes || []).map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.description}
                            </option>
                          ))}
                        </select>
                      </FieldShell>
                      <p className="mt-1 text-sm text-gray-600">Selected: {level.standardWeightDescriptions || 'None'}</p>
                    </div>
                    <div>
                      <label className="block mb-1">Min Operating Range</label>
                      <input
                        type="number"
                        value={asFixed(level.min_operating_range, leastCountDigits)}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Max Operating Range</label>
                      <input
                        type="number"
                        value={asFixed(level.max_operating_range, leastCountDigits)}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Captured Weight</label>
                      <input
                        type="number"
                        step={stepFromDigits(leastCountDigits)}
                        value={level.capturedWeight || ''}
                        onChange={(e) => updateLevel(index, 'capturedWeight', e.target.value)}
                        className="w-full p-2 border rounded text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Result</label>
                      <input
                        type="text"
                        value={level.result || ''}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Remarks</label>
                      <input
                        type="text"
                        value={level.remarks || ''}
                        onChange={(e) => updateLevel(index, 'remarks', e.target.value)}
                        className="w-full p-2 border rounded text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Status</label>
                      <span
                        className={`inline-block px-2 py-1 rounded text-center w-full ${
                          level.result === 'Pass'
                            ? 'bg-green-200 text-green-800'
                            : level.result === 'Fail'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {level.result || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 mt-4 flex-wrap">
                <button
                  onClick={savePrimary}
                  className="bg-green-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
                >
                  <Save size={16} /> Save
                </button>
                <button
                  onClick={clearForm}
                  className="bg-red-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
                >
                  <Trash2 size={16} /> Clear
                </button>
              </div>
            </>
          )}

          {/* Secondary verification */}
          {isSaved && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">Secondary User Verification</h2>
              <div className="max-w-md">
                <FieldShell icon={User} colorClass="text-indigo-600">
                  <select
                    value={verifierUserId}
                    onChange={(e) => setVerifierUserId(e.target.value)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select Verifier</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>
              <button
                onClick={verifySecondary}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
              >
                <CheckCircle size={16} /> Log In Verified Submit
              </button>
              <button
                onClick={deleteLog}
                className="mt-3 ml-3 bg-red-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete Log
              </button>
            </div>
          )}

          {/* Logbook view (print area) */}
          {showLogbook && logData && (
            <div className="mt-6">
              {/* Save PDF only */}
              <button
                onClick={exportToPdf}
                disabled={exporting}
                className="bg-blue-600 text-white px-4 py-2 rounded inline-flex items-center gap-2"
              >
                <FileDown size={16} /> {exporting ? 'Saving…' : 'Save PDF'}
              </button>

              {/* Printable content (header is injected only in PDF) */}
              <div ref={logbookRef} className="border p-4 rounded bg-white mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div><span className="font-semibold">Balance ID:</span> {selectedBalance?.balance_id}</div>
                    <div><span className="font-semibold">Area:</span> {areaNames[selectedArea] || selectedArea}</div>
                    <div><span className="font-semibold">Date:</span> {logData.date}</div>
                  </div>
                  <div className="text-right">
                    <div><span className="font-semibold">Model:</span> {selectedBalance?.model}</div>
                    <div><span className="font-semibold">Capacity:</span> {selectedBalance?.capacity} kg</div>
                  </div>
                </div>

                <h3 className="text-base font-semibold mt-4">Checklist</h3>
                <table className="w-full border-collapse mt-2 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-center">Sr. No.</th>
                      <th className="border p-2 text-center">Checkpoint</th>
                      <th className="border p-2 text-center">OK/Not OK</th>
                      <th className="border p-2 text-center">Remarks</th>
                      <th className="border p-2 text-center">Initials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2 text-center">{item.checkpoint}</td>
                        <td className="border p-2 text-center">{item.status || 'N/A'}</td>
                        <td className="border p-2 text-center">{item.remarks || ''}</td>
                        <td className="border p-2 text-center">{item.initials || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="text-base font-semibold mt-4">Weight Checks</h3>
                <table className="w-full border-collapse mt-2 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-center">Sr. No.</th>
                      <th className="border p-2 text-center">Standard Weight (kg)</th>
                      <th className="border p-2 text-center">Weight Box</th>
                      <th className="border p-2 text-center">Standard Weight</th>
                      <th className="border p-2 text-center">Captured Weight</th>
                      <th className="border p-2 text-center">Result</th>
                      <th className="border p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verificationLevels.map((lvl, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border p-2 text-center">{idx + 1}</td>
                        <td className="border p-2 text-center">{asFixed(lvl.standard_weight, leastCountDigits)}</td>
                        <td className="border p-2 text-center">{lvl.weightBoxDescriptions || 'N/A'}</td>
                        <td className="border p-2 text-center">{lvl.standardWeightDescriptions || 'N/A'}</td>
                        <td className="border p-2 text-center">
                          {lvl.capturedWeight ? asFixed(lvl.capturedWeight, leastCountDigits) : asFixed(0, leastCountDigits)}
                        </td>
                        <td className="border p-2 text-center">{lvl.result || 'N/A'}</td>
                        <td className="border p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded ${
                              lvl.result === 'Pass'
                                ? 'bg-green-200 text-green-800'
                                : lvl.result === 'Fail'
                                ? 'bg-red-200 text-red-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {lvl.result || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-4 text-center text-sm">
                  Done By: {(logData.user?.first_name || '') + ' ' + (logData.user?.last_name || '')},
                  {' '}Checked By: {logData.verifier ? logData.verifier.first_name + ' ' + logData.verifier.last_name : 'N/A'}
                </p>
                <p className="text-center text-xs mt-2">Confidential - For Internal Use Only</p>
              </div>
            </div>
          )}

          {errorMessage && <p className="text-red-600 mt-2">{errorMessage}</p>}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default DailyVerificationLog;
