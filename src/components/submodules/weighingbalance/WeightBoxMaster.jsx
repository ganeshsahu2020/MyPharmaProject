import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import { Box, Package, Building2, MapPin, Factory, Layers, Edit3, Trash2, Loader2, CheckCircle2 } from 'lucide-react';

const WeightBoxMaster = () => {
  const [rows, setRows] = useState([]);
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('manage');
  const [form, setForm] = useState({
    id: null,
    weightbox_id: '',
    weightbox_type: '',
    stamping_done_on: '',
    stamping_due_on: '',
    status: 'Active',
    plant_uid: '',
    subplant_uid: '',
    department_uid: '',
    area_uid: ''
  });

  // Load table data from weightbox_master
  const loadList = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('public_vw_weightbox') // Corrected to use the proper view
      .select(`
        id,
        weightbox_id,
        weightbox_type,
        stamping_done_on,
        stamping_due_on,
        status,
        plant_name,
        subplant_name,
        department_name,
        area_name
      `)
      .order('weightbox_id');
    if (error) {
      toast.error('❌ Failed to load: ' + error.message);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  // Load plants
  const loadPlants = async () => {
    const { data, error } = await supabase
      .from('plant_master')
      .select('id, plant_id, description')
      .order('plant_id');
    if (!error) setPlants(data || []);
  };

  useEffect(() => {
    loadList();
    loadPlants();
  }, []);

  // Cascading dropdowns
  const onPlantChange = async (e) => {
    const plant_uid = e.target.value;
    setForm({ ...form, plant_uid, subplant_uid: '', department_uid: '', area_uid: '' });
    setDepartments([]);
    setAreas([]);
    if (!plant_uid) { setSubplants([]); return; }
    const { data } = await supabase
      .from('subplant_master')
      .select('id, subplant_id, subplant_name')
      .eq('plant_uid', plant_uid)
      .order('subplant_id');
    setSubplants(data || []);
  };

  const onSubplantChange = async (e) => {
    const subplant_uid = e.target.value;
    setForm({ ...form, subplant_uid, department_uid: '', area_uid: '' });
    setAreas([]);
    if (!subplant_uid) { setDepartments([]); return; }
    const { data } = await supabase
      .from('department_master')
      .select('id, department_id, department_name')
      .eq('subplant_uid', subplant_uid)
      .order('department_id');
    setDepartments(data || []);
  };

  const onDepartmentChange = async (e) => {
    const department_uid = e.target.value;
    setForm({ ...form, department_uid, area_uid: '' });
    if (!department_uid) { setAreas([]); return; }
    const { data } = await supabase
      .from('area_master')
      .select('id, area_id, area_name')
      .eq('department_uid', department_uid)
      .order('area_id');
    setAreas(data || []);
  };

  // Edit
  const onEdit = async (wb) => {
    setActiveTab('manage');
    setForm({
      id: wb.id,
      weightbox_id: wb.weightbox_id,
      weightbox_type: wb.weightbox_type,
      stamping_done_on: wb.stamping_done_on ? wb.stamping_done_on.slice(0, 10) : '',
      stamping_due_on: wb.stamping_due_on ? wb.stamping_due_on.slice(0, 10) : '',
      status: wb.status,
      plant_uid: wb.plant_uid,
      subplant_uid: wb.subplant_uid,
      department_uid: wb.department_uid,
      area_uid: wb.area_uid
    });

    if (wb.plant_uid) {
      const { data: sp } = await supabase
        .from('subplant_master')
        .select('id, subplant_id, subplant_name')
        .eq('plant_uid', wb.plant_uid);
      setSubplants(sp || []);
    }
    if (wb.subplant_uid) {
      const { data: d } = await supabase
        .from('department_master')
        .select('id, department_id, department_name')
        .eq('subplant_uid', wb.subplant_uid);
      setDepartments(d || []);
    }
    if (wb.department_uid) {
      const { data: a } = await supabase
        .from('area_master')
        .select('id, area_id, area_name')
        .eq('department_uid', wb.department_uid);
      setAreas(a || []);
    }
  };

  // Save
  const onSave = async () => {
    if (!form.weightbox_id || !form.weightbox_type || !form.area_uid) {
      toast.error('Weight Box ID, Type, and Area are required');
      return;
    }
    if (!form.department_uid || !form.subplant_uid || !form.plant_uid) {
      toast.error('Select Plant → Subplant → Department → Area');
      return;
    }

    const payload = {
      weightbox_id: form.weightbox_id,
      weightbox_type: form.weightbox_type,
      stamping_done_on: form.stamping_done_on || null,
      stamping_due_on: form.stamping_due_on || null,
      status: form.status,
      plant_uid: form.plant_uid,
      subplant_uid: form.subplant_uid,
      department_uid: form.department_uid,
      area_uid: form.area_uid
    };

    let res;
    if (form.id) {
      res = await supabase
        .from('weightbox_master')
        .update(payload)
        .eq('id', form.id)
        .select()
        .single();
    } else {
      res = await supabase
        .from('weightbox_master')
        .insert(payload)
        .select()
        .single();
    }

    if (res.error) {
      toast.error('❌ Save failed: ' + res.error.message);
      return;
    }

    toast.success(form.id ? '✅ Updated' : '✅ Added');
    loadList();
    setForm({
      id: null, weightbox_id: '', weightbox_type: '', stamping_done_on: '', stamping_due_on: '',
      status: 'Active', plant_uid: '', subplant_uid: '', department_uid: '', area_uid: ''
    });
  };

  // Delete
  const onDelete = async (id) => {
    const { error } = await supabase
      .from('weightbox_master')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('❌ Delete failed');
      return;
    }
    toast.success('🗑️ Deleted');
    loadList();
  };

  // Search filter
  const filtered = useMemo(() => rows.filter(w => {
    const q = search.toLowerCase();
    return (
      (w.weightbox_id || '').toLowerCase().includes(q) ||
      (w.weightbox_type || '').toLowerCase().includes(q) ||
      (w.plant_name || '').toLowerCase().includes(q) ||
      (w.subplant_name || '').toLowerCase().includes(q) ||
      (w.department_name || '').toLowerCase().includes(q) ||
      (w.area_name || '').toLowerCase().includes(q)
    );
  }), [rows, search]);

  return (
    <div className="p-3 max-w-6xl mx-auto">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Package className="text-purple-600" /> Standard Weight Box Master
      </h2>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setActiveTab('manage')}
          className={`px-3 py-1 rounded ${activeTab === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
          Manage
        </button>
        <button onClick={() => setActiveTab('preview')}
          className={`px-3 py-1 rounded ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
          Preview All
        </button>
      </div>

      {/* Manage Tab Content */}
      {activeTab === 'manage' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {/* Form Inputs for weightbox_master */}
            <label className="flex flex-col text-sm font-semibold">
              <Box size={14} className="text-purple-600" /> Weight Box ID
              <input value={form.weightbox_id} onChange={e => setForm({ ...form, weightbox_id: e.target.value })}
                className="border p-1 rounded" />
            </label>
            <label className="flex flex-col text-sm font-semibold">
              <Layers size={14} className="text-blue-600" /> Weight Box Type
              <select value={form.weightbox_type} onChange={e => setForm({ ...form, weightbox_type: e.target.value })}
                className="border p-1 rounded">
                <option value="">Select Type</option>
                <option value="SS Weight Box">SS Weight Box</option>
                <option value="Analytical Weight Box">Analytical Weight Box</option>
              </select>
            </label>

            <label className="flex flex-col text-sm font-semibold">
              <CheckCircle2 size={14} className="text-emerald-600" /> Status
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="border p-1 rounded">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>

            {/* Other Form Inputs */}
            <label className="flex flex-col text-sm font-semibold">Stamped On
              <input type="date" value={form.stamping_done_on}
                onChange={e => setForm({ ...form, stamping_done_on: e.target.value })}
                className="border p-1 rounded" />
            </label>

            <label className="flex flex-col text-sm font-semibold">Due On
              <input type="date" value={form.stamping_due_on}
                onChange={e => setForm({ ...form, stamping_due_on: e.target.value })}
                className="border p-1 rounded" />
            </label>

            {/* Plant Selection */}
            <label className="flex flex-col text-sm font-semibold">
              <Building2 size={14} className="text-green-600" /> Plant
              <select value={form.plant_uid} onChange={onPlantChange} className="border p-1 rounded">
                <option value="">Select Plant</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_id} - {p.description}</option>)}
              </select>
            </label>

            {/* Subplant, Department, and Area Selection */}
            <label className="flex flex-col text-sm font-semibold">
              <Factory size={14} className="text-indigo-600" /> SubPlant
              <select value={form.subplant_uid} onChange={onSubplantChange} className="border p-1 rounded">
                <option value="">Select SubPlant</option>
                {subplants.map(sp => <option key={sp.id} value={sp.id}>{sp.subplant_id} - {sp.subplant_name}</option>)}
              </select>
            </label>

            <label className="flex flex-col text-sm font-semibold">
              <Box size={14} className="text-orange-600" /> Department
              <select value={form.department_uid} onChange={onDepartmentChange} className="border p-1 rounded">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.department_id} - {d.department_name}</option>)}
              </select>
            </label>

            <label className="flex flex-col text-sm font-semibold">
              <MapPin size={14} className="text-red-600" /> Area
              <select value={form.area_uid} onChange={e => setForm({ ...form, area_uid: e.target.value })}
                className="border p-1 rounded">
                <option value="">Select Area</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.area_id} - {a.area_name}</option>)}
              </select>
            </label>
          </div>

          <button onClick={onSave} className="bg-blue-600 text-white px-3 py-1 rounded mb-3">
            {form.id ? 'Update' : 'Add'} Weight Box
          </button>
        </>
      )}

      {/* Preview Tab Content */}
      {activeTab === 'preview' && (
        <div className="overflow-x-auto">
          <input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}
            className="border p-1 rounded text-sm w-full sm:w-1/3 mb-3" />
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="animate-spin" /> Loading weight boxes...
            </div>
          ) : (
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-1">ID</th>
                  <th className="border p-1">Type</th>
                  <th className="border p-1">Plant</th>
                  <th className="border p-1">Subplant</th>
                  <th className="border p-1">Department</th>
                  <th className="border p-1">Area</th>
                  <th className="border p-1">Stamped On</th>
                  <th className="border p-1">Due On</th>
                  <th className="border p-1">Status</th>
                  <th className="border p-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(wb => (
                  <tr key={wb.id}>
                    <td className="border p-1">{wb.weightbox_id}</td>
                    <td className="border p-1">{wb.weightbox_type}</td>
                    <td className="border p-1">{wb.plant_name}</td>
                    <td className="border p-1">{wb.subplant_name}</td>
                    <td className="border p-1">{wb.department_name}</td>
                    <td className="border p-1">{wb.area_name}</td>
                    <td className="border p-1">{wb.stamping_done_on?.slice(0, 10)}</td>
                    <td className="border p-1">{wb.stamping_due_on?.slice(0, 10)}</td>
                    <td className="border p-1">
                      <span className={`px-2 py-0.5 rounded text-xs ${wb.status === 'Active' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{wb.status}</span>
                    </td>
                    <td className="border p-1 flex gap-1">
                      <button onClick={() => onEdit(wb)} className="bg-yellow-500 text-white p-1 rounded"><Edit3 size={14} /></button>
                      <button onClick={() => onDelete(wb.id)} className="bg-red-500 text-white p-1 rounded"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={10} className="text-center p-3 text-gray-500">No records found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default WeightBoxMaster;
