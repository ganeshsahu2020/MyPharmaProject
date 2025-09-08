// src/components/masters/SubPlantMaster.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import {
  Hash,
  ClipboardList,
  Building2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Search,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';

/* ---------- UI Helpers (prevent icon overlap) ---------- */
const IconInput = ({
  icon: Icon,
  inputRef,
  defaultValue,
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
      ref={inputRef}
      type={type}
      required={required}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const IconSelect = ({
  icon: Icon,
  selectRef,
  defaultValue,
  children,
  disabled = false,
  leftColor = 'text-blue-600',
  required = false,
}) => (
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}>
      <Icon className="h-4 w-4" />
    </div>
    <select
      ref={selectRef}
      defaultValue={defaultValue}
      disabled={disabled}
      required={required}
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
const SubPlantMaster = () => {
  const [rows, setRows] = useState([]); // from vw_subplant_master
  const [plants, setPlants] = useState([]); // for plant select
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formKey, setFormKey] = useState(0); // refresh defaultValue on edit

  // Uncontrolled refs (so typing isn't wiped)
  const subplantIdRef = useRef(null);
  const subplantNameRef = useRef(null);
  const descriptionRef = useRef(null); // base column: description
  const plantUidRef = useRef(null);
  const statusRef = useRef(null); // base column: status

  const [current, setCurrent] = useState({
    id: null,
    subplant_id: '',
    subplant_name: '',
    description: '',
    plant_uid: '',
    status: 'Active',
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const op = Promise.all([
      supabase.from('plant_master').select('id,plant_id,description').order('plant_id', { ascending: true }),
      supabase.from('vw_subplant_master').select('*').order('subplant_id', { ascending: true }),
    ])
      .then(([plRes, vwRes]) => {
        if (plRes.error) throw new Error(plRes.error.message);
        if (vwRes.error) throw new Error(vwRes.error.message);
        setPlants(plRes.data || []);
        setRows(vwRes.data || []);
      })
      .finally(() => setLoading(false));

    await toast.promise(op, {
      loading: 'Loading subplants...',
      success: 'Loaded',
      error: (e) => `Load failed: ${e.message}`,
    });
  }

  const resetFormDom = () => {
    if (subplantIdRef.current) subplantIdRef.current.value = '';
    if (subplantNameRef.current) subplantNameRef.current.value = '';
    if (descriptionRef.current) descriptionRef.current.value = '';
    if (plantUidRef.current) plantUidRef.current.value = '';
    if (statusRef.current) statusRef.current.value = 'Active';

    setCurrent({
      id: null,
      subplant_id: '',
      subplant_name: '',
      description: '',
      plant_uid: '',
      status: 'Active',
    });
    setEditingId(null);
    setFormKey((k) => k + 1);
  };

  async function handleSave(e) {
    e?.preventDefault?.();

    const payload = {
      subplant_id: subplantIdRef.current?.value?.trim() || '',
      subplant_name: subplantNameRef.current?.value?.trim() || '',
      description: descriptionRef.current?.value?.trim() || '',
      plant_uid: plantUidRef.current?.value || '',
      status: statusRef.current?.value || 'Active',
    };

    if (!payload.subplant_id || !payload.subplant_name || !payload.plant_uid) {
      toast.error('SubPlant ID, Name & Plant are required');
      return;
    }

    setSaving(true);
    try {
      if (!editingId) {
        // uniqueness UX
        const { data: exists } = await supabase
          .from('subplant_master')
          .select('id')
          .eq('subplant_id', payload.subplant_id)
          .maybeSingle();

        if (exists) {
          throw new Error('SubPlant ID must be unique');
        }

        const { error } = await supabase
          .from('subplant_master')
          .insert([{ id: uuidv4(), ...payload }]);
        if (error) throw error;

        await toast.promise(Promise.resolve(), {
          loading: '',
          success: 'SubPlant added',
          error: '',
        });
      } else {
        const { data: exists } = await supabase
          .from('subplant_master')
          .select('id')
          .eq('subplant_id', payload.subplant_id)
          .neq('id', editingId)
          .maybeSingle();

        if (exists) {
          throw new Error('SubPlant ID must be unique');
        }

        const { error } = await supabase.from('subplant_master').update(payload).eq('id', editingId);
        if (error) throw error;

        await toast.promise(Promise.resolve(), {
          loading: '',
          success: 'SubPlant updated',
          error: '',
        });
      }

      resetFormDom();
      setActiveTab('preview');
      await loadAll(); // 👈 force a fresh fetch from the view after saving
    } catch (err) {
      toast.error(`❌ ${err.message || 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(v) {
    // v comes from the view; map to base table column names for the form
    setCurrent({
      id: v.subplant_uid,
      subplant_id: v.subplant_id || '',
      subplant_name: v.subplant_name || '',
      description: v.subplant_description || '',
      plant_uid: v.plant_uid || '',
      status: v.subplant_status || 'Active',
    });
    setEditingId(v.subplant_uid);

    // push into DOM refs
    if (subplantIdRef.current) subplantIdRef.current.value = v.subplant_id || '';
    if (subplantNameRef.current) subplantNameRef.current.value = v.subplant_name || '';
    if (descriptionRef.current) descriptionRef.current.value = v.subplant_description || '';
    if (plantUidRef.current) plantUidRef.current.value = v.plant_uid || '';
    if (statusRef.current) statusRef.current.value = v.subplant_status || 'Active';

    setActiveTab('manage');
    toast.success(`✏️ Editing SubPlant: ${v.subplant_id}`);
  }

  async function handleDelete(id) {
    if (!id) {
      toast.error('Missing ID for delete');
      return;
    }
    if (!window.confirm('Delete this SubPlant?')) return;

    const op = supabase
      .from('subplant_master')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) throw new Error(error.message);
      });

    await toast.promise(op, { loading: 'Deleting...', success: 'Deleted', error: (e) => e.message });
    await loadAll(); // 👈 ensure fresh data after delete
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const t = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.subplant_name?.toLowerCase().includes(t) ||
        r.subplant_id?.toLowerCase().includes(t) ||
        r.subplant_description?.toLowerCase().includes(t) ||
        r.plant_id?.toLowerCase().includes(t) ||
        r.plant_description?.toLowerCase().includes(t)
    );
  }, [search, rows]);

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 text-blue-700">SubPlant Master</h2>

      <div className="flex gap-3 mb-3">
        <button
          onClick={() => setActiveTab('manage')}
          className={`px-3 py-1 rounded ${activeTab === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          type="button"
        >
          Manage
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1 rounded ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          type="button"
        >
          Preview All
        </button>
      </div>

      {activeTab === 'manage' && (
        <form
          onSubmit={handleSave}
          key={formKey}
          className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          <div>
            <label className="block text-xs font-medium mb-1">SubPlant ID</label>
            <IconInput
              icon={Hash}
              inputRef={subplantIdRef}
              defaultValue={current.subplant_id}
              placeholder="SUBP-001"
              color="text-indigo-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">SubPlant Name</label>
            <IconInput
              icon={ClipboardList}
              inputRef={subplantNameRef}
              defaultValue={current.subplant_name}
              placeholder="Granulation Block"
              color="text-green-600"
              required
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium mb-1">Description</label>
            <IconInput
              icon={ClipboardList}
              inputRef={descriptionRef}
              defaultValue={current.description}
              placeholder="Optional description..."
              color="text-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect icon={Building2} selectRef={plantUidRef} defaultValue={current.plant_uid || ''} leftColor="text-blue-600" required>
              <option value="">Select Plant</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plant_id} - {p.description}
                </option>
              ))}
            </IconSelect>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <IconSelect
              icon={current.status === 'Active' ? CheckCircle2 : XCircle}
              selectRef={statusRef}
              defaultValue={current.status || 'Active'}
              leftColor={current.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}
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
              {editingId ? 'Update SubPlant' : 'Add SubPlant'}
            </button>

            {editingId && (
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm"
                onClick={() => {
                  resetFormDom();
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
                placeholder="Search SubPlant / Plant"
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
                  <th className="border p-2 text-left">SubPlant ID</th>
                  <th className="border p-2 text-left">SubPlant Name</th>
                  <th className="border p-2 text-left">Description</th>
                  <th className="border p-2 text-left">Plant</th>
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="animate-pulse">
                      <td className="border p-2">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                      </td>
                      <td className="border p-2">
                        <div className="h-4 bg-gray-200 rounded w-40" />
                      </td>
                      <td className="border p-2">
                        <div className="h-4 bg-gray-200 rounded w-48" />
                      </td>
                      <td className="border p-2">
                        <div className="h-4 bg-gray-200 rounded w-44" />
                      </td>
                      <td className="border p-2">
                        <div className="h-4 bg-gray-200 rounded w-16" />
                      </td>
                      <td className="border p-2">
                        <div className="h-7 bg-gray-200 rounded w-28" />
                      </td>
                    </tr>
                  ))
                ) : filteredRows.length > 0 ? (
                  filteredRows.map((r) => (
                    <tr key={r.subplant_uid}>
                      <td className="border p-2">{r.subplant_id}</td>
                      <td className="border p-2">{r.subplant_name}</td>
                      <td className="border p-2">{r.subplant_description}</td>
                      <td className="border p-2">
                        {r.plant_id} - {r.plant_description}
                      </td>
                      <td className="border p-2">
                        <Badge status={r.subplant_status} />
                      </td>
                      <td className="border p-2">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleEdit(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300"
                          >
                            <Pencil className="h-3.5 w-3.5 text-yellow-500" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r.subplant_uid)}
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
                      No SubPlants Found
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
};

export default React.memo(SubPlantMaster);
