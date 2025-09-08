// src/components/submodules/Engineering/WorkOrdersManagement.jsx
//
// DigitizerX — Work Orders (schema-aligned to your Postgres DDL)
// - Live list of work orders (Supabase realtime on table `work_order`)
// - New/Edit WO with asset resolution (asset_code -> asset_uid)
// - Department dropdown (via secure RPC) + Assign To dropdown (Engineering users via secure RPC)
// - Optional parts usage & attachments (only if your tables/bucket exist)
// - E-Sign modal to Close WO (records in electronic_signature, sets status='Closed' and closed_at)
// - QR shown for wo_code (same token PMScheduler writes). No 'react-qr-code' import.
// - Prefers view `vw_wo_list` for read; falls back to `work_order` + asset join.
// - FIX: de-duplicate departments/users and use stable, unique keys for options to remove React warnings.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import Button from '../../ui/button';  // Default import
import {
  ClipboardList,
  Plus,
  Save,
  Edit3,
  Search,
  CheckCircle,
  Paperclip,
  Upload,
  Hash,
  User,
} from 'lucide-react';

/* ---------- constants & tiny utils ---------- */
const cls = (...a) => a.filter(Boolean).join(' ');
const STATUS_OPTIONS = ['Open', 'In Progress', 'Closed'];
const TYPE_OPTIONS = ['PM', 'CM', 'Calibration', 'General'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

// simple uniq helpers
const uniqBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = keyFn(item);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

/* ---------- QR helpers (no react-qr-code) ---------- */
const makeQrDataUrl = async (value, size = 128) => {
  try {
    const QR = await import('qrcode');
    return await QR.toDataURL(String(value), { margin: 1, width: size });
  } catch {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
      String(value),
    )}`;
  }
};

/* ---------- E-Sign Modal ---------- */
const ESignModal = ({ open, onClose, recordTable, recordId, action, onSigned }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    try {
      setBusy(true);
      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id;
      const name = user?.user?.email || 'user';
      if (!uid) throw new Error('Not authenticated');

      const payload = {
        record_table: recordTable,
        record_id: recordId,
        action,
        signer_uid: uid,
        signer_name: name,
        reason,
      };
      const hash = btoa(`${recordTable}|${recordId}|${action}|${uid}|${new Date().toISOString()}|${reason}`);

      const { error } = await supabase.from('electronic_signature').insert([{ ...payload, hash }]);
      if (error) throw error;

      onSigned?.();
      onClose?.();
    } catch (e) {
      alert(e.message || 'Sign failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-2">Electronic Signature</h3>
        <p className="text-sm mb-3">
          Action: <span className="font-mono">{action}</span>
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm"
          rows={4}
          placeholder="Reason/justification"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={sign} disabled={busy}>
            <CheckCircle size={16} className="mr-1" />
            Sign
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Main ---------- */
const WorkOrdersManagement = () => {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const [signFor, setSignFor] = useState(null); // wo id or null
  const [qrMap, setQrMap] = useState({}); // id -> dataUrl

  // Departments + Engineering users (via RPCs)
  const [departments, setDepartments] = useState([]); // [{department_uid, department_id, department_name}]
  const [selectedDeptUid, setSelectedDeptUid] = useState('');
  const [users, setUsers] = useState([]); // [{auth_uid, full_name, email, plant_name, subplant_name, department_name}]
  const [userBook, setUserBook] = useState({}); // auth_uid -> label

  // Form aligns to work_order columns
  const [form, setForm] = useState({
    id: null,
    wo_code: '',
    asset_code: '',
    type: 'General',
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Open',
    due_date: '',
    sop_url: '',
    assigned_to_uid: '', // auth.users.id
  });

  // Optional: parts & attachments
  const [partsForm, setPartsForm] = useState({ wo_uid: null, part_code: '', qty: 1, bin_code: '' });
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);

  /* ---------- RPC: Departments ---------- */
  async function loadDepartments() {
    const { data, error } = await supabase.rpc('fn_list_departments');
    if (error) {
      console.error('fn_list_departments', error);
      setDepartments([]);
      setSelectedDeptUid('');
      return;
    }
    // de-duplicate by department_uid and sort
    const uniq = uniqBy(data || [], (d) => d?.department_uid).sort((a, b) =>
      (a?.department_name || '').localeCompare(b?.department_name || ''),
    );
    setDepartments(uniq);
    // pick Engineering if exists; else first; else empty
    const eng = uniq.find((d) => (d?.department_name || '').toLowerCase() === 'engineering');
    setSelectedDeptUid(eng ? eng.department_uid : uniq[0]?.department_uid || '');
  }

  /* ---------- RPC: Users for Department (Engineering) ---------- */
  async function loadUsersForDept(deptUid) {
    if (!deptUid) {
      setUsers([]);
      return;
    }
    const { data, error } = await supabase.rpc('fn_list_engineers_by_dept', {
      p_department_uid: deptUid,
    });
    if (error) {
      console.error('fn_list_engineers_by_dept', error);
      setUsers([]);
      return;
    }
    // de-duplicate by auth_uid just in case the view joins produce dup rows
    const uniq = uniqBy((data || []).filter((u) => u?.auth_uid), (u) => u.auth_uid).sort((a, b) =>
      (a?.full_name || a?.email || '').localeCompare(b?.full_name || b?.email || ''),
    );
    setUsers(uniq);
  }

  // mount
  useEffect(() => {
    loadDepartments();
  }, []);

  // reload users when department changes
  useEffect(() => {
    loadUsersForDept(selectedDeptUid);
  }, [selectedDeptUid]);

  // build human-readable labels for assignees
  useEffect(() => {
    const map = {};
    for (const u of users) {
      const name = u.full_name || u.email || (u.auth_uid ? String(u.auth_uid).slice(0, 8) + '…' : 'User');
      const affix = [u.plant_name, u.subplant_name, u.department_name].filter(Boolean).join(' • ');
      map[u.auth_uid] = affix ? `${name} — ${affix}` : name;
    }
    setUserBook(map);
  }, [users]);

  /* ---------- Fetch list (prefers vw_wo_list) ---------- */
  const fetchAll = async () => {
    let data = null,
      error = null;

    ({ data, error } = await supabase.from('vw_wo_list').select('*').order('created_at', { ascending: false }));

    if (error || !data) {
      ({ data, error } = await supabase
        .from('work_order')
        .select(
          `
          id, wo_code, status, priority, type, title, description, created_at, due_date, sop_url, assigned_to, asset_uid,
          asset:asset(id, asset_code, name)
        `,
        )
        .order('created_at', { ascending: false }));
    }

    if (!error) {
      const norm = (data || []).map((r) => ({
        id: r.id,
        wo_code: r.wo_code,
        status: r.status,
        priority: r.priority,
        type: r.type,
        title: r.title || r.summary || '',
        description: r.description || r.notes || '',
        created_at: r.created_at,
        due_date: r.due_date || null,
        sop_url: r.sop_url || null,
        assigned_to: r.assigned_to || null,
        asset_code: r.asset_code || r.asset?.asset_code || null,
        asset_name: r.asset_name || r.asset?.name || null,
      }));
      setRows(norm);

      // QR
      (async () => {
        const map = {};
        for (const r of norm) {
          const token = r.wo_code || r.id;
          if (token) map[r.id] = await makeQrDataUrl(token, 96);
        }
        setQrMap(map);
      })();
    } else {
      console.warn('WO list read failed:', error?.message);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Realtime refresh for `work_order` table
  useEffect(() => {
    const ch = supabase
      .channel('rt_wo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order' }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  /* ---------- Filtering ---------- */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.wo_code, r.status, r.priority, r.type, r.title, r.description, r.asset_code, r.asset_name]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(s)),
    );
  }, [rows, q]);

  /* ---------- Helpers ---------- */
  const resolveAssetByCode = async (code) => {
    if (!code) return null;
    const { data, error } = await supabase
      .from('asset')
      .select('id,asset_code,plant_uid,name')
      .eq('asset_code', code)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  const autoCode = () => setForm((f) => ({ ...f, wo_code: crypto.randomUUID() }));

  /* ---------- Create/Update WO ---------- */
  const saveWO = async () => {
    try {
      if (!form.wo_code) throw new Error('WO code is required (use Auto Code if needed)');
      if (!form.type) throw new Error('Type is required');
      if (!form.title?.trim()) throw new Error('Title is required');
      if (!STATUS_OPTIONS.includes(form.status))
        throw new Error(`Status must be one of: ${STATUS_OPTIONS.join(', ')}`);
      if (!PRIORITY_OPTIONS.includes(form.priority))
        throw new Error(`Priority must be one of: ${PRIORITY_OPTIONS.join(', ')}`);

      const asset = await resolveAssetByCode(form.asset_code);

      const payload = {
        wo_code: form.wo_code,
        type: form.type,
        priority: form.priority,
        status: form.status,
        asset_uid: asset?.id ?? null,
        title: form.title,
        description: form.description || null,
        sop_url: form.sop_url || null,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to_uid || null, // must be auth.users.id if provided
      };

      if (form.id) {
        const { error } = await supabase.from('work_order').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('work_order').insert([payload]);
        if (error) throw error;
      }

      setEditing(false);
      setForm({
        id: null,
        wo_code: '',
        asset_code: '',
        type: 'General',
        title: '',
        description: '',
        priority: 'Medium',
        status: 'Open',
        due_date: '',
        sop_url: '',
        assigned_to_uid: '',
      });
      setAttachments([]);
      fetchAll();
    } catch (e) {
      alert(e.message);
    }
  };

  /* ---------- Parts usage with decrement (optional) ---------- */
  const addPartUsage = async () => {
    try {
      if (!partsForm.wo_uid) throw new Error('Open a WO first');
      if (!partsForm.part_code) throw new Error('Part code required');

      const wo = await supabase.from('work_order').select('id,asset_uid').eq('id', partsForm.wo_uid).maybeSingle();
      if (wo.error || !wo.data) throw new Error('WO not found');

      const asset = await supabase.from('asset').select('id,plant_uid').eq('id', wo.data.asset_uid).maybeSingle();
      if (asset.error || !asset.data) throw new Error('Asset not found');

      const part = await supabase
        .from('part_master')
        .select('id,part_code,part_name')
        .eq('part_code', partsForm.part_code)
        .maybeSingle();
      if (part.error || !part.data) throw new Error('Part not found');

      let plq = supabase
        .from('part_location')
        .select('id,qty_on_hand')
        .eq('part_uid', part.data.id)
        .eq('plant_uid', asset.data.plant_uid);
      if (partsForm.bin_code) plq = plq.eq('bin_code', partsForm.bin_code);

      const pl = await plq.order('qty_on_hand', { ascending: false }).maybeSingle();
      if (pl.error || !pl.data) throw new Error('No stock at this plant/bin');

      const qty = Number(partsForm.qty || 0);
      if (qty <= 0) throw new Error('Qty must be > 0');
      if (pl.data.qty_on_hand < qty) throw new Error('Insufficient stock');

      const ins1 = await supabase.from('wo_part_usage').insert([{ wo_uid: wo.data.id, part_location_uid: pl.data.id, qty }]);
      if (ins1.error) throw ins1.error;

      const upd = await supabase.rpc('decrement_part_stock', {
        p_part_location_uid: pl.data.id,
        p_qty: qty,
      });
      if (upd.error) throw upd.error;

      alert('Part usage recorded & stock decremented');
      setPartsForm({ wo_uid: partsForm.wo_uid, part_code: '', qty: 1, bin_code: '' });
    } catch (e) {
      alert(e.message);
    }
  };

  /* ---------- Attachments (optional) ---------- */
  const loadAttachments = async (woId) => {
    const { data, error } = await supabase
      .from('wo_doc')
      .select('id,file_path,uploaded_at')
      .eq('wo_uid', woId)
      .order('uploaded_at', { ascending: false });
    if (!error) setAttachments(data || []);
    else setAttachments([]);
  };

  const uploadAttachment = async () => {
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) return;
      if (!form.id) throw new Error('Save the WO first');

      const path = `wo_${form.id}/${Date.now()}_${file.name}`;
      const up = await supabase.storage.from('wo-files').upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      const ins = await supabase.from('wo_doc').insert([{ wo_uid: form.id, file_path: path }]);
      if (ins.error) throw ins.error;

      await loadAttachments(form.id);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      alert(e.message);
    }
  };

  /* ---------- Status transitions with e-sign ---------- */
  const requestClose = (wo) => setSignFor(wo.id);
  const doCloseWo = async () => {
    try {
      if (!signFor) return;
      const { error } = await supabase
        .from('work_order')
        .update({ status: 'Closed', closed_at: new Date().toISOString() })
        .eq('id', signFor);
      if (error) throw error;
      setSignFor(null);
      fetchAll();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList size={18} /> Work Orders
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
            <input
              className="border rounded pl-7 pr-2 py-1 text-sm"
              placeholder="Search by code, title, asset, status…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setForm({
                id: null,
                wo_code: '',
                asset_code: '',
                type: 'General',
                title: '',
                description: '',
                priority: 'Medium',
                status: 'Open',
                due_date: '',
                sop_url: '',
                assigned_to_uid: '',
              });
              setAttachments([]);
              setEditing(true);
            }}
          >
            <Plus size={16} className="mr-1" />
            New WO
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* List */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">List</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">WO Code</th>
                <th className="p-2 text-left">Title / Asset</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Priority</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Assignee</th>
                <th className="p-2 text-left">QR</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{r.wo_code}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.title || '—'}</div>
                    <div className="text-xs text-gray-600">
                      {r.asset_code ? `${r.asset_code} — ${r.asset_name || ''}` : '—'}
                    </div>
                  </td>
                  <td className="p-2">{r.type || '—'}</td>
                  <td className="p-2">{r.priority || 'Medium'}</td>
                  <td className="p-2">
                    <span
                      className={cls(
                        'px-2 py-0.5 text-xs rounded',
                        r.status === 'Closed'
                          ? 'bg-green-100 text-green-800'
                          : r.status === 'Open'
                          ? 'bg-blue-100 text-blue-800'
                          : r.status === 'In Progress'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-800',
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{r.assigned_to ? userBook[r.assigned_to] || r.assigned_to : '—'}</td>
                  <td className="p-2">
                    {r.wo_code ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={qrMap[r.id]}
                          alt="QR"
                          style={{ width: 38, height: 38 }}
                          onError={(e) => {
                            e.currentTarget.src = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(
                              r.wo_code,
                            )}`;
                          }}
                        />
                        <span className="text-[10px] font-mono">{String(r.wo_code).slice(0, 8)}…</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: r.id,
                          wo_code: r.wo_code || '',
                          asset_code: r.asset_code || '',
                          type: r.type || 'General',
                          title: r.title || '',
                          description: r.description || '',
                          priority: r.priority || 'Medium',
                          status: STATUS_OPTIONS.includes(r.status) ? r.status : 'Open',
                          due_date: r.due_date || '',
                          sop_url: r.sop_url || '',
                          assigned_to_uid: r.assigned_to || '',
                        });
                        setEditing(true);
                        loadAttachments(r.id);
                      }}
                    >
                      <Edit3 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={r.status === 'Closed'}
                      title="Close with e-sign"
                      onClick={() => setSignFor(r.id)}
                    >
                      <CheckCircle size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="p-2 text-gray-500" colSpan={8}>
                    No work orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right panel: edit + parts + attachments */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Detail</div>
          {!editing ? (
            <div className="p-3 text-sm text-gray-600">Select a WO or click "New WO".</div>
          ) : (
            <div className="p-3 space-y-4">
              {/* Edit form */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <input
                    className="border p-2 rounded w-full"
                    placeholder="WO Code (required)"
                    value={form.wo_code}
                    onChange={(e) => setForm({ ...form, wo_code: e.target.value })}
                  />
                  <Button type="button" variant="outline" onClick={autoCode} title="Generate UUID">
                    <Hash size={16} />
                  </Button>
                </div>
                <input
                  className="border p-2 rounded"
                  placeholder="Asset Code (e.g., AHU-01) — resolves to asset"
                  value={form.asset_code}
                  onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
                />
                <select className="border p-2 rounded" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select
                  className="border p-2 rounded"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select className="border p-2 rounded" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  className="border p-2 rounded"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
                <input
                  className="border p-2 rounded col-span-2"
                  placeholder="Title (human-readable summary)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <textarea
                  className="border p-2 rounded col-span-2"
                  rows={3}
                  placeholder="Description (steps, symptoms, notes)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <input
                  className="border p-2 rounded"
                  placeholder="SOP URL (optional)"
                  value={form.sop_url}
                  onChange={(e) => setForm({ ...form, sop_url: e.target.value })}
                />

                {/* Department + Assign To */}
                <div className="grid grid-cols-2 gap-3 col-span-2">
                  <div>
                    <label className="text-sm mb-1 block">Department</label>
                    <select
                      className="border p-2 rounded w-full"
                      value={selectedDeptUid}
                      onChange={(e) => setSelectedDeptUid(e.target.value)}
                    >
                      <option value="">Select Department</option>
                      {departments.map((d, i) => (
                        // key includes index to guarantee uniqueness even if the API returns dup uids
                        <option key={`${d.department_uid || 'dept'}-${i}`} value={d.department_uid}>
                          {d.department_name} {d.department_id ? `(${d.department_id})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm mb-1 flex items-center gap-1">
                      <User size={14} /> Assign To
                    </label>
                    <select
                      className="border p-2 rounded w-full"
                      value={form.assigned_to_uid}
                      onChange={(e) => setForm({ ...form, assigned_to_uid: e.target.value })}
                    >
                      <option value="">— Select Engineering user —</option>
                      {users.map((u, i) => (
                        // key also includes index to avoid duplicate-key warnings
                        <option key={`${u.auth_uid || 'auth'}-${i}`} value={u.auth_uid}>
                          {userBook[u.auth_uid] || u.full_name || u.email || u.auth_uid}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-gray-500 mt-1">
                      Saves the selected user’s <code>auth_uid</code> into <code>work_order.assigned_to</code>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      id: null,
                      wo_code: '',
                      asset_code: '',
                      type: 'General',
                      title: '',
                      description: '',
                      priority: 'Medium',
                      status: 'Open',
                      due_date: '',
                      sop_url: '',
                      assigned_to_uid: '',
                    });
                    setAttachments([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveWO}>
                  <Save size={16} className="mr-1" />
                  Save
                </Button>
              </div>

              {/* Parts usage (optional; requires part_* tables & RPC) */}
              {form.id && (
                <div className="border rounded p-3">
                  <div className="font-semibold mb-2">Parts Usage</div>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      className="border p-2 rounded col-span-2"
                      placeholder="Part Code"
                      value={partsForm.part_code}
                      onChange={(e) => setPartsForm({ ...partsForm, wo_uid: form.id, part_code: e.target.value })}
                    />
                    <input
                      className="border p-2 rounded"
                      placeholder="Bin (optional)"
                      value={partsForm.bin_code}
                      onChange={(e) => setPartsForm({ ...partsForm, bin_code: e.target.value })}
                    />
                    <input
                      className="border p-2 rounded"
                      type="number"
                      min={1}
                      value={partsForm.qty}
                      onChange={(e) => setPartsForm({ ...partsForm, qty: e.target.value })}
                    />
                  </div>
                  <div className="mt-2">
                    <Button onClick={addPartUsage}>
                      <Save size={16} className="mr-1" />
                      Add Usage & Decrement
                    </Button>
                  </div>
                </div>
              )}

              {/* Attachments (optional; requires storage bucket 'wo-files' & table 'wo_doc') */}
              {form.id && (
                <div className="border rounded p-3">
                  <div className="font-semibold mb-2 flex items-center gap-2">
                    <Paperclip size={16} /> Attachments
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input ref={fileRef} type="file" />
                    <Button onClick={uploadAttachment} disabled={!fileRef.current?.files?.length}>
                      <Upload size={16} className="mr-1" />
                      Upload
                    </Button>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">
                    Files go to Storage bucket <code>wo-files</code> and are logged in <code>wo_doc</code>.
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Path</th>
                        <th className="p-2 text-left">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachments.map((a) => (
                        <tr key={a.id} className="border-t">
                          <td className="p-2 font-mono text-xs">{a.file_path}</td>
                          <td className="p-2">{new Date(a.uploaded_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {!attachments.length && (
                        <tr>
                          <td className="p-2 text-gray-500" colSpan={2}>
                            No attachments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ESignModal
        open={!!signFor}
        onClose={() => setSignFor(null)}
        recordTable="work_order"
        recordId={signFor || ''}
        action="Close WO"
        onSigned={doCloseWo}
      />
    </div>
  );
};

export default WorkOrdersManagement;
