// src/components/masters/EquipmentMaster.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import {
  Layers,
  Tag,
  Wrench,
  CalendarCheck,
  CalendarClock,
  Building2,
  Factory,
  Briefcase,
  MapPin,
  Grid3X3,
  ChevronDown,
  Search,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';

/* ---------- UI helpers (prevent icon overlap) ---------- */
const IconInput = ({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  color = 'text-indigo-600',
}) => (
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
    <input
      type={type}
      required={required}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const IconSelect = ({
  icon: Icon,
  value,
  onChange,
  children,
  disabled = false,
  leftColor = 'text-blue-600',
}) => (
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}>
      <Icon className="h-4 w-4" />
    </div>
    <select
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      className="border rounded text-sm w-full p-2 pl-8 pr-8 appearance-none disabled:bg-gray-100"
    >
      {children}
    </select>
    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
      <ChevronDown className="h-4 w-4 text-gray-500" />
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const s = (status || 'Active').toLowerCase();
  const cls =
    s === 'active'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : 'bg-rose-100 text-rose-700 border-rose-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>
      {status || '-'}
    </span>
  );
};

/* -------------------- helpers: ID normalization & compare -------------------- */
const toStr = (v) => (v == null ? '' : String(v)); // normalize ids & fks to string
const same = (a, b) => toStr(a) === toStr(b); // safe equality for UUID or numeric

const normPlant = (r) => ({ id: toStr(r.id), plant_id: r.plant_id, description: r.description, status: r.status });
const normSubplant = (r) => ({
  id: toStr(r.id),
  subplant_id: r.subplant_id,
  subplant_name: r.subplant_name,
  plant_uid: toStr(r.plant_uid),
  status: r.status,
});
const normDept = (r) => ({
  id: toStr(r.id),
  department_id: r.department_id,
  department_name: r.department_name,
  subplant_uid: toStr(r.subplant_uid),
  status: r.status,
});
const normArea = (r) => ({
  id: toStr(r.id),
  area_id: r.area_id,
  area_name: r.area_name,
  department_uid: toStr(r.department_uid),
  status: r.status,
});
const normEqView = (r) => ({
  ...r,
  equipment_uid: toStr(r.equipment_uid),
  area_uid: toStr(r.area_uid),
  department_uid: toStr(r.department_uid),
  subplant_uid: toStr(r.subplant_uid),
  plant_uid: toStr(r.plant_uid),
});

/* -------------------- Component -------------------- */
export default function EquipmentMaster() {
  // dropdown sources
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);

  // table rows from view
  const [rows, setRows] = useState([]);

  // ui state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');

  // filters + form
  const [selectedPlant, setSelectedPlant] = useState('');
  const [selectedSubplant, setSelectedSubplant] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [form, setForm] = useState({
    id: null, // mapped to view.equipment_uid (asset.id)
    equipment_id: '',
    equipment_name: '',
    equipment_type: '',
    calibration_done_on: '',
    calibration_due_on: '',
    status: 'Active',
  });

  const [search, setSearch] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pl, sp, dp, ar] = await Promise.all([
        supabase.from('plant_master').select('id,plant_id,description,status').order('plant_id', { ascending: true }),
        supabase
          .from('subplant_master')
          .select('id,subplant_id,subplant_name,plant_uid,status')
          .order('subplant_id', { ascending: true }),
        supabase
          .from('department_master')
          .select('id,department_id,department_name,subplant_uid,status')
          .order('department_id', { ascending: true }),
        supabase.from('area_master').select('id,area_id,area_name,department_uid,status').order('area_id', { ascending: true }),
      ]);

      if (pl.error) throw pl.error;
      if (sp.error) throw sp.error;
      if (dp.error) throw dp.error;
      if (ar.error) throw ar.error;

      setPlants((pl.data || []).map(normPlant));
      setSubplants((sp.data || []).map(normSubplant));
      setDepartments((dp.data || []).map(normDept));
      setAreas((ar.data || []).map(normArea));

      // try v3, fallback to v2
      let eq = await supabase.from('vw_equipment_master_v3').select('*').order('equipment_id', { ascending: true });
      if (eq.error) {
        eq = await supabase.from('vw_equipment_master_v2').select('*').order('equipment_id', { ascending: true });
      }
      if (eq.error) throw eq.error;

      setRows((eq.data || []).map(normEqView));
      toast.success('Loaded');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  // cascading dropdown filters (IDs compared as strings)
  const filteredSubplants = useMemo(
    () => (selectedPlant ? subplants.filter((s) => same(s.plant_uid, selectedPlant)) : []),
    [selectedPlant, subplants]
  );

  const filteredDepartments = useMemo(
    () => (selectedSubplant ? departments.filter((d) => same(d.subplant_uid, selectedSubplant)) : []),
    [selectedSubplant, departments]
  );

  const filteredAreas = useMemo(
    () => (selectedDepartment ? areas.filter((a) => same(a.department_uid, selectedDepartment)) : []),
    [selectedDepartment, areas]
  );

  // search filter for table (uses view rows)
  const filteredRows = useMemo(() => {
    let data = rows;
    if (selectedPlant) data = data.filter((r) => same(r.plant_uid, selectedPlant));
    if (selectedSubplant) data = data.filter((r) => same(r.subplant_uid, selectedSubplant));
    if (selectedDepartment) data = data.filter((r) => same(r.department_uid, selectedDepartment));
    if (selectedArea) data = data.filter((r) => same(r.area_uid, selectedArea));
    if (search.trim()) {
      const t = search.toLowerCase();
      data = data.filter(
        (r) => r.equipment_id?.toLowerCase().includes(t) || r.equipment_name?.toLowerCase().includes(t)
      );
    }
    return data;
  }, [rows, selectedPlant, selectedSubplant, selectedDepartment, selectedArea, search]);

  function resetForm() {
    setForm({
      id: null,
      equipment_id: '',
      equipment_name: '',
      equipment_type: '',
      calibration_done_on: '',
      calibration_due_on: '',
      status: 'Active',
    });
    setSelectedPlant('');
    setSelectedSubplant('');
    setSelectedDepartment('');
    setSelectedArea('');
  }

  // upsert via RPC, fall back to direct asset upsert when RPC absent
  async function directAssetUpsert(payload) {
    // ensure category
    let category_uid = null;
    if (payload.equipment_type) {
      const cat = await supabase.from('asset_category').select('id').eq('name', payload.equipment_type).maybeSingle();
      if (cat.error) {
        throw cat.error;
      }
      if (cat.data?.id) {
        category_uid = cat.data.id;
      } else {
        const ins = await supabase.from('asset_category').insert([{ name: payload.equipment_type }]).select('id').single();
        if (ins.error) {
          throw ins.error;
        }
        category_uid = ins.data.id;
      }
    }

    const assetRow = {
      asset_code: payload.equipment_id,
      name: payload.equipment_name,
      category_uid: category_uid || null,
      status: payload.status || 'Active',
      calibration_done_on: payload.calibration_done_on || null,
      calibration_due_on: payload.calibration_due_on || null,
      area_uid: payload.area_uid || null,
    };

    if (!payload.asset_id) {
      const ins = await supabase.from('asset').insert([assetRow]).select('id').single();
      if (ins.error) {
        throw ins.error;
      }
      return ins.data.id;
    } else {
      const upd = await supabase.from('asset').update(assetRow).eq('id', payload.asset_id).select('id').single();
      if (upd.error) {
        throw upd.error;
      }
      return upd.data.id;
    }
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!form.equipment_id || !form.equipment_name || !selectedArea) {
      toast.error('Equipment ID, Name and Area are required');
      return;
    }

    const payload = {
      equipment_id: form.equipment_id,
      equipment_name: form.equipment_name,
      equipment_type: form.equipment_type || null,
      calibration_done_on: form.calibration_done_on || null,
      calibration_due_on: form.calibration_due_on || null,
      status: form.status || 'Active',
      area_uid: selectedArea, // keep as string; server handles type
      asset_id: form.id || null, // view.equipment_uid (asset.id) normalized to string
    };

    setSaving(true);
    try {
      const call = supabase.rpc('upsert_equipment_like', {
        p_equipment_id: payload.equipment_id,
        p_equipment_name: payload.equipment_name,
        p_equipment_type: payload.equipment_type,
        p_status: payload.status,
        p_cal_done: payload.calibration_done_on,
        p_cal_due: payload.calibration_due_on,
        p_area_uid: payload.area_uid,
      });

      const res = await toast.promise(call, {
        loading: form.id ? 'Updating equipment...' : 'Saving equipment...',
        success: form.id ? 'Equipment updated' : 'Equipment added',
        error: (err) => err?.message || 'Save failed',
      });

      if (res?.error || (res && res.status >= 400)) {
        throw res.error || new Error('RPC failed');
      }
    } catch (err) {
      // fallback to direct upsert if RPC signature type mismatches (e.g., bigint vs uuid)
      await toast.promise(directAssetUpsert({ ...payload, asset_id: payload.asset_id }), {
        loading: form.id ? 'Updating (direct)...' : 'Saving (direct)...',
        success: form.id ? 'Equipment updated' : 'Equipment added',
        error: (e) => e?.message || 'Save failed',
      });
    } finally {
      setSaving(false);
      resetForm();
      setActiveTab('preview');
      await loadAll();
    }
  }

  async function handleDelete(id) {
    const rid = toStr(id);
    if (!rid) {
      toast.error('Missing ID');
      return;
    }
    if (!window.confirm('Delete this equipment (asset)?')) return;

    const op = supabase.from('asset').delete().eq('id', rid);
    await toast.promise(op, {
      loading: 'Deleting...',
      success: 'Deleted',
      error: (e) => e?.message || 'Delete failed',
    });
    if (form.id === rid) resetForm();
    await loadAll();
  }

  const getType = (r) => r.equipment_type || r.equip_type || r.category_name || '';

  const dueClass = (isoDate) => {
    if (!isoDate) return '';
    const due = new Date(isoDate);
    const today = new Date();
    const next7 = new Date();
    next7.setDate(today.getDate() + 7);
    if (due < today) return 'bg-red-100 text-red-700 font-semibold';
    if (due >= today && due <= next7) return 'bg-yellow-100 text-yellow-800 font-semibold';
    return 'text-green-700';
  };

  function handleEdit(v) {
    const vv = normEqView(v);
    setForm({
      id: vv.equipment_uid,
      equipment_id: vv.equipment_id || '',
      equipment_name: vv.equipment_name || '',
      equipment_type: getType(vv) || '',
      calibration_done_on: vv.calibration_done_on || '',
      calibration_due_on: vv.calibration_due_on || '',
      status: vv.status || vv.equipment_status || 'Active',
    });
    setSelectedPlant(vv.plant_uid || '');
    setSelectedSubplant(vv.subplant_uid || '');
    setSelectedDepartment(vv.department_uid || '');
    setSelectedArea(vv.area_uid || '');
    setActiveTab('manage');
    toast.success(`✏️ Editing Equipment: ${vv.equipment_id}`);
  }

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 text-blue-700 flex items-center gap-2">
        <Layers className="h-5 w-5" />
        Equipment Master
      </h2>

      {/* Tabs */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => {
            setActiveTab('manage');
            resetForm();
          }}
          className={`px-3 py-1 rounded ${activeTab === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Manage
        </button>
        <button
          onClick={() => {
            setActiveTab('preview');
            resetForm();
          }}
          className={`px-3 py-1 rounded ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Preview All
        </button>
      </div>

      {activeTab === 'manage' && (
        <form
          onSubmit={handleSave}
          className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {/* Cascade selectors */}
          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect
              icon={Building2}
              value={selectedPlant}
              onChange={(e) => {
                setSelectedPlant(e.target.value);
                setSelectedSubplant('');
                setSelectedDepartment('');
                setSelectedArea('');
              }}
              leftColor="text-blue-600"
            >
              <option value="">Select Plant</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plant_id} - {p.description}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Subplant</label>
            <IconSelect
              icon={Factory}
              value={selectedSubplant}
              onChange={(e) => {
                setSelectedSubplant(e.target.value);
                setSelectedDepartment('');
                setSelectedArea('');
              }}
              leftColor="text-green-600"
              disabled={!selectedPlant}
            >
              <option value="">{selectedPlant ? 'Select Subplant' : 'Select a Plant first'}</option>
              {filteredSubplants.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.subplant_id} - {sp.subplant_name}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Department</label>
            <IconSelect
              icon={Briefcase}
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setSelectedArea('');
              }}
              leftColor="text-purple-600"
              disabled={!selectedSubplant}
            >
              <option value="">{selectedSubplant ? 'Select Department' : 'Select a Subplant first'}</option>
              {filteredDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.department_name}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Area</label>
            <IconSelect
              icon={Grid3X3}
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              leftColor="text-pink-600"
              disabled={!selectedDepartment}
            >
              <option value="">{selectedDepartment ? 'Select Area' : 'Select a Department first'}</option>
              {filteredAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.area_id} - {a.area_name}
                </option>
              ))}
            </IconSelect>
          </div>

          {/* Fields */}
          <div>
            <label className="block text-xs font-medium mb-1">Equipment ID</label>
            <IconInput
              icon={Tag}
              value={form.equipment_id}
              onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
              placeholder="EQ-001"
              color="text-indigo-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Equipment Name</label>
            <IconInput
              icon={Wrench}
              value={form.equipment_name}
              onChange={(e) => setForm({ ...form, equipment_name: e.target.value })}
              placeholder="Weighing Balance"
              color="text-green-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <IconSelect
              icon={Layers}
              value={form.equipment_type}
              onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
              leftColor="text-purple-600"
            >
              <option value="">Select Type</option>
              <option value="Portable">Portable</option>
              <option value="Immovable">Immovable</option>
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Calibration Done On</label>
            <IconInput
              icon={CalendarCheck}
              type="date"
              value={form.calibration_done_on}
              onChange={(e) => setForm({ ...form, calibration_done_on: e.target.value })}
              color="text-orange-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Calibration Due On</label>
            <IconInput
              icon={CalendarClock}
              type="date"
              value={form.calibration_due_on}
              onChange={(e) => setForm({ ...form, calibration_due_on: e.target.value })}
              color="text-red-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <IconSelect
              icon={Layers}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              leftColor={form.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </IconSelect>
          </div>

          <div className="flex items-end gap-2 col-span-full">
            <button
              type="submit"
              disabled={saving || !selectedArea}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.id ? 'Update Equipment' : 'Add Equipment'}
            </button>
            {form.id && (
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm"
                onClick={() => resetForm()}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'preview' && (
        <div className="mb-6 bg-white border rounded">
          <div className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="relative sm:col-span-2">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-indigo-500" />
                </div>
                <input
                  type="text"
                  placeholder="Search Equipment ID/Name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border p-2 rounded w-full text-sm pl-8"
                />
              </div>

              <IconSelect
                icon={Building2}
                value={selectedPlant}
                onChange={(e) => {
                  setSelectedPlant(e.target.value);
                  setSelectedSubplant('');
                  setSelectedDepartment('');
                  setSelectedArea('');
                }}
                leftColor="text-blue-600"
              >
                <option value="">Plant</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plant_id}
                  </option>
                ))}
              </IconSelect>

              <IconSelect
                icon={Factory}
                value={selectedSubplant}
                onChange={(e) => {
                  setSelectedSubplant(e.target.value);
                  setSelectedDepartment('');
                  setSelectedArea('');
                }}
                leftColor="text-green-600"
                disabled={!selectedPlant}
              >
                <option value="">Subplant</option>
                {filteredSubplants.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.subplant_id}
                  </option>
                ))}
              </IconSelect>

              <IconSelect
                icon={Briefcase}
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setSelectedArea('');
                }}
                leftColor="text-purple-600"
                disabled={!selectedSubplant}
              >
                <option value="">Department</option>
                {filteredDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.department_name}
                  </option>
                ))}
              </IconSelect>

              <IconSelect
                icon={MapPin}
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                leftColor="text-pink-600"
                disabled={!selectedDepartment}
              >
                <option value="">Area</option>
                {filteredAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.area_name}
                  </option>
                ))}
              </IconSelect>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">Equipment ID</th>
                  <th className="p-2 border text-left">Name</th>
                  <th className="p-2 border text-left">Type</th>
                  <th className="p-2 border text-left">Calib. Done</th>
                  <th className="p-2 border text-left">Calib. Due</th>
                  <th className="p-2 border text-left">Area</th>
                  <th className="p-2 border text-left">Department</th>
                  <th className="p-2 border text-left">Subplant</th>
                  <th className="p-2 border text-left">Plant</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="animate-pulse">
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-40" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-28" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-28" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-40" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-40" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-36" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-36" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-16" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-7 bg-gray-200 rounded w-28" />
                      </td>
                    </tr>
                  ))
                ) : filteredRows.length > 0 ? (
                  filteredRows.map((r) => (
                    <tr key={r.equipment_uid}>
                      <td className="p-2 border">{r.equipment_id}</td>
                      <td className="p-2 border">{r.equipment_name}</td>
                      <td className="p-2 border">{getType(r)}</td>
                      <td className="p-2 border">{r.calibration_done_on || '—'}</td>
                      <td className={`p-2 border ${dueClass(r.calibration_due_on)}`}>
                        {r.calibration_due_on || '—'}
                      </td>
                      <td className="p-2 border">
                        {r.area_code || r.area_name
                          ? `${r.area_code || ''}${r.area_code && r.area_name ? ' - ' : ''}${r.area_name || ''}`
                          : '—'}
                      </td>
                      <td className="p-2 border">
                        {r.department_code || r.department_name
                          ? `${r.department_code || ''}${
                              r.department_code && r.department_name ? ' - ' : ''
                            }${r.department_name || ''}`
                          : '—'}
                      </td>
                      <td className="p-2 border">
                        {r.subplant_code || r.subplant_name
                          ? `${r.subplant_code || ''}${
                              r.subplant_code && r.subplant_name ? ' - ' : ''
                            }${r.subplant_name || ''}`
                          : '—'}
                      </td>
                      <td className="p-2 border">
                        {r.plant_code || r.plant_name
                          ? `${r.plant_code || ''}${r.plant_code && r.plant_name ? ' - ' : ''}${r.plant_name || ''}`
                          : '—'}
                      </td>
                      <td className="p-2 border">
                        <StatusBadge status={r.status || r.equipment_status} />
                      </td>
                      <td className="p-2 border">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleEdit(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300"
                          >
                            <Pencil className="h-3.5 w-3.5 text-yellow-600" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r.equipment_uid)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="p-4 text-center text-gray-500">
                      No Equipment Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
