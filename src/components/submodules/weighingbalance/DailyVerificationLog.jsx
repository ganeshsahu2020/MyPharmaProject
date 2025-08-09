import {useState, useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {Search} from 'lucide-react';
import toast from 'react-hot-toast';
import Step2_Checklist, {useChecklistState} from './Step2_Checklist';
import Step3_WeightReadings, {useWeightReadingState} from './Step3_WeightReadings';

const DailyVerificationLog = () => {
  const [hierarchy, setHierarchy] = useState([]);
  const [filteredSubplants, setFilteredSubplants] = useState([]);
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [filteredAreas, setFilteredAreas] = useState([]);
  const [filteredBalances, setFilteredBalances] = useState([]);

  const [form, setForm] = useState({
    plant_uid: '',
    subplant_uid: '',
    department_uid: '',
    area_uid: '',
    balance_uid: ''
  });

  useEffect(() => {
    fetchHierarchy();
  }, []);

  const [checklistData, setChecklistData] = useState(useChecklistState());
  const [weightReadings, setWeightReadings] = useState(useWeightReadingState());

  const fetchHierarchy = async () => {
    const session = await supabase.auth.getSession();
    if (!session.data?.session) {
      toast.error('User session missing or expired. Please log in again.');
      return;
    }

    const {data, error} = await supabase
      .from('vw_weighing_balance_master')
      .select('plant_uid,plant_name,subplant_uid,subplant_name,department_uid,department_name,area_uid,area_name,id,balance_id,description');

    if (error) {
      toast.error('Failed to load hierarchy data');
    } else {
      setHierarchy(data || []);
    }
  };

  useEffect(() => {
    setFilteredSubplants(
      hierarchy.filter(h => h.plant_uid === form.plant_uid)
        .reduce((acc, curr) => {
          if (!acc.find(item => item.subplant_uid === curr.subplant_uid)) acc.push(curr);
          return acc;
        }, [])
    );
    setForm(prev => ({...prev, subplant_uid: '', department_uid: '', area_uid: '', balance_uid: ''}));
  }, [form.plant_uid]);

  useEffect(() => {
    setFilteredDepartments(
      hierarchy.filter(h => h.subplant_uid === form.subplant_uid)
        .reduce((acc, curr) => {
          if (!acc.find(item => item.department_uid === curr.department_uid)) acc.push(curr);
          return acc;
        }, [])
    );
    setForm(prev => ({...prev, department_uid: '', area_uid: '', balance_uid: ''}));
  }, [form.subplant_uid]);

  useEffect(() => {
    setFilteredAreas(
      hierarchy.filter(h => h.department_uid === form.department_uid)
        .reduce((acc, curr) => {
          if (!acc.find(item => item.area_uid === curr.area_uid)) acc.push(curr);
          return acc;
        }, [])
    );
    setForm(prev => ({...prev, area_uid: '', balance_uid: ''}));
  }, [form.department_uid]);

  useEffect(() => {
    setFilteredBalances(
      hierarchy.filter(h => h.area_uid === form.area_uid)
    );
    setForm(prev => ({...prev, balance_uid: ''}));
  }, [form.area_uid]);

  const handleChange = (e) => {
    setForm(prev => ({...prev, [e.target.name]: e.target.value}));
  };

  const handleSave = async () => {
    if (!form.balance_uid) {
      toast.error('Please select a balance');
      return;
    }

    if (checklistData.some(c => !c.status || !c.initials)) {
      toast.error('Please complete all checklist items with status and initials.');
      return;
    }

    if (weightReadings.some(r => !r.reading_1 || !r.reading_2 || !r.reading_3)) {
      toast.error('Please complete all weight readings.');
      return;
    }

    const {data: sessionData, error: sessionError} = await supabase.auth.getSession();
    if (!sessionData?.session) {
      toast.error('Session expired. Please login again.');
      return;
    }

    const user = sessionData.session.user;
    const verified_by_uid = user?.id || null;

    const {data: logData, error: logError} = await supabase
      .from('daily_verification_log')
      .insert({
        ...form,
        checklist_data: checklistData,
        verified_by_uid
      })
      .select()
      .single();

    if (logError || !logData) {
      toast.error('Failed to save main log.');
      return;
    }

    const verification_uid = logData.id;

    const readingsToInsert = weightReadings.map((reading) => ({
      verification_uid,
      capacity_level: reading.capacity_level,
      std_weight: reading.std_weight,
      reading_1: reading.reading_1,
      reading_2: reading.reading_2,
      reading_3: reading.reading_3,
      min_limit: reading.min_limit,
      max_limit: reading.max_limit,
      status: reading.status,
      remarks: reading.remarks || null
    }));

    const {error: readingsError} = await supabase
      .from('daily_verification_readings')
      .insert(readingsToInsert);

    if (readingsError) {
      toast.error('Log saved but failed to store readings.');
      return;
    }

    toast.success('Verification Log and Readings saved successfully');
  };

  return (
    <div className="p-4 space-y-4 bg-white rounded-xl shadow">
      <h2 className="text-xl font-bold">Daily Verification Log</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <select name="plant_uid" value={form.plant_uid} onChange={handleChange} className="border p-2 rounded">
          <option value="">Select Plant</option>
          {[...new Map(hierarchy.map(item => [item.plant_uid, item])).values()]
            .map(item => (
              <option key={item.plant_uid} value={item.plant_uid}>{item.plant_name}</option>
          ))}
        </select>

        <select name="subplant_uid" value={form.subplant_uid} onChange={handleChange} className="border p-2 rounded" disabled={!form.plant_uid}>
          <option value="">Select Subplant</option>
          {filteredSubplants.map(item => (
            <option key={item.subplant_uid} value={item.subplant_uid}>{item.subplant_name}</option>
          ))}
        </select>

        <select name="department_uid" value={form.department_uid} onChange={handleChange} className="border p-2 rounded" disabled={!form.subplant_uid}>
          <option value="">Select Department</option>
          {filteredDepartments.map(item => (
            <option key={item.department_uid} value={item.department_uid}>{item.department_name}</option>
          ))}
        </select>

        <select name="area_uid" value={form.area_uid} onChange={handleChange} className="border p-2 rounded" disabled={!form.department_uid}>
          <option value="">Select Area</option>
          {filteredAreas.map(item => (
            <option key={item.area_uid} value={item.area_uid}>{item.area_name}</option>
          ))}
        </select>

        <select name="balance_uid" value={form.balance_uid} onChange={handleChange} className="border p-2 rounded" disabled={!form.area_uid}>
          <option value="">Select Weighing Balance</option>
          {filteredBalances.map(item => (
            <option key={item.id} value={item.id}>{item.balance_id} - {item.description}</option>
          ))}
        </select>
      </div>

      <div className="border p-4 rounded bg-white shadow">
        <Step2_Checklist checklistData={checklistData} setChecklistData={setChecklistData} />
      </div>

      <div className="border p-4 rounded bg-white shadow">
        <Step3_WeightReadings weightReadings={weightReadings} setWeightReadings={setWeightReadings} />
      </div>

      <div className="text-right">
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Save Verification Log
        </button>
      </div>
    </div>
  );
};

export default DailyVerificationLog;
