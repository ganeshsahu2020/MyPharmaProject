import React, { useState, useEffect, useRef } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Loader2, Calendar, Scale, ArrowLeft, Printer, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';
import { useReactToPrint } from 'react-to-print';
import html2pdf from 'html2pdf.js';
import { supabase } from '../../../../utils/supabaseClient';
import EccentricityTest from './EccentricityTest';
import LinearityTest from './LinearityTest';
import RepeatabilityUncertaintyTest from './RepeatabilityUncertaintyTest';
import VerificationSubmission from './VerificationSubmission';
import { useNavigate } from 'react-router-dom';

// ---------- Company + Logo ----------
const COMPANY_NAME = 'DigitizerX';
// Resolves to a real URL at build/runtime (works with Vite)
const logoSrc = new URL('../../../../assets/logo.png', import.meta.url).href;

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

const MonthlyCalibrationProcess = () => {
  const navigate = useNavigate();

  // --- Auth / user context ---
  const [session, setSession] = useState(null);
  const [userManagement, setUserManagement] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);

  // --- Masters ---
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [areaNames, setAreaNames] = useState({});
  const [balances, setBalances] = useState([]);
  const [weightboxes, setWeightboxes] = useState([]);
  const [standardWeights, setStandardWeights] = useState([]);

  // --- Selections ---
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedSubplant, setSelectedSubplant] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedBalance, setSelectedBalance] = useState(null);
  const [selectedWeightbox, setSelectedWeightbox] = useState('');

  // --- Calibration master per balance ---
  const [calibrationMaster, setCalibrationMaster] = useState(null);

  // --- UI / workflow ---
  const [leastCountDigits, setLeastCountDigits] = useState(3);
  const [isSaved, setIsSaved] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifierUserId, setVerifierUserId] = useState('');
  const [showLogbook, setShowLogbook] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState('eccentricity');

  // --- Log state ---
  const [logId, setLogId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [logData, setLogData] = useState(null);
  const logbookRef = useRef(null);

  // For showing names of saved SW when fetching a log
  const [standardWeightsForLog, setStandardWeightsForLog] = useState([]);

  // --- Tests ---
  const [eccentricityTest, setEccentricityTest] = useState({
    positions: [
      { name: 'Center', observed: '', min: '', max: '', result: '' },
      { name: 'Front Left', observed: '', min: '', max: '', result: '' },
      { name: 'Front Right', observed: '', min: '', max: '', result: '' },
      { name: 'Back Left', observed: '', min: '', max: '', result: '' },
      { name: 'Back Right', observed: '', min: '', max: '', result: '' }
    ],
    standardIds: [],
    standard: '',
    validationMessage: '',
    overallResult: '',
    criteria: 'All positions must be within ±0.1% of standard weight'
  });

  const [linearityTest, setLinearityTest] = useState({
    points: [
      { weight: '0%', standardIds: [], standard: '0', observed: '', min: '0', max: '0', result: '', validationMessage: '' },
      { weight: '25%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
      { weight: '50%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
      { weight: '75%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
      { weight: '100%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' }
    ],
    overallResult: '',
    criteria: 'All points must be within ±0.1% of standard weight'
  });

  const [repeatabilityTest, setRepeatabilityTest] = useState({
    trials: Array(10).fill().map((_, i) => ({ trial: i + 1, observed: '', standard: '', result: '' })),
    standardIds: [],
    standard: '',
    validationMessage: '',
    mean: '',
    standardDeviation: '',
    rsd: '',
    overallResult: '',
    criteria: 'RSD must be ≤0.05%'
  });

  const [uncertaintyTest, setUncertaintyTest] = useState({
    value: '',
    result: '',
    criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001'
  });

  // ---------------- Init ----------------
  useEffect(() => {
    const testConnection = async () => {
      const { data, error } = await supabase.from('plant_master').select('id, description').limit(1);
      if (error) {
        console.error('Supabase connection error:', error);
        setErrorMessage(`Connection failed: ${error.message}`);
      } else {
        console.log('Supabase connected, sample data:', data);
      }
    };
    testConnection();

    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        if (session?.user?.id) {
          const { data: userData, error } = await supabase
            .from('user_management')
            .select('id, first_name, last_name, email, auth_uid')
            .eq('auth_uid', session.user.id)
            .single();
          if (error) {
            console.error('Error fetching user management data:', error);
            setErrorMessage(`User not found in user_management for auth_uid ${session.user.id}. Please contact admin to register your account.`);
          } else {
            setUserManagement(userData);
            await fetchData();
          }
        }
      } catch (error) {
        console.error('Error in fetchInitialData:', error);
        setErrorMessage('Failed to load initial data. Check console for details.');
      } finally {
        setLoading(false);
      }
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
              console.error('Error fetching user management data:', error);
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
      const { data: plantData } = await supabase
        .from('plant_master').select('id, description').eq('status', 'Active');
      setPlants(plantData || []);

      const { data: wbmData } = await supabase
        .from('weighing_balance_master')
        .select('id, balance_id, description, balance_type, capacity, model, status, least_count_digits, area_uid')
        .eq('status', 'Active');
      setBalances(wbmData || []);

      const { data: areaData } = await supabase
        .from('area_master').select('id, area_name').eq('status', 'Active');
      const map = (areaData || []).reduce((acc, a) => ({ ...acc, [a.id]: a.area_name }), {});
      setAreaNames(map);

      const baseUsers = supabase.from('user_management').select('id, email, first_name, last_name').eq('status', 'Active');
      const query = userManagement?.id ? baseUsers.neq('id', userManagement.id) : baseUsers;
      const { data: users } = await query;
      setAvailableUsers(users || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage('Failed to load data. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  // --------------- Cascading fetches ---------------
  const fetchSubplants = async (plantId) => {
    if (!plantId) return;
    try {
      const { data } = await supabase
        .from('subplant_master').select('id, subplant_name')
        .eq('plant_uid', plantId).eq('status', 'Active');
      setSubplants(data || []);
      setSelectedSubplant(''); setDepartments([]); setAreas([]);
      setBalances([]); setWeightboxes([]); setSelectedWeightbox('');
      setStandardWeights([]); setCalibrationMaster(null); setSelectedBalance(null);
    } catch (error) {
      console.error('Error fetching subplants:', error);
      setErrorMessage('Failed to fetch subplants.');
    }
  };

  const fetchDepartments = async (subplantId) => {
    if (!subplantId) return;
    try {
      const { data } = await supabase
        .from('department_master').select('id, department_name')
        .eq('subplant_uid', subplantId).eq('status', 'Active');
      setDepartments(data || []);
      setSelectedDepartment(''); setAreas([]); setBalances([]);
      setWeightboxes([]); setSelectedWeightbox(''); setStandardWeights([]);
      setCalibrationMaster(null); setSelectedBalance(null);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setErrorMessage('Failed to fetch departments.');
    }
  };

  const fetchAreas = async (departmentId) => {
    if (!departmentId) return;
    try {
      const { data } = await supabase
        .from('area_master').select('id, area_name')
        .eq('department_uid', departmentId).eq('status', 'Active');
      setAreas(data || []); setSelectedArea(''); setBalances([]);
      setWeightboxes([]); setSelectedWeightbox(''); setStandardWeights([]);
      setCalibrationMaster(null); setSelectedBalance(null);
    } catch (error) {
      console.error('Error fetching areas:', error);
      setErrorMessage('Failed to fetch areas.');
    }
  };

  const fetchBalances = async (areaId) => {
    if (!areaId) return;
    try {
      const { data } = await supabase
        .from('weighing_balance_master')
        .select('id, balance_id, description, balance_type, capacity, model, status, least_count_digits, area_uid')
        .eq('area_uid', areaId).eq('status', 'Active');
      setBalances(data || []);
      setSelectedBalance(null); setCalibrationMaster(null);
      setLeastCountDigits(3);
      if ((data || []).length === 0) { setWeightboxes([]); setStandardWeights([]); }
    } catch (error) {
      console.error('Error fetching balances:', error);
      setErrorMessage('Failed to fetch balances.');
    }
  };

  const fetchWeightboxes = async (areaId) => {
    if (!areaId) return;
    try {
      const { data } = await supabase
        .from('weightbox_master').select('id, weightbox_id, weightbox_type')
        .eq('area_uid', areaId).eq('status', 'Active');
      setWeightboxes(data || []); setSelectedWeightbox(''); setStandardWeights([]);
    } catch (error) {
      console.error('Error fetching weightboxes:', error);
      setErrorMessage('Failed to fetch weightboxes.');
    }
  };

  const fetchStandardWeights = async (weightboxId) => {
    if (!weightboxId) return;
    try {
      const { data } = await supabase
        .from('standard_weight_master').select('id, standard_weight_id, capacity')
        .eq('weightbox_uid', weightboxId).eq('status', 'Active')
        .order('capacity', { ascending: true });
      setStandardWeights(data || []);
    } catch (error) {
      console.error('Error fetching standard weights:', error);
      setErrorMessage('Failed to fetch standard weights.');
    }
  };

  const fetchCalibrationMaster = async (balanceId) => {
    try {
      const { data, error } = await supabase
        .from('balance_monthly_calibration').select('*')
        .eq('balance_uid', balanceId).single();
      if (error || !data) {
        console.error('Error fetching calibration master:', error);
        setErrorMessage('No calibration master data found for this balance.');
        setCalibrationMaster(null);
        return;
      }
      setCalibrationMaster(data);
      initializeCalibrationTests();
    } catch (error) {
      console.error('Error in fetchCalibrationMaster:', error);
      setErrorMessage('Failed to fetch calibration master.');
    }
  };

  // --------------- Handlers ---------------
  const handlePlantSelect = (e) => { const v = e.target.value; setSelectedPlant(v); fetchSubplants(v); };
  const handleSubplantSelect = (e) => { const v = e.target.value; setSelectedSubplant(v); fetchDepartments(v); };
  const handleDepartmentSelect = (e) => { const v = e.target.value; setSelectedDepartment(v); fetchAreas(v); };
  const handleAreaSelect = (e) => { const v = e.target.value; setSelectedArea(v); fetchBalances(v); fetchWeightboxes(v); };

  const handleBalanceSelect = (e) => {
    const idFromEvent = e.target.value;
    const balance = balances.find(b => String(b.id) === String(idFromEvent)) || null;
    setSelectedBalance(balance);
    setIsSaved(false); setIsVerified(false); setShowLogbook(false);
    setLogId(null); setLogData(null); setStandardWeightsForLog([]);
    if (balance) {
      setLeastCountDigits(Number(balance.least_count_digits ?? 3));
      fetchCalibrationMaster(balance.id);
    }
  };

  const handleWeightboxSelect = (e) => {
    const weightboxId = e.target.value;
    setSelectedWeightbox(weightboxId);
    fetchStandardWeights(weightboxId);
    setEccentricityTest(prev => ({ ...prev, standardIds: [], standard: '', validationMessage: '' }));
    setLinearityTest(prev => ({
      ...prev,
      points: prev.points.map((p, i) => i === 0 ? p : { ...p, standardIds: [], standard: '', min: '', max: '', validationMessage: '' })
    }));
    setRepeatabilityTest(prev => ({ ...prev, standardIds: [], standard: '', validationMessage: '' }));
  };

  // --------------- Initialize tests ---------------
  const initializeCalibrationTests = () => {
    setEccentricityTest({
      positions: [
        { name: 'Center', observed: '', min: '', max: '', result: '' },
        { name: 'Front Left', observed: '', min: '', max: '', result: '' },
        { name: 'Front Right', observed: '', min: '', max: '', result: '' },
        { name: 'Back Left', observed: '', min: '', max: '', result: '' },
        { name: 'Back Right', observed: '', min: '', max: '', result: '' }
      ],
      standardIds: [],
      standard: '',
      validationMessage: '',
      overallResult: '',
      criteria: 'All positions must be within ±0.1% of standard weight'
    });

    setLinearityTest({
      points: [
        { weight: '0%', standardIds: [], standard: '0', observed: '', min: '0', max: '0', result: '', validationMessage: '' },
        { weight: '25%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
        { weight: '50%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
        { weight: '75%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' },
        { weight: '100%', standardIds: [], standard: '', observed: '', min: '', max: '', result: '', validationMessage: '' }
      ],
      overallResult: '',
      criteria: 'All points must be within ±0.1% of standard weight'
    });

    setRepeatabilityTest({
      trials: Array(10).fill().map((_, i) => ({ trial: i + 1, observed: '', standard: '', result: '' })),
      standardIds: [],
      standard: '',
      validationMessage: '',
      mean: '', standardDeviation: '', rsd: '',
      overallResult: '',
      criteria: 'RSD must be ≤0.05%'
    });

    setUncertaintyTest({ value: '', result: '', criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001' });
  };

  // --------------- Update helpers (unchanged) ---------------
  const updateEccentricityTest = (index, field, value) => {
    const updated = { ...eccentricityTest };
    updated.positions[index][field] = value;
    if (field === 'observed') {
      const observed = parseFloat(value) || 0;
      const min = parseFloat(updated.positions[index].min) || 0;
      const max = parseFloat(updated.positions[index].max) || 0;
      updated.positions[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
    }
    updated.overallResult = updated.positions.every(pos => pos.result === 'Pass') ? 'Pass' : 'Fail';
    setEccentricityTest(updated);
  };

  const updateLinearityTest = (index, field, value) => {
    const updated = { ...linearityTest };
    updated.points[index][field] = value;
    if (field === 'observed') {
      const observed = parseFloat(value) || 0;
      const min = parseFloat(updated.points[index].min) || 0;
      const max = parseFloat(updated.points[index].max) || 0;
      updated.points[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
    }
    updated.overallResult = updated.points.every(point => point.result === 'Pass') ? 'Pass' : 'Fail';
    setLinearityTest(updated);
  };

  const updateRepeatabilityTest = (index, field, value) => {
    const updated = { ...repeatabilityTest };
    updated.trials[index][field] = value;
    if (field === 'observed') {
      const observed = parseFloat(value) || 0;
      const min = parseFloat(updated.trials[index].min) || 0;
      const max = parseFloat(updated.trials[index].max) || 0;
      updated.trials[index].result = (observed >= min && observed <= max) ? 'Pass' : 'Fail';
    }
    if (updated.trials.every(trial => trial.observed !== '' && !isNaN(parseFloat(trial.observed)))) {
      const observations = updated.trials.map(trial => parseFloat(trial.observed));
      const mean = observations.reduce((s, v) => s + v, 0) / observations.length;
      const variance = observations.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / observations.length;
      const stdDev = Math.sqrt(variance);
      const rsd = mean !== 0 ? (stdDev / mean) * 100 : 0;
      updated.mean = mean.toFixed(leastCountDigits);
      updated.standardDeviation = stdDev.toFixed(leastCountDigits);
      updated.rsd = rsd.toFixed(2);
      updated.overallResult = rsd <= 0.05 ? 'Pass' : 'Fail';

      if (mean !== 0) {
        const uncertaintyValue = (2 * stdDev / mean).toFixed(leastCountDigits);
        setUncertaintyTest({
          value: uncertaintyValue,
          result: parseFloat(uncertaintyValue) <= 0.001 ? 'Pass' : 'Fail',
          criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001'
        });
      } else {
        setUncertaintyTest({
          value: 'N/A',
          result: 'Fail',
          criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001'
        });
      }
    }
    setRepeatabilityTest(updated);
  };

  // --------------- Save / Verify ---------------
  const savePrimary = async () => {
    if (!userManagement) return setErrorMessage('User not found in user_management. Please ensure your account is registered.');
    if (!selectedBalance) return setErrorMessage('Please select a balance.');
    if (!selectedWeightbox) return setErrorMessage('Please select a weightbox.');

    if (eccentricityTest.validationMessage || linearityTest.points.slice(1).some(p => p.validationMessage) || repeatabilityTest.validationMessage) {
      setErrorMessage('Please resolve all weight selection validation issues.'); return;
    }
    if (eccentricityTest.overallResult !== 'Pass' || linearityTest.overallResult !== 'Pass' || repeatabilityTest.overallResult !== 'Pass' || uncertaintyTest.result !== 'Pass') {
      setErrorMessage('All tests must pass before saving.'); return;
    }
    if (!eccentricityTest.standardIds.length || linearityTest.points.slice(1).some(p => !p.standardIds.length) || !repeatabilityTest.standardIds.length) {
      setErrorMessage('Please select standard weights for all tests.'); return;
    }

    try {
      const { data: masterData, error: masterError } = await supabase
        .from('balance_monthly_calibration').select('id')
        .eq('balance_uid', selectedBalance.id).single();
      if (masterError || !masterData) {
        setErrorMessage('No master calibration data found for this balance.');
        console.error('Master Calibration Error:', masterError);
        return;
      }
      const balanceCalibrationId = masterData.id;
      const standardWeightUid = eccentricityTest.standardIds[0] || null;
      setLoading(true);

      const payload = {
        balance_calibration_id: balanceCalibrationId,
        weightbox_uid: selectedWeightbox,
        standard_weight_uid: standardWeightUid,
        p1_center: eccentricityTest.positions[0].observed,
        p2_front_left: eccentricityTest.positions[1].observed,
        p3_front_right: eccentricityTest.positions[2].observed,
        p4_back_left: eccentricityTest.positions[3].observed,
        p5_back_right: eccentricityTest.positions[4].observed,
        ecc_acceptance: eccentricityTest.overallResult === 'Pass',
        ecc_standard_weight_id: eccentricityTest.standardIds.join(','),
        ecc_standard: eccentricityTest.standard,
        linearity_0: linearityTest.points[0].observed,
        linearity_25: linearityTest.points[1].observed,
        linearity_50: linearityTest.points[2].observed,
        linearity_75: linearityTest.points[3].observed,
        linearity_100: linearityTest.points[4].observed,
        linearity_acceptance: linearityTest.overallResult === 'Pass',
        linearity_25_standard_weight_id: linearityTest.points[1].standardIds.join(','),
        linearity_50_standard_weight_id: linearityTest.points[2].standardIds.join(','),
        linearity_75_standard_weight_id: linearityTest.points[3].standardIds.join(','),
        linearity_100_standard_weight_id: linearityTest.points[4].standardIds.join(','),
        linearity_25_standard: linearityTest.points[1].standard,
        linearity_50_standard: linearityTest.points[2].standard,
        linearity_75_standard: linearityTest.points[3].standard,
        linearity_100_standard: linearityTest.points[4].standard,
        repeatability_1: repeatabilityTest.trials[0]?.observed || null,
        repeatability_2: repeatabilityTest.trials[1]?.observed || null,
        repeatability_3: repeatabilityTest.trials[2]?.observed || null,
        repeatability_4: repeatabilityTest.trials[3]?.observed || null,
        repeatability_5: repeatabilityTest.trials[4]?.observed || null,
        repeatability_6: repeatabilityTest.trials[5]?.observed || null,
        repeatability_7: repeatabilityTest.trials[6]?.observed || null,
        repeatability_8: repeatabilityTest.trials[7]?.observed || null,
        repeatability_9: repeatabilityTest.trials[8]?.observed || null,
        repeatability_10: repeatabilityTest.trials[9]?.observed || null,
        sd_value: repeatabilityTest.standardDeviation,
        mean_value: repeatabilityTest.mean,
        rsd_value: repeatabilityTest.rsd,
        repeatability_standard_weight_id: repeatabilityTest.standardIds.join(','),
        repeatability_standard: repeatabilityTest.standard,
        uncertainty_value: uncertaintyTest.value,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: userManagement.id,
        verification_status: 'pending'
      };

      const { data, error } = await supabase
        .from('balance_monthly_calibration_log').insert(payload).select().single();
      if (error) throw new Error(`Save failed: ${error.message || 'Unknown error'}`);
      if (!data?.id) throw new Error('No ID returned after insert');

      setLogId(data.id);
      setIsSaved(true);
      setCurrentStage('verification');
      setErrorMessage('');
      toast.success('Calibration data saved successfully.');
    } catch (error) {
      console.error('Save Primary Exception:', error);
      setErrorMessage(`Failed to save calibration data: ${error.message}`);
      toast.error(`Failed to save calibration data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const verifySecondary = async () => {
    if (!userManagement) return setErrorMessage('User not found in user_management. Please ensure your account is registered.');
    if (!selectedBalance || !calibrationMaster?.id) return setErrorMessage('Please select a balance and ensure calibration master data is loaded.');
    if (!logId) {
      try {
        const { data: logs, error: fetchError } = await supabase
          .from('balance_monthly_calibration_log')
          .select('id')
          .eq('balance_calibration_id', calibrationMaster.id)
          .eq('verification_status', 'pending')
          .order('created_at', { ascending: false }).limit(1);
        if (fetchError || !logs?.length) { setErrorMessage('No pending calibration found for this balance.'); return; }
        setLogId(logs[0].id);
      } catch {
        setErrorMessage('Failed to fetch pending calibration log.');
        return;
      }
    }
    if (!verifierUserId) return setErrorMessage('Please select a verifier.');

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('balance_monthly_calibration_log')
        .update({
          secondary_verifier_id: verifierUserId,
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        })
        .eq('id', logId).select();
      if (error) throw new Error(`Verification failed: ${error.message || 'Unknown error'}`);
      if (data.length === 0) throw new Error('No pending calibration found or data already verified.');

      await fetchLogByDate(data[0].id);
      setIsVerified(true);
      setShowLogbook(true);
      setErrorMessage('');
      toast.success('Monthly Calibration Verified Successfully.');
    } catch (error) {
      console.error('Verify Exception:', error);
      setErrorMessage(`Failed to verify calibration: ${error.message}`);
      toast.error(`Failed to verify calibration: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------- Fetch log ---------------
  const fetchLogByDate = async (specificLogId = null) => {
    if (!selectedBalance || !calibrationMaster?.id) {
      setErrorMessage('Please select a balance and ensure calibration master data is loaded.');
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('balance_monthly_calibration_log')
        .select(`
          *,
          user:user_id (first_name, last_name, email),
          verifier:secondary_verifier_id (first_name, last_name, email)
        `)
        .eq('balance_calibration_id', calibrationMaster.id);

      const startOfDay = new Date(selectedDate); startOfDay.setUTCHours(0,0,0,0);
      const endOfDay = new Date(selectedDate);   endOfDay.setUTCHours(23,59,59,999);

      if (specificLogId) {
        query = query.eq('id', specificLogId);
      } else {
        query = query
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString())
          .eq('verification_status', 'verified');
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
      if (error) throw error;

      if (data.length > 0) {
        const log = data[0];
        setLogData(log);
        setLogId(log.id);

        const eccStandard = parseFloat(log.ecc_standard || '0');
        const eccTol = 0.001 * eccStandard;
        const eccMin = (eccStandard - eccTol).toFixed(leastCountDigits);
        const eccMax = (eccStandard + eccTol).toFixed(leastCountDigits);

        setEccentricityTest({
          positions: [
            { name: 'Center', observed: log.p1_center || '', min: eccMin, max: eccMax, result: log.ecc_acceptance ? 'Pass' : 'Fail' },
            { name: 'Front Left', observed: log.p2_front_left || '', min: eccMin, max: eccMax, result: log.ecc_acceptance ? 'Pass' : 'Fail' },
            { name: 'Front Right', observed: log.p3_front_right || '', min: eccMin, max: eccMax, result: log.ecc_acceptance ? 'Pass' : 'Fail' },
            { name: 'Back Left', observed: log.p4_back_left || '', min: eccMin, max: eccMax, result: log.ecc_acceptance ? 'Pass' : 'Fail' },
            { name: 'Back Right', observed: log.p5_back_right || '', min: eccMin, max: eccMax, result: log.ecc_acceptance ? 'Pass' : 'Fail' }
          ],
          standardIds: log.ecc_standard_weight_id ? log.ecc_standard_weight_id.split(',').filter(Boolean) : [],
          standard: log.ecc_standard || '0',
          validationMessage: '',
          overallResult: log.ecc_acceptance ? 'Pass' : 'Fail',
          criteria: 'All positions must be within ±0.1% of standard weight'
        });

        const mkMin = (v) => v !== '' ? (parseFloat(v) - 0.001 * parseFloat(v)).toFixed(leastCountDigits) : '';
        const mkMax = (v) => v !== '' ? (parseFloat(v) + 0.001 * parseFloat(v)).toFixed(leastCountDigits) : '';

        setLinearityTest({
          points: [
            { weight: '0%',   standardIds: [], standard: '0',                       observed: log.linearity_0   || '', min: '0',                       max: '0',                       result: log.linearity_acceptance ? 'Pass' : 'Fail', validationMessage: '' },
            { weight: '25%',  standardIds: log.linearity_25_standard_weight_id ? log.linearity_25_standard_weight_id.split(',').filter(Boolean) : [], standard: log.linearity_25_standard || '', observed: log.linearity_25 || '', min: mkMin(log.linearity_25_standard), max: mkMax(log.linearity_25_standard), result: log.linearity_acceptance ? 'Pass' : 'Fail', validationMessage: '' },
            { weight: '50%',  standardIds: log.linearity_50_standard_weight_id ? log.linearity_50_standard_weight_id.split(',').filter(Boolean) : [], standard: log.linearity_50_standard || '', observed: log.linearity_50 || '', min: mkMin(log.linearity_50_standard), max: mkMax(log.linearity_50_standard), result: log.linearity_acceptance ? 'Pass' : 'Fail', validationMessage: '' },
            { weight: '75%',  standardIds: log.linearity_75_standard_weight_id ? log.linearity_75_standard_weight_id.split(',').filter(Boolean) : [], standard: log.linearity_75_standard || '', observed: log.linearity_75 || '', min: mkMin(log.linearity_75_standard), max: mkMax(log.linearity_75_standard), result: log.linearity_acceptance ? 'Pass' : 'Fail', validationMessage: '' },
            { weight: '100%', standardIds: log.linearity_100_standard_weight_id ? log.linearity_100_standard_weight_id.split(',').filter(Boolean) : [], standard: log.linearity_100_standard || '', observed: log.linearity_100 || '', min: mkMin(log.linearity_100_standard), max: mkMax(log.linearity_100_standard), result: log.linearity_acceptance ? 'Pass' : 'Fail', validationMessage: '' }
          ],
          overallResult: log.linearity_acceptance ? 'Pass' : 'Fail',
          criteria: 'All points must be within ±0.1% of standard weight'
        });

        const repStandard = parseFloat(log.repeatability_standard || '0');
        const repeatabilityObservations = [
          log.repeatability_1 || '', log.repeatability_2 || '', log.repeatability_3 || '', log.repeatability_4 || '',
          log.repeatability_5 || '', log.repeatability_6 || '', log.repeatability_7 || '', log.repeatability_8 || '',
          log.repeatability_9 || '', log.repeatability_10 || ''
        ];

        setRepeatabilityTest({
          trials: Array(10).fill().map((_, i) => ({
            trial: i + 1,
            observed: repeatabilityObservations[i] || '',
            standard: repStandard ? repStandard.toFixed(leastCountDigits) : '',
            result: log.rsd_value && parseFloat(log.rsd_value) <= 0.05 ? 'Pass' : 'Fail'
          })),
          standardIds: log.repeatability_standard_weight_id ? log.repeatability_standard_weight_id.split(',').filter(Boolean) : [],
          standard: log.repeatability_standard || '0',
          validationMessage: '',
          mean: log.mean_value || '0',
          standardDeviation: log.sd_value || '0',
          rsd: log.rsd_value || '0',
          overallResult: log.rsd_value && parseFloat(log.rsd_value) <= 0.05 ? 'Pass' : 'Fail',
          criteria: 'RSD must be ≤0.05%'
        });

        setUncertaintyTest({
          value: log.uncertainty_value || '0',
          result: log.uncertainty_value && parseFloat(log.uncertainty_value) <= 0.001 ? 'Pass' : 'Fail',
          criteria: 'Calculated from repeatability test (2 × SD / standard weight) ≤ 0.001'
        });

        // fetch labels of referenced weights
        const idsFromCSV = (csv) => csv ? csv.split(',').map(s => s.trim()).filter(Boolean) : [];
        const allIds = [
          ...idsFromCSV(log.ecc_standard_weight_id),
          ...idsFromCSV(log.linearity_25_standard_weight_id),
          ...idsFromCSV(log.linearity_50_standard_weight_id),
          ...idsFromCSV(log.linearity_75_standard_weight_id),
          ...idsFromCSV(log.linearity_100_standard_weight_id),
          ...idsFromCSV(log.repeatability_standard_weight_id)
        ];
        const uniqIds = [...new Set(allIds)].map(id => Number(id)).filter(n => !Number.isNaN(n));
        if (uniqIds.length) {
          const { data: swData } = await supabase
            .from('standard_weight_master').select('id, standard_weight_id, capacity').in('id', uniqIds);
          setStandardWeightsForLog(swData || []);
        } else {
          setStandardWeightsForLog([]);
        }

        setShowLogbook(true);
        setIsVerified(true);
        toast.success('Calibration log loaded successfully.');
      } else {
        setErrorMessage('No verified calibration log found for the selected date or log ID.');
        setShowLogbook(false); setLogData(null);
        toast.error('No verified calibration log found.');
      }
    } catch (error) {
      console.error('Fetch Log Error:', error);
      setErrorMessage(`Failed to fetch log: ${error.message}`);
      toast.error(`Failed to fetch log: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------- Delete / Clear ---------------
  const clearForm = () => {
    if (!window.confirm('Are you sure you want to clear the form? This will reset all data.')) return;
    setLoading(true);
    try {
      setSelectedPlant(''); setSelectedSubplant(''); setSelectedDepartment(''); setSelectedArea('');
      setSelectedBalance(null); setSelectedWeightbox('');
      setStandardWeights([]); setCalibrationMaster(null); setStandardWeightsForLog([]);
      initializeCalibrationTests({});
      setIsSaved(false); setIsVerified(false); setShowLogbook(false);
      setLogId(null); setLogData(null); setErrorMessage(''); setCurrentStage('eccentricity');
      toast.success('Form cleared successfully.');
    } catch (error) {
      console.error('Clear Form Error:', error);
      toast.error('Failed to clear form.');
    } finally {
      setLoading(false);
    }
  };

  const deleteLog = async () => {
    if (!logId) { setErrorMessage('No calibration log selected for deletion.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('balance_monthly_calibration_log').delete().eq('id', logId);
      if (error) throw error;
      setLogId(null); setIsSaved(false); setIsVerified(false); setShowLogbook(false);
      setLogData(null); setErrorMessage('');
      toast.success('Calibration log deleted successfully.');
    } catch (error) {
      console.error('Delete Log Error:', error);
      setErrorMessage(`Failed to delete log: ${error.message}`);
      toast.error(`Failed to delete log: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------- Print / PDF ---------------
  const triggerPrint = useReactToPrint({
    content: () => logbookRef.current,
    documentTitle: `Monthly Calibration Log - ${selectedBalance?.balance_id || ''}`,
    pageStyle: `
      @page { size: A4; margin: 10mm; }
      @media print {
        .no-print { display: none !important; }
        .printable-logbook { font-size: 12px; line-height: 1.35; }
        .printable-logbook table { width: 100%; border-collapse: collapse; }
        .printable-logbook thead { display: table-header-group; }
        .printable-logbook tr { page-break-inside: avoid; }
      }
    `,
    removeAfterPrint: true
  });

  const printLogbook = () => {
    if (!logbookRef.current) { toast.error('Logbook not ready for printing.'); return; }
    setTimeout(() => triggerPrint && triggerPrint(), 50);
  };

  const saveLogbookAsPDF = () => {
    const el = logbookRef.current;
    if (!el) { toast.error('Logbook not ready for saving.'); return; }
    el.classList.add('pdf-safe');
    html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `Monthly_Calibration_Log_${selectedBalance?.balance_id || 'unknown'}_${new Date().toISOString().split('T')[0]}.pdf`,
        html2canvas: { scale: 1.6, background: '#fff', useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css'], avoid: ['.avoid-break'], before: ['.break-before'], after: ['.break-after'] }
      })
      .from(el)
      .save()
      .catch((err) => { console.error('html2pdf failed', err); toast.error('Failed to generate PDF.'); })
      .finally(() => { el.classList.remove('pdf-safe'); });
  };

  // --------------- Stage navigation ---------------
  const nextStage = () => {
    if (currentStage === 'eccentricity' && eccentricityTest.overallResult === 'Pass') {
      setCurrentStage('linearity');
    } else if (currentStage === 'linearity' && linearityTest.overallResult === 'Pass') {
      setCurrentStage('repeatability');
    } else if (currentStage === 'repeatability' && repeatabilityTest.overallResult === 'Pass' && uncertaintyTest.result === 'Pass') {
      setCurrentStage('verification');
    } else {
      setErrorMessage('Please ensure all tests pass before proceeding to the next stage.');
      toast.error('All tests must pass to proceed.');
    }
  };
  const prevStage = () => {
    if (currentStage === 'linearity') setCurrentStage('eccentricity');
    else if (currentStage === 'repeatability') setCurrentStage('linearity');
    else if (currentStage === 'verification') setCurrentStage('repeatability');
  };

  // --------------- Helpers ---------------
  const getSWLabelById = (id) => {
    const sw = (standardWeightsForLog.find(s => String(s.id) === String(id)) ||
                standardWeights.find(s => String(s.id) === String(id)));
    return sw ? `${sw.standard_weight_id} - ${sw.capacity} Kg` : 'N/A';
  };

  // --------------- Render ---------------
  if (!session) {
    return (
      <div className="max-w-7xl mx-auto p-5 text-center">
        <h2 className="text-2xl font-bold mb-4">Login Required</h2>
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={['google', 'github']} redirectTo={window.location.origin} />
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {/* Make html2pdf color-safe (avoid OKLCH) */}
      <style>{`
        .pdf-safe, .pdf-safe * {
          color: #111 !important;
          background: #fff !important;
          border-color: #333 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        .pdf-safe table { border-color: #333 !important; }
        .pdf-safe th, .pdf-safe td { border-color: #333 !important; }
        .printable-logbook h3, .printable-logbook h4, .printable-logbook p { margin: 4px 0; }
      `}</style>

      <div className="max-w-7xl mx-auto p-5 font-sans">
        <div className="border border-gray-300 p-6 rounded-lg">
          {/* Back button → requested route */}
          <div className="flex items-center mb-4">
            <button
              onClick={() => navigate('/weighing-balance/monthlycalibration-log')}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 flex items-center"
            >
              <ArrowLeft className="mr-2" size={16} /> Back To Home Page
            </button>
          </div>

          <h2 className="text-2xl font-bold mb-4 text-center">Monthly Calibration Process for Weighing Balance</h2>
          <p className="mb-4 text-center">
            The weighing balance shall not be used for any operational activities unless its monthly calibration has been successfully
            completed and documented. Calibration must be performed at least once per month.
          </p>

          {/* Selections */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-center no-print">
            <div>
              <label className="block mb-1">Plant:</label>
              <div className="relative">
                <select value={selectedPlant} onChange={handlePlantSelect} className="w-full p-2 border rounded" disabled={currentStage !== 'eccentricity' || isSaved || isVerified}>
                  <option value="">Select Plant</option>
                  {plants.map((plant) => (<option key={plant.id} value={plant.id}>{plant.description}</option>))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Subplant:</label>
              <div className="relative">
                <select value={selectedSubplant} onChange={handleSubplantSelect} className="w-full p-2 border rounded" disabled={currentStage !== 'eccentricity' || !selectedPlant || isSaved || isVerified}>
                  <option value="">Select Subplant</option>
                  {subplants.map((sp) => (<option key={sp.id} value={sp.id}>{sp.subplant_name}</option>))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Department:</label>
              <div className="relative">
                <select value={selectedDepartment} onChange={handleDepartmentSelect} className="w-full p-2 border rounded" disabled={currentStage !== 'eccentricity' || !selectedSubplant || isSaved || isVerified}>
                  <option value="">Select Department</option>
                  {departments.map((dept) => (<option key={dept.id} value={dept.id}>{dept.department_name}</option>))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Area:</label>
              <div className="relative">
                <select value={selectedArea} onChange={handleAreaSelect} className="w-full p-2 border rounded" disabled={currentStage !== 'eccentricity' || !selectedDepartment || isSaved || isVerified}>
                  <option value="">Select Area</option>
                  {areas.map((a) => (<option key={a.id} value={a.id}>{a.area_name}</option>))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Balance:</label>
              <div className="relative">
                <select
                  value={selectedBalance ? String(selectedBalance.id) : ''}
                  onChange={handleBalanceSelect}
                  className="w-full p-2 border rounded"
                  disabled={currentStage !== 'eccentricity' || !selectedArea || isSaved || isVerified}
                >
                  <option value="">Select Balance</option>
                  {balances.map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.description} ({b.balance_id})</option>
                  ))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Weightbox:</label>
              <div className="relative">
                <select value={selectedWeightbox} onChange={handleWeightboxSelect} className="w-full p-2 border rounded" disabled={currentStage !== 'eccentricity' || !weightboxes.length || isSaved || isVerified}>
                  <option value="">Select Weightbox</option>
                  {weightboxes.map((wb) => (<option key={wb.id} value={wb.id}>{wb.weightbox_id} ({wb.weightbox_type})</option>))}
                </select>
                <Scale className="absolute right-2 top-2 text-blue-500" size={16} />
              </div>
            </div>

            <div>
              <label className="block mb-1">Date for Log Fetch:</label>
              <div className="relative flex items-center">
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-2 border rounded text-center" />
                <Calendar className="absolute right-2 text-blue-500" size={16} />
              </div>
              <button
                onClick={() => fetchLogByDate()}
                className="mt-2 w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center justify-center"
                disabled={loading || !selectedBalance}
              >
                Fetch Log
              </button>
            </div>
          </div>

          {errorMessage && <p className="text-red-600 mt-4 text-center">{errorMessage}</p>}

          {/* Balance summary (pre-log) */}
          {selectedBalance && !showLogbook && (
            <div className="mt-6 text-center">
              <h3 className="text-xl font-bold mb-4">Balance Details</h3>
              <p>Balance ID: {selectedBalance.balance_id}</p>
              <p>Description: {selectedBalance.description}</p>
              <p>Capacity: {selectedBalance.capacity} kg</p>
              <p>Model: {selectedBalance.model}</p>
              <p>Least Count Digits: {leastCountDigits}</p>
              {calibrationMaster && (
                <div>
                  <p>Eccentricity Limit: {calibrationMaster.eccentricity_limit}</p>
                  <p>Linearity Limit: {calibrationMaster.linearity_limit}</p>
                  <p>Repeatability Limit: {calibrationMaster.repeatability_limit}</p>
                  <p>Uncertainty Limit: {calibrationMaster.uncertainty_limit}</p>
                </div>
              )}
            </div>
          )}

          {/* Stage forms */}
          {selectedBalance && !showLogbook && (
            <div className="mt-6">
              {currentStage === 'eccentricity' && (
                <EccentricityTest
                  eccentricityTest={eccentricityTest}
                  setEccentricityTest={setEccentricityTest}
                  standardWeights={standardWeights}
                  selectedBalance={selectedBalance}
                  leastCountDigits={leastCountDigits}
                  isSaved={isSaved}
                  isVerified={isVerified}
                  updateEccentricityTest={updateEccentricityTest}
                />
              )}

              {currentStage === 'linearity' && (
                <LinearityTest
                  linearityTest={linearityTest}
                  setLinearityTest={setLinearityTest}
                  standardWeights={standardWeights}
                  selectedBalance={selectedBalance}
                  leastCountDigits={leastCountDigits}
                  isSaved={isSaved}
                  isVerified={isVerified}
                  updateLinearityTest={updateLinearityTest}
                />
              )}

              {currentStage === 'repeatability' && (
                <RepeatabilityUncertaintyTest
                  repeatabilityTest={repeatabilityTest}
                  setRepeatabilityTest={setRepeatabilityTest}
                  uncertaintyTest={uncertaintyTest}
                  setUncertaintyTest={setUncertaintyTest}
                  standardWeights={standardWeights}
                  selectedBalance={selectedBalance}
                  leastCountDigits={leastCountDigits}
                  isSaved={isSaved}
                  isVerified={isVerified}
                  updateRepeatabilityTest={updateRepeatabilityTest}
                />
              )}

              {currentStage === 'verification' && (
                <VerificationSubmission
                  isSaved={isSaved}
                  isVerified={isVerified}
                  verifierUserId={verifierUserId}
                  setVerifierUserId={setVerifierUserId}
                  availableUsers={availableUsers}
                  userManagement={userManagement}
                  savePrimary={savePrimary}
                  verifySecondary={verifySecondary}
                  clearForm={clearForm}
                  deleteLog={deleteLog}
                  printLogbook={printLogbook}
                  saveLogbookAsPDF={saveLogbookAsPDF}
                  logId={logId}
                  showLogbook={showLogbook}
                  logbookRef={logbookRef}
                  logData={logData}
                  eccentricityTest={eccentricityTest}
                  linearityTest={linearityTest}
                  repeatabilityTest={repeatabilityTest}
                  uncertaintyTest={uncertaintyTest}
                  selectedBalance={selectedBalance}
                  loading={loading}
                  standardWeights={standardWeights}
                  leastCountDigits={leastCountDigits}
                />
              )}

              <div className="mt-6 flex justify-between no-print">
                {currentStage !== 'eccentricity' && (
                  <button onClick={prevStage} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600" disabled={loading}>
                    Previous
                  </button>
                )}
                {currentStage !== 'verification' && (
                  <button
                    onClick={nextStage}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    disabled={loading || (currentStage === 'eccentricity' && !selectedBalance)}
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}

          {/* LOGBOOK PREVIEW + TOOLBAR */}
          {showLogbook && logData && (
            <>
              <div className="mt-6 flex flex-wrap gap-3 justify-center no-print">
                <button onClick={printLogbook} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center">
                  <Printer className="mr-2" size={16} /> Print / Preview
                </button>
                <button onClick={saveLogbookAsPDF} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center">
                  <Save className="mr-2" size={16} /> Save as PDF
                </button>
              </div>

              <div ref={logbookRef} className="mt-6 printable-logbook max-w-4xl mx-auto">
                {/* Header with logo + company name */}
                <div className="flex items-center justify-center gap-3 mb-2 avoid-break">
                  <img
                    src={logoSrc}
                    alt="Company Logo"
                    className="h-12 w-auto"
                    crossOrigin="anonymous"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="text-center">
                    <h3 className="text-xl font-bold">{COMPANY_NAME}</h3>
                    <h3 className="text-xl font-bold">Monthly Calibration Logbook</h3>
                  </div>
                </div>

                <p className="text-center">Balance ID: {selectedBalance.balance_id || 'N/A'}</p>
                <p className="text-center">Date: {logData.created_at ? new Date(logData.created_at).toLocaleDateString() : 'N/A'}</p>
                <p className="text-center">Done by: {logData.user?.first_name || 'N/A'} {logData.user?.last_name || 'N/A'} ({logData.user?.email || 'N/A'})</p>
                <p className="text-center">Verified by: {logData.verifier?.first_name || 'N/A'} {logData.verifier?.last_name || 'N/A'} ({logData.verifier?.email || 'N/A'})</p>

                {/* Eccentricity */}
                <div className="section mt-4">
                  <h4 className="text-lg font-bold text-center">Eccentricity Test</h4>
                  <p className="text-center">Standard: {eccentricityTest.standard || 'N/A'}</p>
                  <p className="text-center">
                    Weights used:&nbsp;
                    {eccentricityTest.standardIds?.length
                      ? eccentricityTest.standardIds.map(id => getSWLabelById(id)).join(' + ')
                      : 'N/A'}
                  </p>

                  <table className="w-full border-collapse border border-gray-400 mx-auto">
                    <thead>
                      <tr>
                        <th className="border p-2 text-center">Position</th>
                        <th className="border p-2 text-center">Observed</th>
                        <th className="border p-2 text-center">Min</th>
                        <th className="border p-2 text-center">Max</th>
                        <th className="border p-2 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eccentricityTest.positions.map((pos, idx) => (
                        <tr key={idx}>
                          <td className="border p-2 text-center">{pos.name || 'N/A'}</td>
                          <td className="border p-2 text-center">{pos.observed !== '' ? parseFloat(pos.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{pos.min !== '' ? parseFloat(pos.min).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{pos.max !== '' ? parseFloat(pos.max).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{pos.result || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-center">Overall: {eccentricityTest.overallResult || 'N/A'}</p>
                </div>

                {/* Linearity */}
                <div className="section mt-6">
                  <h4 className="text-lg font-bold text-center">Linearity Test</h4>
                  <table className="w-full border-collapse border border-gray-400 mx-auto">
                    <thead>
                      <tr>
                        <th className="border p-2 text-center">Weight %</th>
                        <th className="border p-2 text-center">Standard / Weights</th>
                        <th className="border p-2 text-center">Observed</th>
                        <th className="border p-2 text-center">Min</th>
                        <th className="border p-2 text-center">Max</th>
                        <th className="border p-2 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linearityTest.points.map((point, idx) => (
                        <tr key={idx}>
                          <td className="border p-2 text-center">{point.weight || 'N/A'}</td>
                          <td className="border p-2 text-center">
                            {point.standardIds?.length
                              ? point.standardIds.map(id => getSWLabelById(id)).join(' + ')
                              : (point.standard || 'N/A')}
                          </td>
                          <td className="border p-2 text-center">{point.observed !== '' ? parseFloat(point.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{point.min !== '' ? parseFloat(point.min).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{point.max !== '' ? parseFloat(point.max).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{point.result || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-center">Overall: {linearityTest.overallResult || 'N/A'}</p>
                </div>

                {/* Repeatability */}
                <div className="section mt-6">
                  <h4 className="text-lg font-bold text-center">Repeatability Test</h4>
                  <p className="text-center">Standard: {repeatabilityTest.standard || 'N/A'}</p>
                  <p className="text-center">
                    Weights used:&nbsp;
                    {repeatabilityTest.standardIds?.length
                      ? repeatabilityTest.standardIds.map(id => getSWLabelById(id)).join(' + ')
                      : 'N/A'}
                  </p>

                  <table className="w-full border-collapse border border-gray-400 mx-auto">
                    <thead>
                      <tr>
                        <th className="border p-2 text-center">Trial</th>
                        <th className="border p-2 text-center">Observed</th>
                        <th className="border p-2 text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repeatabilityTest.trials.map((trial, idx) => (
                        <tr key={idx}>
                          <td className="border p-2 text-center">{trial.trial || 'N/A'}</td>
                          <td className="border p-2 text-center">{trial.observed !== '' ? parseFloat(trial.observed).toFixed(leastCountDigits) : 'N/A'}</td>
                          <td className="border p-2 text-center">{trial.result || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <p className="text-center">Mean: {repeatabilityTest.mean !== '' ? parseFloat(repeatabilityTest.mean).toFixed(leastCountDigits) : 'N/A'}</p>
                    <p className="text-center">SD: {repeatabilityTest.standardDeviation !== '' ? parseFloat(repeatabilityTest.standardDeviation).toFixed(leastCountDigits) : 'N/A'}</p>
                    <p className="text-center">RSD: {repeatabilityTest.rsd !== '' ? `${parseFloat(repeatabilityTest.rsd).toFixed(2)}%` : 'N/A'}</p>
                    <p className="text-center">Overall: {repeatabilityTest.overallResult || 'N/A'}</p>
                  </div>
                </div>

                {/* Uncertainty */}
                <div className="section mt-6">
                  <h4 className="text-lg font-bold text-center">Uncertainty Test</h4>
                  <p className="text-center">Value: {uncertaintyTest.value !== '' ? parseFloat(uncertaintyTest.value).toFixed(leastCountDigits) : 'N/A'}</p>
                  <p className="text-center">Result: {uncertaintyTest.result || 'N/A'}</p>
                </div>
              </div>
            </>
          )}

          {loading && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="animate-spin mr-2" /> Loading...
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default MonthlyCalibrationProcess;
