// ✅ File: src/components/submodules/weighingbalance/LogPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Calendar, Printer, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';
import { useReactToPrint } from 'react-to-print';

// ───────────────────────────── Error Boundary Fallback ─────────────────────────────
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div className="p-4 text-red-600">
    <h2 className="text-2xl font-bold">Something went wrong!</h2>
    <p>{error?.message || 'Unknown error'}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      Try Again
    </button>
  </div>
);

// ───────────────────────────── Supabase ─────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LogPage = () => {
  // Auth
  const [session, setSession] = useState(null);
  const [userManagement, setUserManagement] = useState(null);

  // Masters
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [balances, setBalances] = useState([]);
  const [areaNames, setAreaNames] = useState({});

  // Selections
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedSubplant, setSelectedSubplant] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedBalance, setSelectedBalance] = useState(null);

  // Log state
  const [leastCountDigits, setLeastCountDigits] = useState(0);
  const [checklist, setChecklist] = useState([]);
  const [verificationLevels, setVerificationLevels] = useState([]);
  const [isVerified, setIsVerified] = useState(false);
  const [showLogbook, setShowLogbook] = useState(false);
  const [logId, setLogId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  );
  const [logData, setLogData] = useState(null);

  // Misc
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const logbookRef = useRef(null);

  // Reference lists (for display)
  const [weightBoxes, setWeightBoxes] = useState([]);
  const [standardWeights, setStandardWeights] = useState([]);
  const [bdvData, setBdvData] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]); // not used here but kept for parity

  const checklistItems = [
    'Visual inspection for damage',
    'Cleanliness of balance, pan, and chamber',
    'Stable placement and environmental conditions',
    'Leveling adjustment',
    'Power stability and warm-up completion',
    'Zero/tare function check',
    'Internal calibration (if applicable)',
  ];

  // ───────────────────────────── Init / Auth ─────────────────────────────
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user?.id) {
        const { data: userData, error } = await supabase
          .from('user_management')
          .select('id, first_name, last_name, email, auth_uid')
          .eq('auth_uid', session.user.id)
          .single();

        if (error) {
          setErrorMessage(
            `User not found in user_management for auth_uid ${session.user.id}. Please contact admin.`
          );
        } else {
          setUserManagement(userData);
          await fetchData();
        }
      }
      setLoading(false);
    };

    fetchInitialData();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        supabase
          .from('user_management')
          .select('id, first_name, last_name, email, auth_uid')
          .eq('auth_uid', session.user.id)
          .single()
          .then(async ({ data, error }) => {
            if (error) {
              setErrorMessage(
                `User not found in user_management for auth_uid ${session.user.id}. Please contact admin.`
              );
              setUserManagement(null);
            } else {
              setUserManagement(data);
              await fetchData();
            }
          });
      } else {
        setUserManagement(null);
      }
    });

    return () => {
      try {
        authListener?.subscription?.unsubscribe();
      } catch {}
    };
  }, []);

  // ───────────────────────────── Load master data ─────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setErrorMessage('Supabase URL or Anon Key is missing. Check your .env.');
        return;
      }

      const [{ data: plantData, error: plantError }, { data: areaData, error: areaError }] =
        await Promise.all([
          supabase.from('plant_master').select('id, description').eq('status', 'Active'),
          supabase.from('area_master').select('id, area_name').eq('status', 'Active'),
        ]);
      if (plantError) throw plantError;
      if (areaError) throw areaError;

      setPlants(plantData || []);
      setAreaNames((areaData || []).reduce((acc, a) => ({ ...acc, [a.id]: a.area_name }), {}));

      // Balances (all active; UI will filter by area)
      const { data: wbmData, error: wbmError } = await supabase
        .from('weighing_balance_master')
        .select(
          'id, balance_id, description, balance_type, capacity, model, status, min_operating_capacity, max_operating_capacity, least_count_digits, area_uid'
        )
        .eq('status', 'Active');
      if (wbmError) throw wbmError;
      setBalances(wbmData || []);

      // Reference lookups
      const [{ data: weightBoxData }, { data: bdvDataResult }] = await Promise.all([
        supabase.from('weightbox_master').select('weightbox_id, weightbox_type, status').eq('status', 'Active'),
        supabase
          .from('balance_daily_verification')
          .select(
            'id, balance_uid, std_weight_no, standard_weight, set_limit, operating_range_kg, min_operating_range, max_operating_range'
          ),
      ]);

      setWeightBoxes(weightBoxData || []);
      setBdvData(bdvDataResult || []);

      // Users list (not used on this page but harmless)
      let query = supabase.from('user_management').select('id, email').eq('status', 'Active');
      if (userManagement?.id) query = query.neq('id', userManagement.id);
      const { data: users } = await query;
      setAvailableUsers(users || []);

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
        { id: 'SS-SW-046', weight: 20.0, weightbox_id: 'SWB-003', description: 'SS-SW-046 - 20.000 kg' },
      ]);
    } catch (error) {
      console.error('Error fetching data:', error?.message);
      setErrorMessage('Failed to load data. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────── Cascading selects ─────────────────────────────
  const fetchSubplants = async (plantId) => {
    if (!plantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('subplant_master')
      .select('id, subplant_name, plant_uid')
      .eq('plant_uid', plantId)
      .eq('status', 'Active');
    if (error) {
      setErrorMessage(`Failed to fetch subplants for plant ${plantId}: ${error.message}`);
    } else {
      setSubplants(data || []);
    }
    setLoading(false);
    setSelectedSubplant('');
    setDepartments([]);
    setAreas([]);
    setBalances([]);
    setSelectedBalance(null);
  };

  const fetchDepartments = async (subplantId) => {
    if (!subplantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('department_master')
      .select('id, department_name, subplant_uid')
      .eq('subplant_uid', subplantId)
      .eq('status', 'Active');
    if (error) {
      setErrorMessage(`Failed to fetch departments for subplant ${subplantId}: ${error.message}`);
    } else {
      setDepartments(data || []);
    }
    setLoading(false);
    setSelectedDepartment('');
    setAreas([]);
    setBalances([]);
    setSelectedBalance(null);
  };

  const fetchAreas = async (departmentId) => {
    if (!departmentId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('area_master')
      .select('id, area_name, department_uid')
      .eq('department_uid', departmentId)
      .eq('status', 'Active');
    if (error) {
      setErrorMessage(`Failed to fetch areas for department ${departmentId}: ${error.message}`);
    } else {
      setAreas(data || []);
    }
    setLoading(false);
    setSelectedArea('');
    setBalances([]);
    setSelectedBalance(null);
  };

  const fetchBalances = async (areaId) => {
    if (!areaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('weighing_balance_master')
      .select(
        'id, balance_id, description, balance_type, capacity, model, status, min_operating_capacity, max_operating_capacity, least_count_digits, area_uid'
      )
      .eq('area_uid', areaId)
      .eq('status', 'Active');
    if (error) {
      setErrorMessage(`Failed to fetch balances for area ${areaId}: ${error.message}`);
    } else {
      setBalances(data || []);
    }
    setLoading(false);
    setSelectedBalance(null);
  };

  const handlePlantSelect = (e) => {
    const plantId = e.target.value;
    setSelectedPlant(plantId);
    fetchSubplants(plantId);
  };
  const handleSubplantSelect = (e) => {
    const subplantId = e.target.value;
    setSelectedSubplant(subplantId);
    fetchDepartments(subplantId);
  };
  const handleDepartmentSelect = (e) => {
    const departmentId = e.target.value;
    setSelectedDepartment(departmentId);
    fetchAreas(departmentId);
  };
  const handleAreaSelect = (e) => {
    const areaId = e.target.value;
    setSelectedArea(areaId);
    fetchBalances(areaId);
  };

  const handleBalanceSelect = (e) => {
    const balanceId = e.target.value;
    const balance = balances.find((b) => b.balance_id === balanceId) || null;
    setSelectedBalance(balance);
    setIsVerified(false);
    setShowLogbook(false);
    setLogId(null);
    if (balance) setLeastCountDigits(balance.least_count_digits || 0);
  };

  // Seed blank checklist on user/balance change
  useEffect(() => {
    setChecklist(
      checklistItems.map((item) => ({
        checkpoint: item,
        status: '',
        remarks: '',
        initials: userManagement
          ? `${userManagement.first_name?.charAt(0) || ''}${userManagement.last_name?.charAt(0) || ''}`
          : '',
      }))
    );
  }, [userManagement, selectedBalance]);

  // ───────────────────────────── Fetch log by date ─────────────────────────────
  const fetchLogByDate = async () => {
    if (!selectedBalance) {
      setErrorMessage('Please select a balance first.');
      toast.error('Select a balance first');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_verification_log')
        .select(
          `
          *,
          user:user_id(first_name,last_name,email),
          verifier:secondary_verifier_id(first_name,last_name,email)
        `
        )
        .eq('balance_id', selectedBalance.id)
        .eq('date', selectedDate)
        .eq('verification_status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data?.length) {
        const log = data[0];
        setChecklist(JSON.parse(log.checklist || '[]') || []);
        const vr = JSON.parse(log.verification_results || '[]') || [];
        // Leave selectedWeightBoxes / selectedWeights intact for display mapping below
        setVerificationLevels(vr);
        setLogData(log);
        setShowLogbook(true);
        setIsVerified(true);
        setLogId(log.id);
        toast.success('Log loaded.');
      } else {
        setShowLogbook(false);
        setIsVerified(false);
        toast.error('No verified log found for the selected date.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to fetch log.');
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────── Print handler ─────────────────────────────
  const printLogbook = useReactToPrint({
    content: () => logbookRef.current,
    documentTitle: `Daily Verification Log - ${selectedDate}`,
  });

  // ───────────────────────────── Auth Gate ─────────────────────────────
  if (!session) {
    return (
      <div className="p-5">
        <h2 className="text-2xl font-bold mb-4">Login Required</h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={['google', 'github']}
          redirectTo={window.location.origin}
        />
      </div>
    );
  }

  // ───────────────────────────── UI ─────────────────────────────
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="p-5 font-sans">
        <div className="border border-gray-300 p-6 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">View Log</h2>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block mb-1">Plant</label>
              <select
                value={selectedPlant}
                onChange={handlePlantSelect}
                className="w-full p-2 border rounded"
              >
                <option value="">Select Plant</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Subplant</label>
              <select
                value={selectedSubplant}
                onChange={handleSubplantSelect}
                disabled={!selectedPlant}
                className="w-full p-2 border rounded"
              >
                <option value="">Select Subplant</option>
                {subplants.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.subplant_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Department</label>
              <select
                value={selectedDepartment}
                onChange={handleDepartmentSelect}
                disabled={!selectedSubplant}
                className="w-full p-2 border rounded"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Area</label>
              <select
                value={selectedArea}
                onChange={handleAreaSelect}
                disabled={!selectedDepartment}
                className="w-full p-2 border rounded"
              >
                <option value="">Select Area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.area_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Weighing Balance</label>
              <select
                value={selectedBalance?.balance_id || ''}
                onChange={handleBalanceSelect}
                disabled={!selectedArea}
                className="w-full p-2 border rounded"
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
            </div>

            <div>
              <label className="block mb-1">View by Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full p-2 border rounded"
                />
                <Calendar className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
              <button
                onClick={fetchLogByDate}
                className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 inline-flex items-center"
              >
                <Calendar className="mr-2" size={16} /> View Log
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="mt-4 flex justify-center">
              <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
          )}

          {/* Logbook */}
          {showLogbook && logData && !loading && (
            <>
              <h2 className="text-xl font-bold mt-2">Daily Verification Log</h2>
              <p className="mb-2">Date: {logData.date}</p>

              <button
                onClick={printLogbook}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center mb-4"
              >
                <Printer className="mr-2" size={16} /> Print / Save PDF
              </button>

              <div ref={logbookRef} className="border p-4 rounded bg-white">
                {/* Header */}
                <h3 className="text-lg font-semibold">Header</h3>
                <p>
                  DigitizerX, Daily Verification Log for Weighing Balance, Document No.
                  WBL-VER-XXX, Version 1.0, Effective Date: {logData.date}
                </p>

                {/* Balance Details */}
                <h3 className="text-lg font-semibold mt-4">Weighing Balance Details</h3>
                <p>
                  Balance ID: {selectedBalance?.balance_id || '-'}, Model:{' '}
                  {selectedBalance?.model || '-'}, Area:{' '}
                  {areaNames[selectedArea] || selectedArea || '-'}, Capacity:{' '}
                  {selectedBalance?.capacity ?? '-'} kg, Date: {logData.date}
                </p>

                {/* Checklist */}
                <h3 className="text-lg font-semibold mt-4">Checklist</h3>
                <table className="w-full border-collapse mt-2">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border p-2 text-center">Sr. No.</th>
                      <th className="border p-2 text-center">Checkpoint</th>
                      <th className="border p-2 text-center">OK/Not OK</th>
                      <th className="border p-2 text-center">Remarks</th>
                      <th className="border p-2 text-center">Initials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-100">
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2 text-center">{item.checkpoint}</td>
                        <td className="border p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded ${
                              item.status === 'OK'
                                ? 'bg-green-200 text-green-800'
                                : item.status === 'Not OK'
                                ? 'bg-red-200 text-red-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {item.status || 'N/A'}
                          </span>
                        </td>
                        <td className="border p-2 text-center">{item.remarks || ''}</td>
                        <td className="border p-2 text-center">
                          {item.initials ||
                            (userManagement
                              ? `${userManagement.first_name?.[0] || ''}${
                                  userManagement.last_name?.[0] || ''
                                }`
                              : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Weight Checks */}
                <h3 className="text-lg font-semibold mt-4">Weight Checks</h3>
                <table className="w-full border-collapse mt-2">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border p-2 text-center">Sr. No.</th>
                      <th className="border p-2 text-center">Standard Weight (Kg)</th>
                      <th className="border p-2 text-center">Weight Box</th>
                      <th className="border p-2 text-center">Standard Weight</th>
                      <th className="border p-2 text-center">Captured Weight</th>
                      <th className="border p-2 text-center">Result</th>
                      <th className="border p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verificationLevels.map((level, index) => (
                      <tr key={index} className="hover:bg-gray-100">
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2 text-center">
                          {Number.isFinite(parseFloat(level.standard_weight))
                            ? parseFloat(level.standard_weight).toFixed(leastCountDigits)
                            : '0.000'}
                        </td>
                        <td className="border p-2 text-center">
                          {(level.selectedWeightBoxes || []).join(', ') || 'N/A'}
                        </td>
                        <td className="border p-2 text-center">
                          {(level.selectedWeights || [])
                            .map((id) => standardWeights.find((w) => w.id === id)?.description)
                            .filter(Boolean)
                            .join(', ') || 'N/A'}
                        </td>
                        <td className="border p-2 text-center">
                          {level.capturedWeight
                            ? parseFloat(level.capturedWeight).toFixed(leastCountDigits)
                            : '0.000'}
                        </td>
                        <td className="border p-2 text-center">{level.result || 'N/A'}</td>
                        <td className="border p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded ${
                              level.result === 'Pass'
                                ? 'bg-green-200 text-green-800'
                                : level.result === 'Fail'
                                ? 'bg-red-200 text-red-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {level.result || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Footer */}
                <p className="mt-4 text-center">
                  Done By:{' '}
                  {logData?.user
                    ? `${logData.user.first_name || ''} ${logData.user.last_name || ''}`.trim()
                    : '-'}
                  , Checked By:{' '}
                  {logData?.verifier
                    ? `${logData.verifier.first_name || ''} ${
                        logData.verifier.last_name || ''
                      }`.trim()
                    : 'N/A'}
                </p>
                <h3 className="text-lg font-semibold mt-4">Footer</h3>
                <p className="text-center">Confidential - For Internal Use Only</p>
              </div>
            </>
          )}

          {errorMessage && <p className="text-red-600 mt-2">{errorMessage}</p>}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LogPage;
