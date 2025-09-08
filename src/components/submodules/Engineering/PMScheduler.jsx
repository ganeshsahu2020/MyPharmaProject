// PMScheduler.jsx — DigitizerX
// - Centered, non-overlapping tables (table-fixed + colgroup + truncate)
// - Asset dropdown in New Assignment
// - Work Order: user must set a token before Save/Submit
//   • type any code -> UUIDv5(token) stored in work_order_uid
//   • click Auto -> UUIDv4 stored in work_order_uid
// - Human-readable WO placeholder + summary text
// - Actions visible; Edit icon shown
// - Print Label: QR encodes FULL PM payload; window never blank; logo shown

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import Button from '../../ui/button';  // Default import
import {
  Plus,
  Save,
  Edit3,
  CalendarDays,
  Search,
  Upload,
  FileDown,
  Printer,
  Download,
  Filter,
  Edit,
} from 'lucide-react';
import logo from '../../../assets/logo.png';

/* ---------- utils ---------- */
const downloadText = (filename, text, mime = 'text/csv') => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
const csvLine = (arr) =>
  arr
    .map((v) => String(v ?? '').replace(/"/g, '""'))
    .map((v) => (/[,\"\n]/.test(v) ? `"${v}"` : v))
    .join(',');
const downloadPMAssignTemplate = () => {
  const headers = ['asset_code', 'template_name', 'frequency_code', 'next_due_date', 'notes'];
  const sample = ['AHU-01', 'HVAC Filter Change', '6M', '2025-09-01', 'EU Annex 1 risk-based'];
  const csv = [csvLine(headers), csvLine(sample)].join('\n');
  downloadText('pm_assignments_template.csv', csv);
};
const badge = (s) => {
  const base = 'inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium';
  if (s === 'Verified') {
    return `${base} bg-emerald-100 text-emerald-700`;
  }
  if (s === 'Done') {
    return `${base} bg-green-100 text-green-700`;
  }
  if (s === 'Issued') {
    return `${base} bg-amber-100 text-amber-700`;
  }
  if (s === 'Planned') {
    return `${base} bg-blue-100 text-blue-700`;
  }
  if (s === 'Canceled') {
    return `${base} bg-gray-200 text-gray-700`;
  }
  return `${base} bg-slate-100 text-slate-700`;
};
const fmtDate = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const shortId = (u) => (u ? String(u).slice(0, 8) + '…' : '-');

/* ---------- UUID helpers (deterministic v5 for typed WO codes) ---------- */
// RFC4122 DNS namespace (stable constant)
const NS_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const enc = new TextEncoder();
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const parseUUID = (u) => {
  const s = u.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
const unparseUUID = (b) => {
  const s = hex(b);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
const isUUID = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
const uuidFromText = async (text) => {
  if (!text) {
    return null;
  }
  if (isUUID(text)) {
    return text.toLowerCase();
  }
  const ns = parseUUID(NS_DNS);
  const name = enc.encode(String(text));
  const buf = new Uint8Array(ns.length + name.length);
  buf.set(ns, 0);
  buf.set(name, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
  const out = hash.slice(0, 16);
  out[6] = (out[6] & 0x0f) | 0x50; // version 5
  out[8] = (out[8] & 0x3f) | 0x80; // RFC4122 variant
  return unparseUUID(out);
};

/* ---------- Human-readable Work Order number (display only) ---------- */
const hrWO = (u) => {
  if (!u || !isUUID(u)) {
    return '-';
  }
  const n = parseInt(String(u).replace(/-/g, '').slice(0, 8), 16);
  return 'WO-' + n.toString(36).toUpperCase().padStart(5, '0');
};

/* ---------- component ---------- */
const PMScheduler = () => {
  /* data state */
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assets, setAssets] = useState([]);
  const [activity, setActivity] = useState([]);

  /* ui state */
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set(['Planned', 'Issued', 'Done', 'Verified', 'Canceled']));
  const [groupByAsset, setGroupByAsset] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingA, setEditingA] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [busy, setBusy] = useState({});
  const fileRef = useRef(null);

  /* forms */
  const [form, setForm] = useState({
    id: null,
    name: '',
    description: '',
    method: '',
    frequency_code: '6M',
    risk_level: 'Medium',
    doc_url: '',
    active: true,
  });
  const [aForm, setAForm] = useState({
    id: null,
    asset_code: '',
    template_uid: '',
    next_due_date: '',
    notes: '',
    plant_code: '',
  });

  /* date range: last 90d..today */
  const today = fmtDate(new Date());
  const [startDate, setStartDate] = useState(fmtDate(addDays(new Date(), -90)));
  const [endDate, setEndDate] = useState(today);

  /* user + names */
  const [user, setUser] = useState(null);
  const [userBook, setUserBook] = useState({}); // auth_uid -> display name
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });
  }, []);
  const nameFor = (uid) => {
    if (!uid) {
      return '-';
    }
    return userBook[uid] || shortId(uid);
  };

  /* work-order UI cache (per-row input) */
  const [woInput, setWoInput] = useState({}); // occurrence_uid -> typed code

  /* fetches */
  const fetchStatic = async () => {
    const t = await supabase.from('pm_template').select('*').order('name');
    if (!t.error) {
      setTemplates(t.data || []);
    }
    const a = await supabase.from('asset').select('asset_code,name').order('asset_code');
    if (!a.error) {
      setAssets(a.data || []);
    }
    const asg = await supabase.from('vw_pm_due_next').select('*').order('next_due_date');
    if (!asg.error) {
      setAssignments(asg.data || []);
    }
    const um = await supabase.from('user_management').select('auth_uid,first_name,last_name,email');
    if (!um.error) {
      const m = {};
      for (const r of um.data || []) {
        const d =
          [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
          r.email ||
          shortId(r.auth_uid);
        if (r.auth_uid) {
          m[r.auth_uid] = d;
        }
      }
      setUserBook(m);
    }
  };
  const fetchActivity = async () => {
    const q = await supabase
      .from('vw_pm_activity')
      .select('*')
      .gte('scheduled_for', startDate)
      .lte('scheduled_for', endDate)
      .order('scheduled_for', { ascending: false });
    if (!q.error) {
      setActivity(q.data || []);
    } else {
      setActivity([]);
    }
  };
  useEffect(() => {
    fetchStatic();
  }, []);
  useEffect(() => {
    fetchActivity();
  }, [startDate, endDate]);

  /* filters & grouping */
  const filteredAssigns = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      return assignments;
    }
    return assignments.filter((r) =>
      [r.asset_code, r.asset_name, r.template_name]
        .some((x) => String(x || '').toLowerCase().includes(s)),
    );
  }, [assignments, q]);
  const filteredActivity = useMemo(() => {
    return activity.filter((r) => statusFilter.has(r.status));
  }, [activity, statusFilter]);
  const groupedActivity = useMemo(() => {
    if (!groupByAsset) {
      return [];
    }
    const map = new Map();
    for (const r of filteredActivity) {
      const k = `${r.asset_code} — ${r.asset_name}`;
      if (!map.has(k)) {
        map.set(k, []);
      }
      map.get(k).push(r);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
  }, [filteredActivity, groupByAsset]);
  const toggleStatus = (k) => {
    const next = new Set(statusFilter);
    if (next.has(k)) {
      next.delete(k);
    } else {
      next.add(k);
    }
    setStatusFilter(next);
  };
  const setPreset = (preset) => {
    const now = new Date();
    if (preset === '30d') {
      setStartDate(fmtDate(addDays(now, -30)));
      setEndDate(fmtDate(now));
    }
    if (preset === '90d') {
      setStartDate(fmtDate(addDays(now, -90)));
      setEndDate(fmtDate(now));
    }
    if (preset === 'year') {
      const y = new Date(now.getFullYear(), 0, 1);
      setStartDate(fmtDate(y));
      setEndDate(fmtDate(now));
    }
    if (preset === 'all') {
      setStartDate('1900-01-01');
      setEndDate('2999-12-31');
    }
  };

  /* template save */
  const saveTemplate = async () => {
    if (!form.name.trim()) {
      alert('Name required');
      return;
    }
    if (form.id) {
      const { error } = await supabase
        .from('pm_template')
        .update({
          name: form.name,
          description: form.description,
          method: form.method,
          frequency_code: form.frequency_code,
          risk_level: form.risk_level,
          doc_url: form.doc_url,
          active: !!form.active,
        })
        .eq('id', form.id);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('pm_template').insert([
        {
          name: form.name,
          description: form.description,
          method: form.method,
          frequency_code: form.frequency_code,
          risk_level: form.risk_level,
          doc_url: form.doc_url,
          active: !!form.active,
        },
      ]);
      if (error) {
        alert(error.message);
        return;
      }
    }
    setEditing(false);
    setForm({
      id: null,
      name: '',
      description: '',
      method: '',
      frequency_code: '6M',
      risk_level: 'Medium',
      doc_url: '',
      active: true,
    });
    fetchStatic();
  };

  /* assignment save */
  const saveAssignment = async () => {
    try {
      if (!aForm.asset_code) {
        throw new Error('Select an asset');
      }
      if (!aForm.template_uid) {
        throw new Error('Select a template');
      }
      if (!aForm.next_due_date) {
        throw new Error('Pick next due date');
      }
      const a = await supabase
        .from('asset')
        .select('id,plant_uid')
        .eq('asset_code', aForm.asset_code)
        .maybeSingle();
      if (a.error) {
        throw a.error;
      }
      if (!a.data) {
        throw new Error('Asset not found');
      }
      const payload = {
        asset_uid: a.data.id,
        template_uid: aForm.template_uid,
        next_due_date: aForm.next_due_date,
        notes: aForm.notes || '',
        plant_uid: a.data.plant_uid,
        active: true,
      };
      if (aForm.id) {
        const u = await supabase.from('pm_assignment').update(payload).eq('id', aForm.id);
        if (u.error) {
          throw u.error;
        }
      } else {
        const i = await supabase.from('pm_assignment').insert([payload]);
        if (i.error) {
          throw i.error;
        }
      }
      setEditingA(false);
      setAForm({
        id: null,
        asset_code: '',
        template_uid: '',
        next_due_date: '',
        notes: '',
        plant_code: '',
      });
      fetchStatic();
      fetchActivity();
    } catch (e) {
      alert(e.message);
    }
  };

  /* CSV import (unchanged) */
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) {
      return [];
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] ? cols[i].trim() : '';
      });
      return obj;
    });
  };
  const importAssignments = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const rows = parseCSV(text);
    const conf = [];
    for (const r of rows) {
      try {
        const a = await supabase
          .from('asset')
          .select('id,plant_uid')
          .eq('asset_code', r.asset_code)
          .maybeSingle();
        if (a.error) {
          throw a.error;
        }
        if (!a.data) {
          conf.push({ type: 'asset_missing', asset_code: r.asset_code, template_name: r.template_name });
          continue;
        }
        let template_uid = null;
        if (r.template_name) {
          const t = await supabase.from('pm_template').select('id').eq('name', r.template_name).maybeSingle();
          if (t.data?.id) {
            template_uid = t.data.id;
          } else {
            const ins = await supabase
              .from('pm_template')
              .insert([
                {
                  name: r.template_name,
                  frequency_code: r.frequency_code || '6M',
                  risk_level: 'Medium',
                  active: true,
                },
              ])
              .select('id')
              .single();
            if (ins.error) {
              throw ins.error;
            }
            template_uid = ins.data.id;
          }
        }
        if (!template_uid) {
          conf.push({ type: 'template_missing', asset_code: r.asset_code, template_name: r.template_name });
          continue;
        }
        const payload = {
          asset_uid: a.data.id,
          template_uid,
          next_due_date: r.next_due_date || null,
          notes: r.notes || '',
          plant_uid: a.data.plant_uid,
          active: true,
        };
        const exist = await supabase
          .from('pm_assignment')
          .select('id')
          .eq('asset_uid', payload.asset_uid)
          .eq('template_uid', payload.template_uid)
          .maybeSingle();
        if (exist.data?.id) {
          const u = await supabase.from('pm_assignment').update(payload).eq('id', exist.data.id);
          if (u.error) {
            throw u.error;
          }
        } else {
          const i = await supabase.from('pm_assignment').insert([payload]);
          if (i.error) {
            throw i.error;
          }
        }
      } catch (err) {
        conf.push({ type: 'error', asset_code: r.asset_code, template_name: r.template_name, error: err.message });
      }
    }
    setConflicts(conf);
    if (conf.length) {
      alert(`Imported with ${conf.length} issues. Use "Export Conflicts".`);
    }
    if (fileRef.current) {
      fileRef.current.value = '';
    }
    fetchStatic();
    fetchActivity();
  };
  const exportConflictsCSV = () => {
    if (!conflicts.length) {
      alert('No conflicts');
      return;
    }
    const headers = Object.keys(conflicts[0]);
    const lines = [headers.join(',')].concat(
      conflicts.map((r) => headers.map((h) => String(r[h] ?? '').replace(/,/g, ';')).join(',')),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pm_assignments_conflicts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const printConflicts = () => {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      return;
    }
    const now = new Date().toLocaleString();
    const rows = conflicts
      .map(
        (c) =>
          `      <tr><td>${c.type || ''}</td><td>${c.asset_code || ''}</td><td>${c.template_name || ''}</td><td>${(c.error || '').replace(/</g, '&lt;')}</td></tr>
    `,
      )
      .join('');
    win.document.write(`      <html><head><title>PM Assignment Conflicts</title>
      <style>body{font-family:Arial;padding:16px} th,td{border:1px solid #ccc;padding:6px} table{width:100%;border-collapse:collapse} th{background:#f4f4f4}</style>
      </head><body>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><img src="${logo}" style="height:40px"/><div><b>DigitizerX – PM Assignment Conflicts</b><div style="font-size:12px;color:#555">Generated ${now}</div></div></div>
      <table><thead><tr><th>Type</th><th>Asset Code</th><th>Template</th><th>Error</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No conflicts</td></tr>'}</tbody></table>
      <script>window.onload=()=>window.print();</script>
      </body></html>
    `);
    win.document.close();
  };

  /* ---------- Work Order helpers ---------- */
  const setWorkOrder = async (r, mode) => {
    try {
      setBusy((b) => ({ ...b, [r.occurrence_uid]: true }));
      let token = null;
      if (mode === 'auto') {
        token = crypto.randomUUID();
      } else {
        const raw = (woInput[r.occurrence_uid] || '').trim();
        if (!raw) {
          alert('Enter WO code or use Auto');
          return;
        }
        token = await uuidFromText(raw);
      }
      const up = await supabase.from('pm_occurrence').update({ work_order_uid: token }).eq('id', r.occurrence_uid);
      if (up.error) {
        throw up.error;
      }
      await fetchActivity();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, [r.occurrence_uid]: false }));
    }
  };

  /* ---------- actions (RPC first, fallback) ---------- */
  const markDone = async (occ) => {
    if (!occ.work_order_uid) {
      alert('Set Work Order first');
      return;
    }
    try {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: true }));
      let res = await supabase.rpc('pm_mark_done', { p_occurrence_id: occ.occurrence_uid });
      if (res.error) {
        const me = await supabase.auth.getUser();
        const uid = me?.data?.user?.id;
        if (!uid) {
          throw res.error;
        }
        const up = await supabase
          .from('pm_occurrence')
          .update({
            status: 'Done',
            done_by_uid: uid,
            done_at: new Date().toISOString(),
          })
          .eq('id', occ.occurrence_uid);
        if (up.error) {
          throw res.error;
        }
      }
      await fetchActivity();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: false }));
    }
  };
  const verifyDone = async (occ) => {
    if (!occ.work_order_uid) {
      alert('Set Work Order first');
      return;
    }
    try {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: true }));
      let res = await supabase.rpc('pm_verify_done', { p_occurrence_id: occ.occurrence_uid });
      if (res.error) {
        const me = await supabase.auth.getUser();
        const uid = me?.data?.user?.id;
        if (!uid) {
          throw res.error;
        }
        const up = await supabase
          .from('pm_occurrence')
          .update({
            status: 'Verified',
            verified_by_uid: uid,
            verified_at: new Date().toISOString(),
          })
          .eq('id', occ.occurrence_uid)
          .in('status', ['Done', 'Verified']);
        if (up.error) {
          throw res.error;
        }
      }
      await fetchActivity();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: false }));
    }
  };
  const adminEdit = async (occ, updates) => {
    try {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: true }));
      let res = await supabase.rpc('pm_admin_upsert_occurrence', {
        p_occurrence_id: occ.occurrence_uid,
        p_scheduled_for: updates.scheduled_for || null,
        p_status: updates.status || null,
        p_work_order_uid: updates.work_order_uid || null,
      });
      if (res.error) {
        const up = await supabase
          .from('pm_occurrence')
          .update({
            scheduled_for: updates.scheduled_for ?? occ.scheduled_for,
            status: updates.status ?? occ.status,
            work_order_uid: updates.work_order_uid ?? occ.work_order_uid,
          })
          .eq('id', occ.occurrence_uid);
        if (up.error) {
          throw res.error;
        }
      }
      await fetchActivity();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, [occ.occurrence_uid]: false }));
    }
  };

  /* label print: QR encodes FULL PM payload (failsafe writes to the window even on error) */
  /* label print: inline print preview (hidden iframe, no new tab) */
  const printLabel = async (occ) => {
    try {
      // fetch label data (extended view first, fallback view second)
      let sel = await supabase
        .from('vw_pm_label_ext')
        .select('*')
        .eq('occurrence_uid', occ.occurrence_uid)
        .maybeSingle();
      let data = sel.data;
      if (sel.error || !data) {
        const alt = await supabase
          .from('vw_pm_label')
          .select('*')
          .eq('occurrence_uid', occ.occurrence_uid)
          .maybeSingle();
        if (alt.error || !alt.data) {
          throw new Error(sel.error?.message || alt.error?.message || 'Label data not found');
        }
        data = alt.data;
      }
      const payload = {
        wo: data.work_order_uid || occ.work_order_uid,
        asset: { code: data.asset_code || occ.asset_code, name: data.asset_name || occ.asset_name },
        template: data.template_name || occ.template_name,
        freq: data.frequency_code || null,
        scheduled: data.scheduled_for || occ.scheduled_for || null,
        status: data.status || occ.status || null,
        done_by: data.done_by_name || null,
        done_at: data.done_at || null,
        verified_by: data.verified_by_name || null,
        verified_at: data.verified_at || null,
        sop: data.doc_url || null,
      };
      if (!payload.wo) {
        throw new Error('Work Order token missing');
      }
      // QR as DataURL (local lib first, public fallback)
      let qrDataUrl = null;
      try {
        const QR = await import('qrcode');
        qrDataUrl = await QR.toDataURL(JSON.stringify(payload), { margin: 1, width: 180 });
      } catch (_) {
        qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
          JSON.stringify(payload),
        )}`;
      }
      const now = new Date().toLocaleString();
      const hr = (() => {
        const n = parseInt(String(payload.wo).replace(/-/g, '').slice(0, 8), 16);
        return 'WO-' + n.toString(36).toUpperCase().padStart(5, '0');
      })();
      const html = `      <html><head><title>PM Label</title>
      <style>
        @page{margin:12mm}
        body{font-family:Inter,Arial,sans-serif;padding:16px;}
        .card{width:430px;border:1px solid #ddd;border-radius:12px;padding:12px;margin:0 auto;}
        .head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .title{font-weight:700}
        .row{display:flex;justify-content:space-between;font-size:12px;margin:2px 0}
        .k{color:#555}
        @media print{body{padding:0}.card{box-shadow:none;border-color:#999}}
      </style></head><body>
        <div class="card">
          <div class="head"><img src="${logo}" style="height:28px"/>
            <div><div class="title">${payload.asset.name || ''}</div><div class="k">ID: ${payload.asset.code || ''}</div></div>
          </div>
          <div class="row"><div class="k">Template</div><div>${payload.template || ''}</div></div>
          ${payload.freq ? `<div class="row"><div class="k">Freq</div><div>${payload.freq}</div></div>` : ''}
          ${payload.sop ? `<div class="row"><div class="k">SOP</div><div>${payload.sop}</div></div>` : ''}
          <div class="row"><div class="k">Scheduled</div><div>${payload.scheduled || ''}</div></div>
          <div class="row"><div class="k">Status</div><div>${payload.status || ''}</div></div>
          <div class="row"><div class="k">Work Order</div><div>${hr} <span style="color:#888">(${payload.wo})</span></div></div>
          ${payload.done_by ? `<div class="row"><div class="k">Done By</div><div>${payload.done_by}${
            payload.done_at ? ' @ ' + new Date(payload.done_at).toLocaleString() : ''
          }</div></div>` : ''}
          ${payload.verified_by ? `<div class="row"><div class="k">Verified By</div><div>${payload.verified_by}${
            payload.verified_at ? ' @ ' + new Date(payload.verified_at).toLocaleString() : ''
          }</div></div>` : ''}
          <div style="display:flex;gap:16px;align-items:center;margin-top:8px">
            <img src="${qrDataUrl}" alt="QR"/>
            <div style="font-size:12px;word-break:break-all">QR encodes full PM payload</div>
          </div>
          <div class="row" style="margin-top:6px"><div class="k">Printed</div><div>${now}</div></div>
        </div>
        <script>window.onload=()=>setTimeout(()=>window.print(),100);</script>
      </body></html>`;
      // hidden iframe → print dialog (no popup/new tab)
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      doc.open();
      doc.write(html);
      doc.close();
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } finally {
          setTimeout(() => document.body.removeChild(frame), 1200);
        }
      };
    } catch (err) {
      console.error('Label error:', err);
      alert('Label generation failed: ' + (err?.message || String(err)));
    }
  };

  /* Admin edit modal */
  const [editRow, setEditRow] = useState(null);
  const [editData, setEditData] = useState({ scheduled_for: '', status: '', work_order_uid: '' });
  const openEdit = (r) => {
    setEditRow(r);
    setEditData({
      scheduled_for: r.scheduled_for || '',
      status: r.status || '',
      work_order_uid: r.work_order_uid || '',
    });
  };
  const saveEdit = async () => {
    await adminEdit(editRow, editData);
    setEditRow(null);
  };

  /* ---------- render ---------- */
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <CalendarDays size={18} /> PM Scheduler
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
            <input
              className="border rounded pl-7 pr-2 py-1 text-sm"
              placeholder="Search assets/templates"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <Upload size={16} /> Import Assignments CSV
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importAssignments} />
          </label>
          <Button variant="outline" onClick={downloadPMAssignTemplate}>
            <Download size={16} className="mr-1" />
            Assignments CSV
          </Button>
          <Button onClick={exportConflictsCSV} variant="outline">
            <FileDown size={16} className="mr-1" />
            Export Conflicts
          </Button>
          <Button onClick={printConflicts} variant="outline">
            <Printer size={16} className="mr-1" />
            Print
          </Button>
          <Button onClick={() => setEditingA(true)}>
            <Plus size={16} className="mr-1" />
            New Assignment
          </Button>
          <Button onClick={() => setEditing(true)} variant="outline">
            <Plus size={16} className="mr-1" />
            New Template
          </Button>
        </div>
      </div>

      {/* Assignments + Templates (table-fixed to avoid overlap) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Due / Upcoming</div>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-2/5" />
              <col className="w-2/5" />
              <col className="w-1/5" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-center">Asset</th>
                <th className="p-2 text-center">Template</th>
                <th className="p-2 text-center">Next Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssigns.map((r) => (
                <tr key={r.assignment_uid} className="border-t align-middle">
                  <td className="p-2 text-center truncate">
                    {r.asset_code} — {r.asset_name}
                  </td>
                  <td className="p-2 text-center truncate">{r.template_name}</td>
                  <td className="p-2 text-center">{r.next_due_date}</td>
                </tr>
              ))}
              {!filteredAssigns.length && (
                <tr>
                  <td className="p-2 text-gray-500 text-center" colSpan={3}>
                    No assignments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Templates</div>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-2/5" />
              <col className="w-1/5" />
              <col className="w-1/5" />
              <col className="w-1/5" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-center">Name</th>
                <th className="p-2 text-center">Freq</th>
                <th className="p-2 text-center">Risk</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t align-middle">
                  <td className="p-2 text-center truncate">{t.name}</td>
                  <td className="p-2 text-center">{t.frequency_code}</td>
                  <td className="p-2 text-center">{t.risk_level}</td>
                  <td className="p-2 text-center">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setForm(t);
                        setEditing(true);
                      }}
                      title="Edit Template"
                    >
                      <Edit3 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
              {!templates.length && (
                <tr>
                  <td className="p-2 text-gray-500 text-center" colSpan={4}>
                    No templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PM Activity */}
      <div className="mt-4 border rounded">
        <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
          <div className="font-semibold flex items-center gap-2">
            <Filter size={16} /> PM Activity
          </div>
          <div className="flex items-center gap-3 text-sm">
            {['Planned', 'Issued', 'Done', 'Verified', 'Canceled'].map((s) => (
              <label key={s} className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
                <span className={badge(s)}>{s}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span>to</span>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button variant="outline" onClick={() => setPreset('30d')}>
              Last 30d
            </Button>
            <Button variant="outline" onClick={() => setPreset('90d')}>
              Last 90d
            </Button>
            <Button variant="outline" onClick={() => setPreset('year')}>
              This year
            </Button>
            <Button variant="outline" onClick={() => setPreset('all')}>
              All
            </Button>
            <label className="inline-flex items-center gap-2 ml-2">
              <input
                type="checkbox"
                checked={groupByAsset}
                onChange={(e) => setGroupByAsset(e.target.checked)}
              />
              <span>Group by Asset</span>
            </label>
          </div>
        </div>

        {/* Grouped view (CENTERED) */}
        {groupByAsset ? (
          <div className="divide-y">
            {groupedActivity.map((g) => (
              <div key={g.key} className="p-3">
                <div className="font-medium mb-2">{g.key}</div>
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[24%]" />
                    <col className="w-[10%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-center">Date</th>
                      <th className="p-2 text-center">Template</th>
                      <th className="p-2 text-center">Status</th>
                      <th className="p-2 text-center">Work Order</th>
                      <th className="p-2 text-center">Done By</th>
                      <th className="p-2 text-center">Verified By</th>
                      <th className="p-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.occurrence_uid} className="border-t align-middle">
                        <td className="p-2 text-center">{r.scheduled_for}</td>
                        <td className="p-2 text-center truncate">{r.template_name}</td>
                        <td className="p-2 text-center">
                          <span className={badge(r.status)}>{r.status}</span>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <input
                              className="border rounded px-2 py-1 w-28 text-center placeholder:text-center"
                              placeholder={r.work_order_uid ? hrWO(r.work_order_uid) : 'WO code'}
                              value={woInput[r.occurrence_uid] ?? ''}
                              onChange={(e) =>
                                setWoInput((m) => ({ ...m, [r.occurrence_uid]: e.target.value }))
                              }
                            />
                            <Button size="sm" variant="outline" onClick={() => setWorkOrder(r, 'typed')}>
                              Set
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setWorkOrder(r, 'auto')}>
                              Auto
                            </Button>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {r.work_order_uid
                              ? `${shortId(r.work_order_uid)} • ${hrWO(r.work_order_uid)}`
                              : '-'}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          {nameFor(r.done_by_uid)}
                          {r.done_at ? (
                            <div className="text-[11px] text-gray-500">
                              {new Date(r.done_at).toLocaleString()}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">
                          {nameFor(r.verified_by_uid)}
                          {r.verified_at ? (
                            <div className="text-[11px] text-gray-500">
                              {new Date(r.verified_at).toLocaleString()}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {!r.done_by_uid && r.status !== 'Canceled' && (
                              <Button
                                size="sm"
                                disabled={!!busy[r.occurrence_uid] || !r.work_order_uid}
                                onClick={() => markDone(r)}
                              >
                                {busy[r.occurrence_uid] ? '...' : 'Save'}
                              </Button>
                            )}
                            {r.status === 'Done' && !r.verified_by_uid && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!!busy[r.occurrence_uid] || !r.work_order_uid}
                                onClick={() => verifyDone(r)}
                              >
                                {busy[r.occurrence_uid] ? '...' : 'Submit'}
                              </Button>
                            )}
                            {r.status === 'Verified' && (
                              <Button size="sm" variant="outline" onClick={() => printLabel(r)}>
                                Print Label
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(r)}
                              title="Admin Edit"
                            >
                              <Edit size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!groupedActivity.length && (
              <div className="p-3 text-sm text-gray-500 text-center">No activity in range.</div>
            )}
          </div>
        ) : (
          /* Flat view (CENTERED) */
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-center">Date</th>
                <th className="p-2 text-center">Asset</th>
                <th className="p-2 text-center">Template</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Work Order</th>
                <th className="p-2 text-center">Done By</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivity.map((r) => (
                <tr key={r.occurrence_uid} className="border-t align-middle">
                  <td className="p-2 text-center">{r.scheduled_for}</td>
                  <td className="p-2 text-center truncate">
                    {r.asset_code} — {r.asset_name}
                  </td>
                  <td className="p-2 text-center truncate">{r.template_name}</td>
                  <td className="p-2 text-center">
                    <span className={badge(r.status)}>{r.status}</span>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        className="border rounded px-2 py-1 w-28 text-center placeholder:text-center"
                        placeholder={r.work_order_uid ? hrWO(r.work_order_uid) : 'WO code'}
                        value={woInput[r.occurrence_uid] ?? ''}
                        onChange={(e) =>
                          setWoInput((m) => ({ ...m, [r.occurrence_uid]: e.target.value }))
                        }
                      />
                      <Button size="sm" variant="outline" onClick={() => setWorkOrder(r, 'typed')}>
                        Set
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setWorkOrder(r, 'auto')}>
                        Auto
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {r.work_order_uid
                        ? `${shortId(r.work_order_uid)} • ${hrWO(r.work_order_uid)}`
                        : '-'}
                    </div>
                  </td>
                  <td className="p-2 text-center">{nameFor(r.done_by_uid)}</td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {!r.done_by_uid && r.status !== 'Canceled' && (
                        <Button
                          size="sm"
                          disabled={!!busy[r.occurrence_uid] || !r.work_order_uid}
                          onClick={() => markDone(r)}
                        >
                          {busy[r.occurrence_uid] ? '...' : 'Save'}
                        </Button>
                      )}
                      {r.status === 'Done' && !r.verified_by_uid && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy[r.occurrence_uid] || !r.work_order_uid}
                          onClick={() => verifyDone(r)}
                        >
                          {busy[r.occurrence_uid] ? '...' : 'Submit'}
                        </Button>
                      )}
                      {r.status === 'Verified' && (
                        <Button size="sm" variant="outline" onClick={() => printLabel(r)}>
                          Print Label
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Admin Edit">
                        <Edit size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredActivity.length && (
                <tr>
                  <td className="p-2 text-gray-500 text-center" colSpan={7}>
                    No activity in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Template modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-40">
          <div className="bg-white rounded-xl p-4 w-full max-w-xl shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{form.id ? 'Edit' : 'New'} PM Template</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border p-2 rounded"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="border p-2 rounded"
                placeholder="Frequency (e.g., 6M)"
                value={form.frequency_code}
                onChange={(e) => setForm({ ...form, frequency_code: e.target.value })}
              />
              <select
                className="border p-2 rounded"
                value={form.risk_level}
                onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
              <input
                className="border p-2 rounded"
                placeholder="SOP/Doc URL"
                value={form.doc_url}
                onChange={(e) => setForm({ ...form, doc_url: e.target.value })}
              />
              <textarea
                className="border p-2 rounded col-span-2"
                placeholder="Method / Notes"
                value={form.method || ''}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm col-span-2">
                <input
                  type="checkbox"
                  checked={!!form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />{' '}
                Active
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    id: null,
                    name: '',
                    description: '',
                    method: '',
                    frequency_code: '6M',
                    risk_level: 'Medium',
                    doc_url: '',
                    active: true,
                  });
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveTemplate}>
                <Save size={16} className="mr-1" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment modal */}
      {editingA && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-40">
          <div className="bg-white rounded-xl p-4 w-full max-w-xl shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{aForm.id ? 'Edit' : 'New'} Assignment</h3>
            <div className="grid grid-cols-2 gap-3">
              <select
                className="border p-2 rounded"
                value={aForm.asset_code}
                onChange={(e) => setAForm({ ...aForm, asset_code: e.target.value })}
              >
                <option value="">Select Asset</option>
                {assets.map((as) => (
                  <option key={as.asset_code} value={as.asset_code}>
                    {as.asset_code} — {as.name}
                  </option>
                ))}
              </select>
              <select
                className="border p-2 rounded"
                value={aForm.template_uid}
                onChange={(e) => setAForm({ ...aForm, template_uid: e.target.value })}
              >
                <option value="">Select Template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                className="border p-2 rounded"
                type="date"
                value={aForm.next_due_date}
                onChange={(e) => setAForm({ ...aForm, next_due_date: e.target.value })}
              />
              <input
                className="border p-2 rounded col-span-2"
                placeholder="Notes"
                value={aForm.notes || ''}
                onChange={(e) => setAForm({ ...aForm, notes: e.target.value })}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingA(false);
                  setAForm({
                    id: null,
                    asset_code: '',
                    template_uid: '',
                    next_due_date: '',
                    notes: '',
                    plant_code: '',
                  });
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveAssignment}>
                <Save size={16} className="mr-1" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin edit modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50">
          <div className="bg-white rounded-xl p-4 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Edit PM Occurrence</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm col-span-2">Occurrence: {shortId(editRow.occurrence_uid)}</label>
              <input
                className="border p-2 rounded"
                type="date"
                value={editData.scheduled_for}
                onChange={(e) => setEditData({ ...editData, scheduled_for: e.target.value })}
              />
              <select
                className="border p-2 rounded"
                value={editData.status}
                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
              >
                {['Planned', 'Issued', 'Done', 'Verified', 'Canceled'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                className="border p-2 rounded col-span-2"
                placeholder="Work Order UUID (optional)"
                value={editData.work_order_uid || ''}
                onChange={(e) =>
                  setEditData({ ...editData, work_order_uid: e.target.value || null })
                }
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>
                <Save size={16} className="mr-1" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PMScheduler;
