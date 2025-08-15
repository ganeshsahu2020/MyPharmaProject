// src/components/submodules/weighingbalance/VerificationPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { CheckCircle, XCircle, Loader2, Save, Trash2, Scale, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';

// Error Boundary Fallback Component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div className="p-4 text-red-600">
    <h2 className="text-2xl font-bold">Something went wrong!</h2>
    <p>{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      Try Again
    </button>
  </div>
);

// Initialize Supabase client
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const VerificationPage = () => {
  const [session, setSession] = useState(null);
  const [userManagement, setUserManagement] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [areaNames, setAreaNames] = useState({});
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedSubplant, setSelectedSubplant] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedBalance, setSelectedBalance] = useState(null);
  const [leastCountDigits, setLeastCountDigits] = useState(0);
  const [checklist, setChecklist] = useState([]);
  const [verificationLevels, setVerificationLevels] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [verifierUserId, setVerifierUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [balances, setBalances] = useState([]);
  const [weightBoxes, setWeightBoxes] = useState([]);
  const [standardWeights, setStandardWeights] = useState([]);
  const [bdvData, setBdvData] = useState([]);
  const [logId, setLogId] = useState(null);
  const [loading, setLoading] = useState(false);

  const checklistItems = [
    'Visual inspection for damage',
    'Cleanliness of balance, pan, and chamber',
    'Stable placement and environmental conditions',
    'Leveling adjustment',
    'Power stability and warm-up completion',
    'Zero/tare function check',
    'Internal calibration (if applicable)',
  ];

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user?.id) {
        console.log('Auth User ID:', session.user.id);
        const { data: userData, error } = await supabase
          .from('user_management')
          .select('id, first_name, last_name, email, auth_uid')
          .eq('auth_uid', session.user.id)
          .single();
        if (error) {
          console.error('Error fetching user management data:', error.message);
          setErrorMessage(`User not found in user_management for auth_uid ${session.user.id}. Please contact admin to register your account.`);
        } else {
          console.log('User Management Data:', userData);
          setUserManagement(userData);
          await fetchData();
        }
      }
      setLoading(false);
    };
    fetchInitialData();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user?.id) {
        supabase
          .from('user_management')
          .select('id, first_name, last_name, email, auth_uid')
          .eq('auth_uid', session.user.id)
          .single()
          .then(({ data, error }) => {
            if (error) {
              console.error('Error fetching user management data:', error.message);
              setErrorMessage(`User not found in user_management for auth_uid ${session.user.id}. Please contact admin to register your account.`);
            } else {
              setUserManagement(data);
              fetchData();
            }
          });
      } else {
        setUserManagement(null);
      }
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setErrorMessage('Supabase URL or Anon Key is missing. Please check your .env file.');
        return;
      }
      const { data: plantData, error: plantError } = await supabase
        .from('plant_master')
        .select('id, description')
        .eq('status', 'Active');
      if (plantError) throw plantError;
      setPlants(plantData || []);
      const { data: wbmData, error: wbmError } = await supabase
        .from('weighing_balance_master')
        .select('id, balance_id, description, balance_type, capacity, model, status, min_operating_capacity, max_operating_capacity, least_count_digits, area_uid')
        .eq('status', 'Active');
      if (wbmError) throw wbmError;
      console.log('Fetched Balances:', wbmData);
      setBalances(wbmData || []);
      const { data: weightBoxData, error: weightBoxError } = await supabase
        .from('weightbox_master')
        .select('weightbox_id, weightbox_type, status')
        .eq('status', 'Active');
      if (weightBoxError) throw weightBoxError;
      setWeightBoxes(weightBoxData || []);
      const { data: bdvDataResult, error: bdvError } = await supabase
        .from('balance_daily_verification')
        .select('id, balance_uid, std_weight_no, standard_weight, set_limit, operating_range_kg, min_operating_range, max_operating_range');
      if (bdvError) throw bdvError;
      console.log('Fetched BDV Data:', bdvDataResult);
      setBdvData(bdvDataResult || []);
      const { data: areaData, error: areaError } = await supabase
        .from('area_master')
        .select('id, area_name')
        .eq('status', 'Active');
      if (areaError) throw areaError;
      const areaNameMap = areaData.reduce((acc, area) => ({ ...acc, [area.id]: area.area_name }), {});
      setAreaNames(areaNameMap);
      const query = supabase.from('user_management').select('id, email').eq('status', 'Active');
      if (userManagement?.id) {
        query.neq('id', userManagement.id);
      }
      const { data: users, error: usersError } = await query;
      if (usersError) throw usersError;
      console.log('Available Users:', users);
      setAvailableUsers(users || []);
      setStandardWeights([
        { id: 'SS-SW-005', weight: 1.000, weightbox_id: 'SWB-001', description: 'SS-SW-005-1.000 kg' },
        { id: 'SS-SW-004', weight: 0.500, weightbox_id: 'SWB-001', description: 'SS-SW-004-0.500 kg' },
        { id: 'SS-SW-045', weight: 20.000, weightbox_id: 'SWB-003', description: 'SS-SW-045 - 20.000 kg' },
        { id: 'SS-SW-046', weight: 20.000, weightbox_id: 'SWB-003', description: 'SS-SW-046 - 20.000 kg' },
        { id: 'SS-SW-006', weight: 2.000, weightbox_id: 'SWB-001', description: 'SS-SW-006 - 2.000 kg' },
        { id: 'SS-SW-019', weight: 2.000, weightbox_id: 'SWB-002', description: 'SS-SW-019 - 2.000 kg' },
        { id: 'SS-SW-018', weight: 1.000, weightbox_id: 'SWB-002', description: 'SS-SW-018 - 1.000 kg' },
        { id: 'SS-SW-022', weight: 20.000, weightbox_id: 'SWB-001', description: 'SS-SW-022 - 20.000 kg' },
        { id: 'SS-SW-023', weight: 20.000, weightbox_id: 'SWB-001', description: 'SS-SW-023 - 20.000 kg' },
        { id: 'SS-SW-024', weight: 20.000, weightbox_id: 'SWB-001', description: 'SS-SW-024 - 20.000 kg' },
        { id: 'SS-SW-025', weight: 20.000, weightbox_id: 'SWB-002', description: 'SS-SW-025 - 20.000 kg' },
        { id: 'SS-SW-033', weight: 20.000, weightbox_id: 'SWB-002', description: 'SS-SW-033 - 20.000 kg' },
      ]);
    } catch (error) {
      console.error('Error fetching data:', error.message);
      setErrorMessage('Failed to load data. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubplants = async (plantId) => {
    if (!plantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('subplant_master')
      .select('id, subplant_name, plant_uid')
      .eq('plant_uid', plantId)
      .eq('status', 'Active');
    if (error) {
      console.error('Error fetching subplants:', error.message);
      setErrorMessage(`Failed to fetch subplants for plant ${plantId}: ${error.message}`);
    } else {
      console.log('Fetched Subplants:', data);
      setSubplants(data || []);
    }
    setLoading(false);
    setSelectedSubplant('');
    setDepartments([]);
    setAreas([]);
    setBalances([]);
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
      console.error('Error fetching departments:', error.message);
      setErrorMessage(`Failed to fetch departments for subplant ${subplantId}: ${error.message}`);
    } else {
      console.log('Fetched Departments:', data);
      setDepartments(data || []);
    }
    setLoading(false);
    setSelectedDepartment('');
    setAreas([]);
    setBalances([]);
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
      console.error('Error fetching areas:', error.message);
      setErrorMessage(`Failed to fetch areas for department ${departmentId}: ${error.message}`);
    } else {
      console.log('Fetched Areas:', data);
      setAreas(data || []);
    }
    setLoading(false);
    setSelectedArea('');
    setBalances([]);
  };

  const fetchBalances = async (areaId) => {
    if (!areaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('weighing_balance_master')
      .select('id, balance_id, description, balance_type, capacity, model, status, min_operating_capacity, max_operating_capacity, least_count_digits, area_uid')
      .eq('area_uid', areaId)
      .eq('status', 'Active');
    if (error) {
      console.error('Error fetching balances:', error.message);
      setErrorMessage(`Failed to fetch balances for area ${areaId}: ${error.message}`);
    } else {
      console.log('Fetched Balances for Area ID:', areaId, data);
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

  useEffect(() => {
    if (plants.length === 0) {
      const fetchPlants = async () => {
        const { data, error } = await supabase
          .from('plant_master')
          .select('id, description')
          .eq('status', 'Active');
        if (error) console.error('Error fetching plants:', error.message);
        setPlants(data || []);
      };
      fetchPlants();
    }
  }, []);

  useEffect(() => {
    setChecklist(checklistItems.map(item => ({
      checkpoint: item,
      status: '',
      remarks: '',
      initials: userManagement ? `${userManagement.first_name.charAt(0)}${userManagement.last_name.charAt(0)}` : ''
    })));
    if (selectedBalance && userManagement) {
      setLeastCountDigits(selectedBalance.least_count_digits || 0);
      const fetchPendingLog = async () => {
        setLoading(true);
        const { data: logs, error } = await supabase
          .from('daily_verification_log')
          .select('*')
          .eq('balance_id', selectedBalance.id)
          .eq('verification_status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) {
          console.error('Error fetching pending log:', error.message);
          setLoading(false);
          return;
        }
        if (logs.length > 0) {
          setLogId(logs[0].id);
          const savedChecklist = JSON.parse(logs[0].checklist || '[]');
          setChecklist(checklistItems.map((item, idx) => ({
            checkpoint: item,
            status: savedChecklist[idx]?.status || '',
            remarks: savedChecklist[idx]?.remarks || '',
            initials: savedChecklist[idx]?.initials || (userManagement ? `${userManagement.first_name.charAt(0)}${userManagement.last_name.charAt(0)}` : '')
          })));
          setVerificationLevels(JSON.parse(logs[0].verification_results || '[]').map(v => ({
            ...v,
            selectedWeightBoxes: v.selectedWeightBoxes || [],
            selectedWeights: v.selectedWeights || [],
            capturedWeight: v.capturedWeight !== undefined ? v.capturedWeight : '',
            result: v.result || '',
            remarks: v.remarks || ''
          })));
          setIsSaved(true);
          setSelectedDepartment(logs[0].department || 'Warehouse');
          setSelectedArea(logs[0].area || 'Area A');
        } else {
          let levels = bdvData.filter(d => d.balance_uid === selectedBalance.id);
          if (levels.length === 0 && selectedBalance.min_operating_capacity && selectedBalance.max_operating_capacity) {
            const capacity = parseFloat(selectedBalance.capacity || 0);
            levels = [
              {
                standard_weight: (0.001 * capacity).toFixed(leastCountDigits) || '0.000',
                min_operating_range: (selectedBalance.min_operating_capacity || 0).toFixed(leastCountDigits) || '0.000',
                max_operating_range: (selectedBalance.max_operating_capacity || 0).toFixed(leastCountDigits) || '0.000'
              },
              {
                standard_weight: (0.3 * capacity).toFixed(leastCountDigits) || '0.000',
                min_operating_range: (0.3 * capacity - 0.1 * capacity * 0.001).toFixed(leastCountDigits) || '0.000',
                max_operating_range: (0.3 * capacity + 0.1 * capacity * 0.001).toFixed(leastCountDigits) || '0.000'
              },
              {
                standard_weight: (0.8 * capacity).toFixed(leastCountDigits) || '0.000',
                min_operating_range: (0.8 * capacity - 0.1 * capacity * 0.001).toFixed(leastCountDigits) || '0.000',
                max_operating_range: (0.8 * capacity + 0.1 * capacity * 0.001).toFixed(leastCountDigits) || '0.000'
              }
            ].filter(level => level.standard_weight !== 'NaN');
          }
          setVerificationLevels(levels.map(level => ({
            ...level,
            selectedWeightBoxes: [],
            selectedWeights: [],
            capturedWeight: '',
            result: '',
            remarks: ''
          })));
          setIsSaved(false);
          setLogId(null);
        }
        setLoading(false);
      };
      fetchPendingLog();
    }
  }, [selectedBalance, bdvData, userManagement, session, leastCountDigits]);

  const handleBalanceSelect = (e) => {
    const balanceId = e.target.value;
    const balance = balances.find(b => b.balance_id === balanceId);
    setSelectedBalance(balance);
    setIsSaved(false);
    setIsVerified(false);
    setLogId(null);
  };

  const updateChecklist = (index, field, value) => {
    const updated = [...checklist];
    updated[index][field] = value;
    setChecklist(updated);
    if (value === 'Not OK') {
      setErrorMessage('Checklist item not OK. Please resolve before proceeding.');
    } else {
      setErrorMessage('');
    }
  };

  const updateLevel = (index, field, value) => {
    const updated = [...verificationLevels];
    updated[index][field] = value;
    if (field === 'capturedWeight') {
      const weight = parseFloat(value);
      const min = parseFloat(updated[index].min_operating_range);
      const max = parseFloat(updated[index].max_operating_range);
      updated[index].result = (weight >= min && weight <= max) ? 'Pass' : 'Fail';
      if (updated[index].result === 'Fail') {
        alert('Reading out of tolerance. Recheck or recalibrate.');
      }
    }
    setVerificationLevels(updated);
  };

  const handleWeightBoxesChange = (index, e) => {
    const options = Array.from(e.target.options).filter(option => option.selected).map(option => option.value);
    updateLevel(index, 'selectedWeightBoxes', options);
  };

  const handleWeightsChange = (index, e) => {
    const options = Array.from(e.target.options).filter(option => option.selected).map(option => option.value);
    updateLevel(index, 'selectedWeights', options);
  };

  const getAvailableWeights = (selectedBoxes) => {
    return standardWeights.filter(w => selectedBoxes.includes(w.weightbox_id));
  };

  const savePrimary = async () => {
    if (!userManagement) {
      setErrorMessage('User not found in user_management. Please ensure your account is registered.');
      return;
    }
    if (checklist.some(item => item.status !== 'OK')) {
      alert('All checklist items must be OK.');
      return;
    }
    if (verificationLevels.some(level => !level.capturedWeight || level.result !== 'Pass')) {
      alert('All weight checks must pass.');
      return;
    }
    setLoading(true);
    toast.promise(
      supabase
        .from('daily_verification_log')
        .insert({
          balance_id: selectedBalance.id,
          department: selectedDepartment,
          area: selectedArea,
          date: new Date().toISOString().split('T')[0],
          user_id: userManagement.id,
          checklist: JSON.stringify(checklist),
          initial_reading: null,
          tare_reading: null,
          standard_weights: JSON.stringify(verificationLevels.map(v => ({
            standard_weight: v.standard_weight,
            selectedWeightBoxes: v.selectedWeightBoxes,
            selectedWeights: v.selectedWeights
          }))),
          verification_results: JSON.stringify(verificationLevels.map(v => ({
            standard_weight: v.standard_weight,
            capturedWeight: v.capturedWeight || '',
            selectedWeightBoxes: v.selectedWeightBoxes || [],
            selectedWeights: v.selectedWeights || [],
            result: v.result,
            remarks: v.remarks
          }))),
          verification_status: 'pending'
        })
        .select()
        .then(({ data, error }) => {
          if (error) throw error;
          setLogId(data[0].id);
          setIsSaved(true);
          return 'Data saved. Awaiting secondary verification.';
        }),
      {
        loading: 'Saving verification log...',
        success: (message) => message,
        error: (error) => `Failed to save verification data. ${error.message}`,
      }
    );
    setLoading(false);
  };

  const verifySecondary = async () => {
    if (!userManagement) {
      setErrorMessage('User not found in user_management. Please ensure your account is registered.');
      return;
    }
    if (!logId) {
      const { data: logs, error: fetchError } = await supabase
        .from('daily_verification_log')
        .select('id')
        .eq('balance_id', selectedBalance.id)
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
      if (fetchError || !logs.length) {
        setErrorMessage('No pending verification found for this balance.');
        return;
      }
      setLogId(logs[0].id);
    }
    if (!verifierUserId) {
      alert('Please select a verifier.');
      return;
    }
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(verifierUserId)) {
      setErrorMessage('Invalid verifier ID. Please select a valid UUID from the dropdown.');
      return;
    }
    setLoading(true);
    toast.promise(
      supabase
        .from('daily_verification_log')
        .update({
          secondary_verifier_id: verifierUserId,
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        })
        .eq('id', logId)
        .eq('verification_status', 'pending')
        .select()
        .then(({ data, error }) => {
          if (error) throw error;
          if (data.length === 0) {
            throw new Error('No pending verification found or data already verified.');
          }
          const { checklist, verification_results } = data[0];
          setChecklist(JSON.parse(checklist || '[]'));
          setVerificationLevels(JSON.parse(verification_results || '[]').map(v => ({
            ...v,
            selectedWeightBoxes: [],
            selectedWeights: []
          })));
          setIsVerified(true);
          toast.success('Daily Verification Successful.'); // Success message
          return 'Daily Verification Successful.';
        }),
      {
        loading: 'Verifying log...',
        success: (message) => message,
        error: (error) => `Failed to verify data. ${error.message}`,
      }
    );
    setLoading(false);
  };

  const clearForm = () => {
    setLoading(true);
    toast.promise(
      new Promise((resolve) => {
        setSelectedPlant('');
        setSelectedSubplant('');
        setSelectedDepartment('');
        setSelectedArea('');
        setSelectedBalance(null);
        setChecklist([]);
        setVerificationLevels([]);
        setIsSaved(false);
        setIsVerified(false);
        setLogId(null);
        resolve();
      }),
      {
        loading: 'Clearing form...',
        success: 'Form cleared successfully.',
        error: 'Clear failed.',
      }
    );
    setLoading(false);
  };

  const deleteLog = async () => {
    if (!logId) return;
    setLoading(true);
    toast.promise(
      supabase
        .from('daily_verification_log')
        .delete()
        .eq('id', logId)
        .then(({ error }) => {
          if (error) throw error;
          setLogId(null);
          setIsSaved(false);
          setIsVerified(false);
          return 'Log deleted successfully.';
        }),
      {
        loading: 'Deleting log...',
        success: (message) => message,
        error: (error) => `Failed to delete log. ${error.message}`,
      }
    );
    setLoading(false);
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="p-5 font-sans">
        <div className="border border-gray-300 p-6 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Verification and Submission</h2>
          <p className="mb-4">
            The weighing balance shall not be used for any operational activities unless its daily verification has been successfully completed and
            documented for the current date.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block mb-1">Plant:</label>
              <div className="relative">
                <select
                  value={selectedPlant}
                  onChange={handlePlantSelect}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Plant</option>
                  {plants.map((plant) => (
                    <option key={plant.id} value={plant.id}>{plant.description}</option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>
            <div>
              <label className="block mb-1">Subplant:</label>
              <div className="relative">
                <select
                  value={selectedSubplant}
                  onChange={handleSubplantSelect}
                  className="w-full p-2 border rounded"
                  disabled={!selectedPlant}
                >
                  <option value="">Select Subplant</option>
                  {subplants.map((subplant) => (
                    <option key={subplant.id} value={subplant.id}>{subplant.subplant_name}</option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>
            <div>
              <label className="block mb-1">Department:</label>
              <div className="relative">
                <select
                  value={selectedDepartment}
                  onChange={handleDepartmentSelect}
                  className="w-full p-2 border rounded"
                  disabled={!selectedSubplant}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>
            <div>
              <label className="block mb-1">Area:</label>
              <div className="relative">
                <select
                  value={selectedArea}
                  onChange={handleAreaSelect}
                  className="w-full p-2 border rounded"
                  disabled={!selectedDepartment}
                >
                  <option value="">Select Area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.area_name}</option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>
            <div>
              <label className="block mb-1">Select Weighing Balance:</label>
              <div className="relative">
                <select
                  onChange={handleBalanceSelect}
                  className="w-full p-2 border rounded"
                  disabled={!selectedArea}
                >
                  <option value="">Select</option>
                  {balances.map((balance, idx) => (
                    <option key={idx} value={balance.balance_id}>
                      {balance.balance_id} - {balance.description} ({balance.capacity} kg)
                    </option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>
          </div>

          {loading && (
            <div className="mt-4 flex justify-center">
              <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
          )}

          {selectedBalance && !loading && (
            <>
              <h2 className="text-xl font-bold mt-6">Checklist</h2>
              <table className="w-full border-collapse mt-2">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border p-2 text-center">S.No.</th>
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
                      <td className="border p-2 text-center">{item.initials || (userManagement ? `${userManagement.first_name.charAt(0)}${userManagement.last_name.charAt(0)}` : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table><br />

              <h2 className="text-xl font-bold mt-6">Initial Reading and Zeroing</h2>
              <p className="mb-4">Ensure balance reads 0.000 after taring.</p><br />

              <h2 className="text-xl font-bold mt-6">Weight Checks</h2>
              {verificationLevels.map((level, index) => (
                <div key={index} className="mt-4 p-4 border rounded">
                  <h3 className="text-lg font-semibold">Std No. {index + 1}: Standard Weight {level.standard_weight ? level.standard_weight.toFixed(leastCountDigits) : '0.000'} kg</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1">Select Weight Box:</label>
                      <div className="relative">
                        <select
                          multiple
                          value={level.selectedWeightBoxes || []}
                          onChange={(e) => handleWeightBoxesChange(index, e)}
                          className="w-full p-2 border rounded text-center"
                        >
                          {weightBoxes.map((box) => (
                            <option key={box.weightbox_id} value={box.weightbox_id}>{box.weightbox_id}</option>
                          ))}
                        </select>
                        <Scale className="absolute right-2 top-2 text-green-500" size={16} />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1">Select Standard Weights:</label>
                      <div className="relative">
                        <select
                          multiple
                          value={level.selectedWeights || []}
                          onChange={(e) => handleWeightsChange(index, e)}
                          className="w-full p-2 border rounded text-center"
                        >
                          {getAvailableWeights(level.selectedWeightBoxes || []).map((weight) => (
                            <option key={weight.id} value={weight.id}>{weight.description}</option>
                          ))}
                        </select>
                        <Scale className="absolute right-2 top-2 text-green-500" size={16} />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1">Min Operating Range:</label>
                      <input
                        type="number"
                        value={level.min_operating_range ? level.min_operating_range.toFixed(leastCountDigits) : '0.000'}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Max Operating Range:</label>
                      <input
                        type="number"
                        value={level.max_operating_range ? level.max_operating_range.toFixed(leastCountDigits) : '0.000'}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Captured Weight:</label>
                      <input
                        type="number"
                        step={`0.${'0'.repeat(leastCountDigits - 1)}1`}
                        value={level.capturedWeight || ''}
                        onChange={(e) => updateLevel(index, 'capturedWeight', e.target.value)}
                        className="w-full p-2 border rounded text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Result:</label>
                      <input
                        type="text"
                        value={level.result || ''}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100 text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Remarks:</label>
                      <input
                        type="text"
                        value={level.remarks || ''}
                        onChange={(e) => updateLevel(index, 'remarks', e.target.value)}
                        className="w-full p-2 border rounded text-center"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Status:</label>
                      <span className={`inline-block px-2 py-1 rounded text-center w-full ${level.result === 'Pass' ? 'bg-green-200 text-green-800' : level.result === 'Fail' ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-800'}`}>
                        {level.result || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-4 mt-4">
                <button
                  onClick={savePrimary}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                >
                  <Save className="mr-2 text-green-200" size={16} /> Save
                </button>
                <button
                  onClick={clearForm}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center"
                >
                  <Trash2 className="mr-2 text-red-200" size={16} /> Clear
                </button>
                <button
                  onClick={() => alert('Recalibration initiated.')}
                  className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 flex items-center"
                >
                  <XCircle className="mr-2 text-yellow-200" size={16} /> Recalibrate
                </button>
              </div>
              {isSaved && (
                <>
                  <h2 className="text-xl font-bold mt-6">Secondary User Verification</h2>
                  <div className="relative">
                    <label className="block mb-1">Verifier ID:</label>
                    <select
                      value={verifierUserId}
                      onChange={(e) => setVerifierUserId(e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select Verifier</option>
                      {availableUsers.map(user => (
                        <option key={user.id} value={user.id}>{user.email}</option>
                      ))}
                    </select>
                    <User className="absolute right-2 top-2 text-blue-500" size={16} />
                  </div><br />
                  <button
                    onClick={verifySecondary}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                  >
                    <CheckCircle className="mr-2 text-blue-200" size={16} /> Log In Verified Submit
                  </button><br /><br />
                  <button
                    onClick={deleteLog}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center mt-2"
                  >
                    <Trash2 className="mr-2 text-red-200" size={16} /> Delete Log
                  </button>
                </>
              )}
            </>
          )}
          {errorMessage && <p className="text-red-600 mt-2">{errorMessage}</p>}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default VerificationPage;