// src/components/masters/AreaMaster.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import {
  Layers,
  Hash,
  Tags,
  Building2,
  Factory,
  ChevronDown,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  FileText,
} from 'lucide-react';

/* ---------- UI Helpers (prevent icon overlap) ---------- */
const IconInput = ({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  color = 'text-purple-500',
}) => (
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
    <input
      type={type}
      required={required}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const IconTextarea = ({ icon: Icon, value, onChange, placeholder, color = 'text-sky-500' }) => (
  <div className="relative">
    <div className={`absolute top-2 left-2 pointer-events-none ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={3}
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
  leftColor = 'text-blue-500',
}) => (
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}>
      <Icon className="h-4 w-4" />
    </div>
    <select
      value={value}
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

const Badge = ({ status }) => {
  const s = (status || 'Active').toLowerCase();
  const cls =
    s === 'active'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : 'bg-rose-100 text-rose-700 border-rose-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

const TypePill = ({ type }) => {
  const t = (type || '').toLowerCase();
  if (t === 'classified area') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 border border-indigo-200">
        <ShieldCheck className="h-3.5 w-3.5" />
        Classified Area
      </span>
    );
  }
  if (t === 'non-classified area') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">
        <ShieldAlert className="h-3.5 w-3.5" />
        Non-Classified Area
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border">
      —
    </span>
  );
};

/* -------------------- Component -------------------- */
export default function AreaMaster() {
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]); // from vw_area_master

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    id: null,
    area_id: '',
    area_name: '',
    description: '',
    area_type: 'Classified Area',
    plant_uid: '', // UI-only chain
    subplant_uid: '', // UI-only chain
    department_uid: '', // required for DB (trigger fills plant/subplant)
    status: 'Active',
  });

  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const p = Promise.all([
      supabase.from('plant_master').select('id,plant_id,description').order('plant_id', { ascending: true }),
      supabase
        .from('subplant_master')
        .select('id,subplant_id,subplant_name,plant_uid,description,status')
        .order('subplant_id', { ascending: true }),
      supabase
        .from('department_master')
        .select('id,department_id,department_name,subplant_uid,status')
        .order('department_id', { ascending: true }),
      supabase.from('vw_area_master').select('*').order('area_id', { ascending: true }),
    ])
      .then(([plRes, spRes, dpRes, vwRes]) => {
        if (plRes.error) throw new Error(plRes.error.message);
        if (spRes.error) throw new Error(spRes.error.message);
        if (dpRes.error) throw new Error(dpRes.error.message);
        if (vwRes.error) throw new Error(vwRes.error.message);
        setPlants(plRes.data || []);
        setSubplants(spRes.data || []);
        setDepartments(dpRes.data || []);
        setRows(vwRes.data || []);
      })
      .finally(() => setLoading(false));

    await toast.promise(p, {
      loading: 'Loading areas...',
      success: 'Loaded',
      error: (e) => `Load failed: ${e.message}`,
    });
  }

  // Chain filters
  const subplantsByPlant = useMemo(() => {
    return form.plant_uid ? subplants.filter((s) => s.plant_uid === form.plant_uid) : [];
  }, [form.plant_uid, subplants]);

  const departmentsBySubplant = useMemo(() => {
    return form.subplant_uid ? departments.filter((d) => d.subplant_uid === form.subplant_uid) : [];
  }, [form.subplant_uid, departments]);

  // Infer plant/subplant from department (when editing or user picks department first)
  useEffect(() => {
    if (form.department_uid) {
      const d = departments.find((x) => x.id === form.department_uid);
      if (d) {
        const sp = subplants.find((s) => s.id === d.subplant_uid);
        if (sp) {
          setForm((f) => ({ ...f, subplant_uid: sp.id, plant_uid: sp.plant_uid }));
        }
      }
    }
  }, [form.department_uid, departments, subplants]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const t = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.area_name?.toLowerCase().includes(t) ||
        r.area_id?.toLowerCase().includes(t) ||
        r.department_name?.toLowerCase().includes(t) ||
        r.subplant_name?.toLowerCase().includes(t) ||
        r.plant_id?.toLowerCase().includes(t)
    );
  }, [search, rows]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.area_id || !form.area_name || !form.department_uid) {
      toast.error('Area ID, Name, and Department are required');
      return;
    }

    setSaving(true);

    if (!editing) {
      const op = supabase
        .from('area_master')
        .select('id')
        .eq('area_id', form.area_id)
        .eq('department_uid', form.department_uid)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            throw new Error('Area ID must be unique within the selected Department');
          }
        })
        .then(() =>
          supabase.from('area_master').insert([
            {
              id: uuidv4(),
              area_id: form.area_id,
              area_name: form.area_name,
              description: form.description || null,
              area_type: form.area_type || null,
              department_uid: form.department_uid,
              status: form.status,
              // plant_uid & subplant_uid are auto-filled by trigger
            },
          ])
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          setForm({
            id: null,
            area_id: '',
            area_name: '',
            description: '',
            area_type: 'Classified Area',
            plant_uid: '',
            subplant_uid: '',
            department_uid: '',
            status: 'Active',
          });
          setEditing(false);
          return fetchAll();
        });

      await toast.promise(op, {
        loading: 'Saving area...',
        success: 'Area added',
        error: (e) => e.message,
      });
    } else {
      const op = supabase
        .from('area_master')
        .select('id')
        .eq('area_id', form.area_id)
        .eq('department_uid', form.department_uid)
        .neq('id', form.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            throw new Error('Area ID must be unique within the selected Department');
          }
        })
        .then(() =>
          supabase
            .from('area_master')
            .update({
              area_id: form.area_id,
              area_name: form.area_name,
              description: form.description || null,
              area_type: form.area_type || null,
              department_uid: form.department_uid,
              status: form.status,
            })
            .eq('id', form.id)
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          setForm({
            id: null,
            area_id: '',
            area_name: '',
            description: '',
            area_type: 'Classified Area',
            plant_uid: '',
            subplant_uid: '',
            department_uid: '',
            status: 'Active',
          });
          setEditing(false);
          return fetchAll();
        });

      await toast.promise(op, {
        loading: 'Updating area...',
        success: 'Area updated',
        error: (e) => e.message,
      });
    }

    setSaving(false);
  }

  function handleEdit(r) {
    setForm({
      id: r.area_uid,
      area_id: r.area_id,
      area_name: r.area_name,
      description: r.area_description || '',
      area_type: r.area_type || 'Classified Area',
      // prefer chain derived from department
      plant_uid: r.plant_uid,
      subplant_uid: r.area_subplant_uid || r.subplant_uid_view,
      department_uid: r.department_uid,
      status: r.area_status || 'Active',
    });
    setEditing(true);
    setActiveTab('manage');
  }

  async function handleDelete(id) {
    const op = supabase
      .from('area_master')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) throw new Error(error.message);
        return fetchAll();
      });

    await toast.promise(op, { loading: 'Deleting...', success: 'Deleted', error: (e) => e.message });
  }

  return (
    <div className="p-3 max-w-6xl mx-auto">
      <h2 className="text-lg font-bold mb-3 text-blue-700 flex items-center gap-2">
        <Layers className="h-5 w-5" />
        Area Master
      </h2>

      <div className="flex gap-3 mb-3">
        <button
          onClick={() => setActiveTab('manage')}
          className={`px-3 py-1 rounded ${activeTab === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Manage
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1 rounded ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Preview All
        </button>
      </div>

      {activeTab === 'manage' && (
        <form
          onSubmit={handleSave}
          className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Area ID</label>
            <IconInput
              icon={Hash}
              required
              value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}
              placeholder="AREA-001"
              color="text-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Area Name</label>
            <IconInput
              icon={Tags}
              required
              value={form.area_name}
              onChange={(e) => setForm({ ...form, area_name: e.target.value })}
              placeholder="Dispensing Room"
              color="text-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Area Type</label>
            <IconSelect
              icon={ShieldCheck}
              value={form.area_type}
              onChange={(e) => setForm({ ...form, area_type: e.target.value })}
              leftColor={form.area_type === 'Classified Area' ? 'text-indigo-600' : 'text-amber-600'}
            >
              <option value="Classified Area">Classified Area</option>
              <option value="Non-Classified Area">Non-Classified Area</option>
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect
              icon={Building2}
              value={form.plant_uid || ''}
              onChange={(e) => setForm((f) => ({ ...f, plant_uid: e.target.value, subplant_uid: '', department_uid: '' }))}
              leftColor="text-blue-600"
            >
              <option value="">Select Plant</option>
              {plants.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.plant_id} - {pl.description}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">SubPlant</label>
            <IconSelect
              icon={Factory}
              value={form.subplant_uid || ''}
              onChange={(e) => setForm((f) => ({ ...f, subplant_uid: e.target.value, department_uid: '' }))}
              disabled={!form.plant_uid}
              leftColor="text-green-600"
            >
              <option value="">{form.plant_uid ? 'Select SubPlant' : 'Select a Plant first'}</option>
              {subplantsByPlant.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.subplant_id} - {sp.subplant_name}
                  {sp.description ? ` (${sp.description})` : ''}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Department</label>
            <IconSelect
              icon={Layers}
              value={form.department_uid || ''}
              onChange={(e) => setForm({ ...form, department_uid: e.target.value })}
              disabled={!form.subplant_uid}
              leftColor="text-fuchsia-600"
            >
              <option value="">{form.subplant_uid ? 'Select Department' : 'Select a SubPlant first'}</option>
              {departmentsBySubplant.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.department_id} - {d.department_name}
                </option>
              ))}
            </IconSelect>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium mb-1">Description</label>
            <IconTextarea
              icon={FileText}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description of the area..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <IconSelect
              icon={form.status === 'Active' ? CheckCircle2 : XCircle}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              leftColor={form.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </IconSelect>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Update' : 'Add'} Area
            </button>

            {editing && (
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm"
                onClick={() => {
                  setForm({
                    id: null,
                    area_id: '',
                    area_name: '',
                    description: '',
                    area_type: 'Classified Area',
                    plant_uid: '',
                    subplant_uid: '',
                    department_uid: '',
                    status: 'Active',
                  });
                  setEditing(false);
                }}
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
            <div className="relative">
              <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-indigo-500" />
              </div>
              <input
                type="text"
                placeholder="Search Area / Dept / SubPlant / Plant"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border p-2 rounded w-full text-sm pl-8"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">Area ID</th>
                  <th className="p-2 border text-left">Area Name</th>
                  <th className="p-2 border text-left">Type</th>
                  <th className="p-2 border text-left">Department</th>
                  <th className="p-2 border text-left">SubPlant</th>
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
                        <div className="h-4 bg-gray-200 rounded w-32" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-40" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-44" />
                      </td>
                      <td className="p-2 border">
                        <div className="h-4 bg-gray-200 rounded w-44" />
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
                    <tr key={r.area_uid}>
                      <td className="p-2 border">{r.area_id}</td>
                      <td className="p-2 border">{r.area_name}</td>
                      <td className="p-2 border">
                        <TypePill type={r.area_type} />
                      </td>
                      <td className="p-2 border">
                        {r.department_id} - {r.department_name}
                      </td>
                      <td className="p-2 border">
                        {r.subplant_id} - {r.subplant_name}
                      </td>
                      <td className="p-2 border">
                        {r.plant_id} - {r.plant_description}
                      </td>
                      <td className="p-2 border">
                        <Badge status={r.area_status} />
                      </td>
                      <td className="p-2 border">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleEdit(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300"
                          >
                            <Pencil className="h-3.5 w-3.5 text-yellow-500" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r.area_uid)}
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
                    <td colSpan={8} className="p-4 text-center text-gray-500">
                      No Areas Found
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
