// src/components/masters/DepartmentMaster.jsx
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

/* -------------------- Component -------------------- */
export default function DepartmentMaster() {
  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [rows, setRows] = useState([]); // from vw_department_master
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    id: null,
    department_id: '',
    department_name: '',
    plant_uid: '',
    subplant_uid: '',
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
      supabase.from('vw_department_master').select('*').order('department_id', { ascending: true }),
    ])
      .then(([plRes, spRes, vwRes]) => {
        if (plRes.error) throw new Error(plRes.error.message);
        if (spRes.error) throw new Error(spRes.error.message);
        if (vwRes.error) throw new Error(vwRes.error.message);
        setPlants(plRes.data || []);
        setSubplants(spRes.data || []);
        setRows(vwRes.data || []);
      })
      .finally(() => setLoading(false));

    await toast.promise(p, {
      loading: 'Loading departments...',
      success: 'Loaded',
      error: (e) => `Load failed: ${e.message}`,
    });
  }

  // Infer plant when editing existing row (subplant selected but plant empty)
  useEffect(() => {
    if (form.subplant_uid && !form.plant_uid) {
      const sp = subplants.find((s) => s.id === form.subplant_uid);
      if (sp) {
        setForm((f) => ({ ...f, plant_uid: sp.plant_uid }));
      }
    }
  }, [form.subplant_uid, form.plant_uid, subplants]);

  const filteredSubplants = useMemo(() => {
    return form.plant_uid ? subplants.filter((sp) => sp.plant_uid === form.plant_uid) : [];
  }, [form.plant_uid, subplants]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const t = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.department_name?.toLowerCase().includes(t) ||
        r.department_id?.toLowerCase().includes(t) ||
        r.subplant_name?.toLowerCase().includes(t) ||
        r.plant_id?.toLowerCase().includes(t)
    );
  }, [search, rows]);

  async function handleSave(e) {
    e.preventDefault();

    if (!form.department_id || !form.department_name || !form.subplant_uid) {
      toast.error('All fields are required');
      return;
    }

    const sp = subplants.find((x) => x.id === form.subplant_uid);
    if (!sp) {
      toast.error('Subplant not found');
      return;
    }
    if (form.plant_uid && sp.plant_uid !== form.plant_uid) {
      toast.error('Subplant does not belong to selected plant');
      return;
    }

    setSaving(true);

    if (!editing) {
      const op = supabase
        .from('department_master')
        .select('id')
        .eq('department_id', form.department_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            throw new Error('Department ID must be unique');
          }
        })
        .then(() =>
          supabase.from('department_master').insert([
            {
              id: uuidv4(),
              department_id: form.department_id,
              department_name: form.department_name,
              subplant_uid: form.subplant_uid,
              status: form.status,
            },
          ])
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          setForm({
            id: null,
            department_id: '',
            department_name: '',
            plant_uid: '',
            subplant_uid: '',
            status: 'Active',
          });
          setEditing(false);
          return fetchAll();
        });

      await toast.promise(op, {
        loading: 'Saving department...',
        success: 'Department added',
        error: (e) => e.message,
      });
    } else {
      const op = supabase
        .from('department_master')
        .select('id')
        .eq('department_id', form.department_id)
        .neq('id', form.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            throw new Error('Department ID must be unique');
          }
        })
        .then(() =>
          supabase
            .from('department_master')
            .update({
              department_id: form.department_id,
              department_name: form.department_name,
              subplant_uid: form.subplant_uid,
              status: form.status,
            })
            .eq('id', form.id)
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          setForm({
            id: null,
            department_id: '',
            department_name: '',
            plant_uid: '',
            subplant_uid: '',
            status: 'Active',
          });
          setEditing(false);
          return fetchAll();
        });

      await toast.promise(op, {
        loading: 'Updating department...',
        success: 'Department updated',
        error: (e) => e.message,
      });
    }

    setSaving(false);
  }

  function handleEdit(row) {
    setForm({
      id: row.department_uid,
      department_id: row.department_id,
      department_name: row.department_name,
      plant_uid: row.subplant_plant_uid || row.plant_uid,
      subplant_uid: row.subplant_uid,
      status: row.department_status || 'Active',
    });
    setEditing(true);
    setActiveTab('manage');
  }

  async function handleDelete(id) {
    const op = supabase
      .from('department_master')
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
        Department Master
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
            <label className="block text-xs font-medium mb-1">Department ID</label>
            <IconInput
              icon={Hash}
              required
              value={form.department_id}
              onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              placeholder="DEPT-001"
              color="text-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Department Name</label>
            <IconInput
              icon={Tags}
              required
              value={form.department_name}
              onChange={(e) => setForm({ ...form, department_name: e.target.value })}
              placeholder="Quality Assurance"
              color="text-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect
              icon={Building2}
              value={form.plant_uid || ''}
              onChange={(e) => setForm((f) => ({ ...f, plant_uid: e.target.value, subplant_uid: '' }))}
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
              value={form.subplant_uid}
              onChange={(e) => setForm({ ...form, subplant_uid: e.target.value })}
              disabled={!form.plant_uid}
              leftColor="text-green-600"
            >
              <option value="">{form.plant_uid ? 'Select SubPlant' : 'Select a Plant first'}</option>
              {filteredSubplants.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.subplant_id} - {sp.subplant_name}
                  {sp.description ? ` (${sp.description})` : ''}
                </option>
              ))}
            </IconSelect>
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
              {editing ? 'Update' : 'Add'} Department
            </button>

            {editing && (
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm"
                onClick={() => {
                  setForm({
                    id: null,
                    department_id: '',
                    department_name: '',
                    plant_uid: '',
                    subplant_uid: '',
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
                placeholder="Search Department / Plant / SubPlant"
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
                  <th className="p-2 border text-left">Dept ID</th>
                  <th className="p-2 border text-left">Department Name</th>
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
                    <tr key={r.department_uid}>
                      <td className="p-2 border">{r.department_id}</td>
                      <td className="p-2 border">{r.department_name}</td>
                      <td className="p-2 border">
                        {r.subplant_id} - {r.subplant_name}
                      </td>
                      <td className="p-2 border">
                        {r.plant_id} - {r.plant_description}
                      </td>
                      <td className="p-2 border">
                        <Badge status={r.department_status} />
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
                            onClick={() => handleDelete(r.department_uid)}
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
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      No Departments Found
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
