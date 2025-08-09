import { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { useUOM } from '../../../contexts/UOMContext';
import UOMDropdown from '../../common/UOMDropdown';
import toast from 'react-hot-toast';
import {
  Box, Search
} from 'lucide-react';

const formatWithLeastCountDigits = (value, digits) => {
  const n = parseFloat(value);
  return isNaN(n) ? '-' : n.toFixed(parseInt(digits || 0));
};

const WeighingBalanceMaster = () => {
  const { uoms } = useUOM();
  const [balances, setBalances] = useState([]);
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('manage');
  const [selectedBalance, setSelectedBalance] = useState(null);

  const [form, setForm] = useState({
    id: null,
    balance_id: '',
    description: '',
    balance_type: '',
    plant_uid: '',
    subplant_uid: '',
    department_uid: '',
    area_uid: '',
    ip_address: '',
    port_no: '',
    uom: 'Kg',
    capacity: '',
    make: '',
    model: '',
    least_count: '',
    least_count_percent: '',
    least_count_digits: '',
    min_operating_capacity: '',
    max_operating_capacity: '',
    stamping_done_on: '',
    stamping_due_on: '',
    readability: '',
    status: 'Active'
  });

  const resetForm = () => setForm({
    id: null,
    balance_id: '',
    description: '',
    balance_type: '',
    plant_uid: '',
    subplant_uid: '',
    department_uid: '',
    area_uid: '',
    ip_address: '',
    port_no: '',
    uom: 'Kg',
    capacity: '',
    make: '',
    model: '',
    least_count: '',
    least_count_percent: '',
    least_count_digits: '',
    min_operating_capacity: '',
    max_operating_capacity: '',
    stamping_done_on: '',
    stamping_due_on: '',
    readability: '',
    status: 'Active'
  });

  useEffect(() => {
    loadDropdowns();
    loadBalances();

    const subscription = supabase
      .channel('weighing_balance_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weighing_balance_master' },
        () => loadBalances()
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  const loadDropdowns = async () => {
    try {
      const [p, sp, d, a] = await Promise.all([
        supabase.from('plant_master').select('id, plant_id, description'),
        supabase.from('subplant_master').select('id, subplant_id, subplant_name, plant_uid'),
        supabase.from('department_master').select('id, department_id, department_name, subplant_uid'),
        supabase.from('area_master').select('id, area_id, area_name, department_uid')
      ]);
      if (p.error) throw p.error;
      if (sp.error) throw sp.error;
      if (d.error) throw d.error;
      if (a.error) throw a.error;
      setPlants(p.data || []);
      setSubplants(sp.data || []);
      setDepartments(d.data || []);
      setAreas(a.data || []);
    } catch (error) {
      console.error('Load dropdowns error:', error);
      toast.error('Failed to load dropdown data');
    }
  };

  const loadBalances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vw_weighing_balance_master')
        .select('*')
        .order('balance_id');
      if (error) throw error;
      setBalances(data || []);
    } catch (error) {
      console.error('Load balances error:', error);
      toast.error('Failed to load balances');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.balance_id || !form.description) {
      toast.error('Balance ID and Description are required');
      return;
    }
    if (!form.plant_uid || !form.subplant_uid || !form.uom) {
      toast.error('Plant, Subplant, and UOM are required');
      return;
    }

    const isValidPlant = plants.some((p) => p.id === form.plant_uid);
    const isValidSubplant = subplants.some(
      (sp) => sp.id === form.subplant_uid && sp.plant_uid === form.plant_uid
    );
    if (!isValidPlant || !isValidSubplant) {
      toast.error('Invalid Plant or Subplant selected');
      return;
    }

    // Only include id if editing
    const payload = {
      balance_id: form.balance_id,
      description: form.description,
      balance_type: form.balance_type || null,
      plant_uid: form.plant_uid || null,
      subplant_uid: form.subplant_uid || null,
      department_uid: form.department_uid || null,
      area_uid: form.area_uid || null,
      ip_address: form.ip_address || null,
      port_no: form.port_no || null,
      uom: form.uom || null,
      capacity: form.capacity ? parseFloat(form.capacity) : null,
      make: form.make || null,
      model: form.model || null,
      least_count: form.least_count ? parseFloat(form.least_count) : null,
      least_count_percent: form.least_count_percent ? parseFloat(form.least_count_percent) : null,
      least_count_digits: form.least_count_digits ? parseInt(form.least_count_digits) : null,
      min_operating_capacity: form.min_operating_capacity ? parseFloat(form.min_operating_capacity) : null,
      max_operating_capacity: form.max_operating_capacity ? parseFloat(form.max_operating_capacity) : null,
      stamping_done_on: form.stamping_done_on || null,
      stamping_due_on: form.stamping_due_on || null,
      readability: form.readability || null,
      status: form.status || 'Active'
    };
    if (form.id) payload.id = form.id;

    try {
      const { data, error } = await supabase
        .from('weighing_balance_master')
        .upsert([payload], { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;

      resetForm();
      setSearch('');
      setSelectedBalance(null);

      setBalances((prev) =>
        form.id
          ? prev.map((b) => (b.id === data.id ? { ...b, ...data } : b))
          : [...prev, data]
      );

      toast.success(form.id ? '✅ Balance updated' : '✅ Balance added');
      await loadBalances();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(`❌ Save failed: ${error.message}`);
    }
  };

  const handleEdit = (bal) => {
    setActiveTab('manage');
    setForm({
      id: bal.id,
      balance_id: bal.balance_id || '',
      description: bal.description || '',
      balance_type: bal.balance_type || '',
      plant_uid: bal.plant_uid || '',
      subplant_uid: bal.subplant_uid || '',
      department_uid: bal.department_uid || '',
      area_uid: bal.area_uid || '',
      ip_address: bal.ip_address || '',
      port_no: bal.port_no || '',
      uom: bal.uom || 'Kg',
      capacity: bal.capacity || '',
      make: bal.make || '',
      model: bal.model || '',
      least_count: bal.least_count || '',
      least_count_percent: bal.least_count_percent || '',
      least_count_digits: bal.least_count_digits || '',
      min_operating_capacity: bal.min_operating_capacity || '',
      max_operating_capacity: bal.max_operating_capacity || '',
      stamping_done_on: bal.stamping_done_on?.slice(0, 10) || '',
      stamping_due_on: bal.stamping_due_on?.slice(0, 10) || '',
      readability: bal.readability || '',
      status: bal.status || 'Active'
    });
  };

  const handleDelete = (id) => {
    toast.promise(
      supabase.from('weighing_balance_master').delete().eq('id', id),
      { loading: 'Deleting...', success: '🗑️ Deleted', error: '❌ Delete failed' }
    ).then(() => loadBalances());
  };

  const filteredBalances = balances.filter(b =>
    (!selectedBalance || b.id === selectedBalance) && (
      b.balance_id?.toLowerCase().includes(search.toLowerCase()) ||
      b.description?.toLowerCase().includes(search.toLowerCase()) ||
      (b.plant_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.subplant_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.department_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.area_name || '').toLowerCase().includes(search.toLowerCase())
    )
  );

  const Row = ({ label, value }) => (
    <div className="flex flex-col">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-800">{value || '-'}</span>
    </div>
  );

  const renderInput = (key) => {
    const commonProps = {
      className: "border p-1 rounded",
      value: form[key] || '',
      onChange: (e) => setForm({ ...form, [key]: e.target.value })
    };

    if (key === 'plant_uid') return (
      <select {...commonProps} onChange={(e) => setForm({
        ...form,
        plant_uid: e.target.value,
        subplant_uid: '',
        department_uid: '',
        area_uid: ''
      })}>
        <option value=''>Select Plant</option>
        {plants.map(p => (
          <option key={p.id} value={p.id}>{p.plant_id} - {p.description}</option>
        ))}
      </select>
    );

    if (key === 'subplant_uid') return (
      <select {...commonProps} onChange={(e) => setForm({
        ...form,
        subplant_uid: e.target.value,
        department_uid: '',
        area_uid: ''
      })}>
        <option value=''>Select Subplant</option>
        {subplants.filter(sp => sp.plant_uid === form.plant_uid).map(sp => (
          <option key={sp.id} value={sp.id}>{sp.subplant_id} - {sp.subplant_name}</option>
        ))}
      </select>
    );

    if (key === 'department_uid') return (
      <select {...commonProps} onChange={(e) => setForm({
        ...form,
        department_uid: e.target.value,
        area_uid: ''
      })}>
        <option value=''>Select Department</option>
        {departments.filter(dep => dep.subplant_uid === form.subplant_uid).map(dep => (
          <option key={dep.id} value={dep.id}>{dep.department_id} - {dep.department_name}</option>
        ))}
      </select>
    );

    if (key === 'area_uid') return (
      <select {...commonProps}>
        <option value=''>Select Area</option>
        {areas.filter(area => area.department_uid === form.department_uid).map(area => (
          <option key={area.id} value={area.id}>{area.area_id} - {area.area_name}</option>
        ))}
      </select>
    );

    if (key === 'uom') return (
      <UOMDropdown
        value={form.uom}
        onChange={(value) => setForm({ ...form, uom: value })}
        className="border p-1 rounded"
      />
    );

    if (key === 'stamping_done_on' || key === 'stamping_due_on') return (
      <input type="date" {...commonProps} />
    );

    if (key === 'status') return (
      <select {...commonProps}>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>
    );

    return (
      <input
        type="text"
        placeholder={(() => {
          switch (key) {
            case 'balance_id': return 'e.g. BAL-001';
            case 'description': return '1 Kg Weighing Balance';
            case 'capacity': return 'e.g. 1';
            case 'ip_address': return 'Enter ip_address';
            case 'port_no': return 'Enter port_no';
            case 'make': return 'Mettler';
            case 'model': return 'XPR';
            default: return `Enter ${key}`;
          }
        })()}
        {...commonProps}
      />
    );
  };

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Box className="text-blue-600" /> Weighing Balance Master
      </h2>

      <div className="flex gap-2 mb-3">
        <button onClick={() => setActiveTab('manage')} className={`px-3 py-1 rounded ${activeTab === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Manage</button>
        <button onClick={() => setActiveTab('preview')} className={`px-3 py-1 rounded ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Preview All</button>
      </div>

      {activeTab === 'manage' && (
        <div className="p-3 border rounded bg-gray-50 shadow-inner">
          <h3 className="text-sm font-medium mb-2 text-gray-700">Balance Entry Form</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.keys(form).filter(key => key !== 'id').map(key => (
              <label key={key} className="flex flex-col text-sm">
                <span className="font-semibold">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                {renderInput(key)}
              </label>
            ))}
          </div>
          <div className="mt-4">
            <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-1.5 rounded">
              {form.id ? 'Update' : 'Add'} Balance
            </button>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-2 mb-3">
            <label className="text-sm font-medium flex items-center gap-1">
              <Search size={16} /> Select Balance
            </label>
            <select
              className="border p-1 rounded text-sm w-full max-w-md"
              value={selectedBalance || ''}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedBalance(value || null);
                setSearch(value ? balances.find(b => b.id === value)?.balance_id || '' : '');
              }}
            >
              <option value="">-- Search by Balance --</option>
              {balances.map(b => (
                <option key={b.id} value={b.id}>{b.balance_id} - {b.description}</option>
              ))}
            </select>
          </div>

          {filteredBalances.length === 0 && !loading ? (
            <div className="text-center text-gray-500 p-4">No balances found.</div>
          ) : (
            filteredBalances.map((b) => (
              <div key={b.id} className="border rounded mb-4 p-3 shadow-sm bg-white">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-blue-700">
                    {b.balance_id} — {b.description}
                  </h3>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${b.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {b.status}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Row label="Plant" value={b.plant_name} />
                  <Row label="SubPlant" value={b.subplant_name} />
                  <Row label="Department" value={b.department_name} />
                  <Row label="Area" value={b.area_name} />
                  <Row label="UOM" value={b.uom} />
                  <Row label="Capacity" value={formatWithLeastCountDigits(b.capacity, b.least_count_digits)} />
                  <Row label="Make" value={b.make} />
                  <Row label="Model" value={b.model} />
                  <Row label="IP Address" value={b.ip_address} />
                  <Row label="Port No." value={b.port_no} />
                  <Row label="Balance Type" value={b.balance_type} />
                  <Row label="Readability" value={b.readability} />
                  <Row label="Least Count" value={b.least_count} />
                  <Row label="Least Count %" value={b.least_count_percent} />
                  <Row label="LC Digits" value={b.least_count_digits} />
                  <Row label="Min Capacity" value={formatWithLeastCountDigits(b.min_operating_capacity, b.least_count_digits)} />
                  <Row label="Max Capacity" value={formatWithLeastCountDigits(b.max_operating_capacity, b.least_count_digits)} />
                  <Row label="Stamping Done" value={b.stamping_done_on?.slice(0, 10)} />
                  <Row label="Stamping Due" value={b.stamping_due_on?.slice(0, 10)} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleEdit(b)} className="bg-yellow-500 text-white px-3 py-1 rounded text-xs">✏️ Edit</button>
                  <button onClick={() => handleDelete(b.id)} className="bg-red-500 text-white px-3 py-1 rounded text-xs">🗑️ Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default WeighingBalanceMaster;