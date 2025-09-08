// src/components/submodules/materialinward/MaterialInspection.jsx
// Material Inspection: scan/type Gate Pass → hydrate POs/Invoices/Materials,
// per-material OK/Not OK + batch/vendor/manufacturer fields,
// per-row "Submit & Release" (no QA) if OK, or "Submit for QA" if damaged/not OK.
// Includes checklist (Material Inspection category), skeletons, gradient branding,
// color-coded row status badges, route :gpNo auto-load, central gatepass helpers,
// and A4 Print/Preview.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../utils/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

import Button from '../../ui/button'; // Default import
import { Card } from '../../ui/card';
import Input from '../../ui/Input'; // Correct default import
import Label from '../../ui/Label';
import { Skeleton } from '../../ui/skeleton';

import {
  QrCode, Truck, ClipboardList, Search, Loader2, PackageSearch, Package,
  CheckCircle2, XCircle, PauseCircle, Send, RefreshCw, Printer, FileText,
  UserRound, Calendar as CalendarIcon, Building2
} from 'lucide-react';
import logo from '../../../assets/logo.png';

// Central helpers (robust lookup by UUID or gate_pass_no; optional flattened lines view)
import { getGateEntry, getGateEntryLines } from '../../../utils/gatepass';

/* ---------- small utils ---------- */
const cls = (...a) => a.filter(Boolean).join(' ');
const iso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const prettyDate = (s) => { try { return s ? new Date(s).toLocaleDateString() : ''; } catch { return s || ''; } };
const badgeColor = (s) => {
  const k = String(s || '').toLowerCase();
  if (['released', 'ok'].includes(k)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['submitted', 'pending qa', 'submitted for qa'].includes(k)) return 'bg-sky-100 text-sky-700 border-sky-200';
  if (['qa approved'].includes(k)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['qa rejected', 'rejected', 'not ok'].includes(k)) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (['on hold', 'hold'].includes(k)) return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

/* ---------- UOM pretty-print (render only) ---------- */
const uomPretty = (u) => {
  const s = String(u || '').trim().toUpperCase();
  const map = {
    KG: 'kg', KGS: 'kg', KILOGRAM: 'kg', KILOGRAMS: 'kg',
    G: 'g', GM: 'g', GMS: 'g', GRAM: 'g', GRAMS: 'g',
    MG: 'mg', MCG: 'µg',
    L: 'L', LT: 'L', LTR: 'L', LTRS: 'L', LITRE: 'L', LITERS: 'L', LITRES: 'L',
    ML: 'mL',
    NOS: 'pcs', PC: 'pcs', PCS: 'pcs', UNIT: 'unit', UNITS: 'units',
    BAG: 'bag', BAGS: 'bags', BOX: 'box', BOTTLE: 'bottle', JAR: 'jar',
    M: 'm', MTR: 'm', CM: 'cm', MM: 'mm',
    SQM: 'm²', SQFT: 'ft²', M2: 'm²', FT2: 'ft²',
    M3: 'm³', CUFT: 'ft³'
  };
  return map[s] || (s || '-');
};

/* ---------- robust role helpers ---------- */
const normRoles = (r) => Array.isArray(r) ? r : (r ? [r] : []);
const roleStr = (x) => (typeof x === 'string' ? x : (x?.name || x?.role || x?.title || ''));
const hasRole = (r, needle) => normRoles(r).some((x) => roleStr(x).toLowerCase() === String(needle || '').toLowerCase());
const isQA = (r) => hasRole(r, 'qa') || hasRole(r, 'quality') || hasRole(r, 'super admin') || hasRole(r, 'qa user');

/* ---------- safe logo URL for print window ---------- */
const getLogoUrl = () => {
  try {
    const l = String(logo || '');
    if (/^https?:\/\//i.test(l)) return l;
    if (typeof window !== 'undefined') {
      if (l.startsWith('/')) return window.location.origin + l;
      return new URL(l, window.location.origin).href;
    }
    return l;
  } catch { return String(logo || ''); }
};

/* ---------- qty formatting (3 decimals on blur, unless user typed ≤3) ---------- */
const normalizeQtyInput = (s) => {
  const t = String(s ?? '').trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  const parts = t.split('.');
  if (parts.length === 2) {
    return parts[1].length <= 3 ? t : n.toFixed(3);
  }
  return n.toFixed(3);
};

/* ---------- data coalescing helper ---------- */
const coalesce = (...vals) => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined') return s;
  }
  return '';
};

/* ---------- pick most frequent non-empty ---------- */
const most = (arr) => {
  const m = new Map();
  for (const v of arr) {
    const s = String(v || '').trim();
    if (!s) continue;
    m.set(s, (m.get(s) || 0) + 1);
  }
  let best = ''; let c = 0;
  for (const [k, v] of m) { if (v > c) { best = k; c = v; } }
  return best;
};

/* ---------- derive vendor from Gate Entry (first preference) ---------- */
const deriveVendorFromGate = (ge) => {
  const names = []; const codes = [];
  names.push(coalesce(ge?.vendor_snapshot?.name));
  codes.push(coalesce(ge?.vendor_snapshot?.code, ge?.vendor_snapshot?.vendor_code));
  names.push(coalesce(ge?.vendor_name, ge?.vendor?.name, ge?.supplier_name));
  codes.push(coalesce(ge?.vendor_code, ge?.vendor?.code, ge?.supplier_code));
  const bundle = Array.isArray(ge?.po_bundle_json) ? ge.po_bundle_json : [];
  for (const b of bundle) {
    names.push(coalesce(b?.vendor_name, b?.vendor?.name, b?.supplier_name));
    codes.push(coalesce(b?.vendor_code, b?.vendor?.code, b?.supplier_code));
  }
  return { vendor_name: most(names), vendor_code: most(codes) };
};

/* ---------- vendor resolver from POs + vendors_flat (second/third preference) ---------- */
const resolveVendorForPOs = async (posList) => {
  if (!Array.isArray(posList) || !posList.length) return { vendor_name: '', vendor_code: '' };
  try {
    // pull purchase_orders
    const { data: poRows } = await supabase.from('purchase_orders')
      .select('po_no,vendor_snapshot,vendor_code,vendor_id,vendor_name,vendor')
      .in('po_no', posList);

    const names = (poRows || []).map((p) => coalesce(p?.vendor_snapshot?.name, p?.vendor_name, p?.vendor?.name));
    let vendor_name = most(names);
    let vendor_code = most((poRows || []).map((p) => coalesce(p?.vendor_snapshot?.code, p?.vendor_snapshot?.vendor_code, p?.vendor_code, p?.vendor?.code)));

    // if code missing, look up vendors_flat by vendor_id list
    const ids = [...new Set((poRows || []).map((p) => p?.vendor_id).filter(Boolean))];
    if (ids.length) {
      try {
        const { data: vflat } = await supabase.from('vendors_flat').select('id,name,vendor_code,code').in('id', ids);
        if (Array.isArray(vflat) && vflat.length) {
          const vNames = vflat.map((v) => v?.name);
          const vCodes = vflat.map((v) => coalesce(v?.vendor_code, v?.code));
          vendor_name = vendor_name || most(vNames);
          vendor_code = vendor_code || most(vCodes);
        }
      } catch { /* ignore */ }
    }

    // if still no code but we have a name, try name match in vendors_flat
    if (vendor_name && !vendor_code) {
      try {
        const { data: v1 } = await supabase.from('vendors_flat').select('vendor_code,code,name').eq('name', vendor_name).maybeSingle();
        if (v1) { vendor_code = coalesce(v1.vendor_code, v1.code); }
        if (!vendor_code) {
          const { data: v2 } = await supabase.from('vendors_flat').select('vendor_code,code,name').ilike('name', vendor_name).maybeSingle();
          if (v2) { vendor_code = coalesce(v2.vendor_code, v2.code); }
        }
      } catch { /* ignore */ }
    }

    return { vendor_name, vendor_code };
  } catch {
    return { vendor_name: '', vendor_code: '' };
  }
};

/* ---------- component ---------- */
const MaterialInspection = () => {
  const { user, role } = useAuth() || {};
  const { gpNo: routeGp } = useParams() || {};

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Gate pass basics
  const [gp, setGp] = useState(null);
  const [poList, setPoList] = useState([]);
  const [invList, setInvList] = useState([]);
  const [vendorBlock, setVendorBlock] = useState({ vendor_name: '', vendor_code: '' });
  const [matCount, setMatCount] = useState(null);

  // Checklist (Material Inspection category)
  const [checkItems, setCheckItems] = useState([]);

  // Materials (flattened per PO/Invoice/Line)
  const [rows, setRows] = useState([]);

  const [holdNote, setHoldNote] = useState('');
  const a4Ref = useRef(null);
  const gpInputRef = useRef(null);
  useEffect(() => { gpInputRef.current?.focus(); }, []);

  /* ---------- fetchers ---------- */
  const fetchChecklist = useCallback(async () => {
    const { data, error } = await supabase.from('vw_checklist_master').select('id,label,seq,category').eq('category', 'Material Inspection').order('seq', { ascending: true });
    if (!error && Array.isArray(data) && data.length) {
      setCheckItems(data.map((r) => ({ id: r.id, label: r.label, ok: null, remarks: '' }))); return;
    }
    setCheckItems([
      { id: 'mi-01', label: 'Packaging intact (no tampering/leaks)', ok: null, remarks: '' },
      { id: 'mi-02', label: 'Containers clean & labeled', ok: null, remarks: '' },
      { id: 'mi-03', label: 'No pest/odor/contamination signs', ok: null, remarks: '' },
      { id: 'mi-04', label: 'COA/Docs available & matched', ok: null, remarks: '' },
    ]);
  }, []);

  // Parse from generic Gate Entry (po_bundle_json)
  const parseFromGE = (row) => {
    const bundle = Array.isArray(row?.po_bundle_json) ? row.po_bundle_json : [];
    const pos = [...new Set(bundle.map((b) => b.po_no).filter(Boolean))];
    const invoices = [...new Map(bundle.map((b) => [`${b.po_no}#${b.invoice_no}`, { po_no: b.po_no, invoice_no: b.invoice_no, invoice_date: b.po_date }])).values()].filter((x) => x.invoice_no);
    const mats = bundle.flatMap((b) => {
      const arr = Array.isArray(b.materials) ? b.materials : [];
      return arr.map((m, i) => ({
        key: `${b.po_no}#${b.invoice_no || ''}#${m.material_code || m.id || i}`,
        po_no: b.po_no || '',
        invoice_no: b.invoice_no || '',
        invoice_date: b.po_date || '',
        material_code: m.material_code || m.materials?.code || '',
        material_desc: m.material_description || m.description || m.materials?.description || '',
        po_qty: m.po_qty || m.qty || '',
        uom: m.uom || m.unit || '',
        recv_qty: '',
        vendor_name: '',
        vendor_code: '',
        vendor_batch_no: 'NA',
        manufacturer: 'NA',
        manufacturer_batch_no: 'NA',
        ok: null,
        damage: { containers: '', qty: '', uom: m.uom || m.unit || '', remarks: '' },
        remarks: '',
        status: 'Draft',
      }));
    });
    return { pos, invoices, materials: mats };
  };

  const hydrateMaterialsIfMissing = useCallback(async (posIn, matsIn) => {
    if (matsIn.length || !posIn.length) return matsIn;
    try {
      const { data: poRows } = await supabase.from('purchase_orders').select('id,po_no,vendor_snapshot,vendor_code').in('po_no', posIn);
      const poMap = new Map((poRows || []).map((p) => [p.po_no, p]));
      const ids = (poRows || []).map((p) => p.id);
      if (!ids.length) return matsIn;
      const { data: lines } = await supabase.from('purchase_order_lines')
        .select('id,line_no,po_id,material_id,description,unit,qty,materials:materials(code,description)')
        .in('po_id', ids).order('line_no', { ascending: true });
      const next = (lines || []).map((r) => {
        const p = Array.from(poMap.values()).find((x) => x.id === r.po_id);
        const v = p?.vendor_snapshot || {};
        const vCode = coalesce(v.code, v.vendor_code, p?.vendor_code);
        return {
          key: `${p?.po_no || ''}##${r.materials?.code || r.material_id}`,
          po_no: p?.po_no || '',
          invoice_no: '',
          invoice_date: '',
          material_code: r.materials?.code || '',
          material_desc: r.description || r.materials?.description || '',
          po_qty: r.qty || '',
          uom: r.unit || '',
          recv_qty: '',
          vendor_name: coalesce(v.name),
          vendor_code: vCode,
          vendor_batch_no: 'NA',
          manufacturer: 'NA',
          manufacturer_batch_no: 'NA',
          ok: null,
          damage: { containers: '', qty: '', uom: r.unit || '', remarks: '' },
          remarks: '',
          status: 'Draft',
        };
      });
      return next;
    } catch { return matsIn; }
  }, []);

  // Fetch gate pass + materials (with vendors_flat code resolution)
  const fetchGatePassBundle = useCallback(async (gpNoOrId) => {
    try {
      const ge = await getGateEntry(gpNoOrId);
      const parsed = parseFromGE(ge);

      setGp({ id: ge.id, gate_pass_no: ge.gate_pass_no, transporter_name: ge.transporter_name, lr_no: ge.lr_no, lr_date: ge.lr_date, driver_name: ge.driver_name, vehicle_no: ge.vehicle_no });
      setPoList(parsed.pos);
      setInvList(parsed.invoices);

      // 1) gate entry
      let resolvedVendor = deriveVendorFromGate(ge);

      // 2) purchase_orders + vendors_flat
      if (!(resolvedVendor.vendor_name || resolvedVendor.vendor_code)) {
        try { resolvedVendor = await resolveVendorForPOs(parsed.pos); } catch { }
      } else if (resolvedVendor.vendor_name && !resolvedVendor.vendor_code) {
        // augment: if name present but code missing, top up from vendors_flat
        try {
          const { data: v1 } = await supabase.from('vendors_flat').select('vendor_code,code,name').eq('name', resolvedVendor.vendor_name).maybeSingle();
          if (v1) { resolvedVendor.vendor_code = coalesce(v1.vendor_code, v1.code, resolvedVendor.vendor_code); }
          if (!resolvedVendor.vendor_code) {
            const { data: v2 } = await supabase.from('vendors_flat').select('vendor_code,code,name').ilike('name', resolvedVendor.vendor_name).maybeSingle();
            if (v2) { resolvedVendor.vendor_code = coalesce(v2.vendor_code, v2.code, resolvedVendor.vendor_code); }
          }
        } catch { }
      }

      setVendorBlock({ vendor_name: resolvedVendor.vendor_name || '', vendor_code: resolvedVendor.vendor_code || '' });

      // Materials populate + vendor defaults
      let mats = parsed.materials || [];
      if (!mats.length) { mats = await hydrateMaterialsIfMissing(parsed.pos, mats); }
      if (resolvedVendor.vendor_name || resolvedVendor.vendor_code) {
        mats = mats.map((m) => ({
          ...m,
          vendor_name: m.vendor_name || resolvedVendor.vendor_name || '',
          vendor_code: m.vendor_code || resolvedVendor.vendor_code || '',
        }));
      }
      setRows(mats);

      try {
        const lines = await getGateEntryLines(gpNoOrId);
        setMatCount(Array.isArray(lines) ? lines.length : null);
      } catch { setMatCount(null); }
    } catch (err) {
      toast.error(err?.message || 'Gate Pass not found');
      setGp(null); setPoList([]); setInvList([]); setRows([]); setMatCount(null);
      throw err;
    }
  }, [hydrateMaterialsIfMissing]);

  const fetchExisting = useCallback(async (gpNo) => {
    const { data } = await supabase.from('material_inspections')
      .select('gate_pass_no,po_list,invoice_list,materials,created_by,created_by_email,qa_user_id,qa_user_email,qa_decided_at,status,overall_status,overall_remarks,hold_note')
      .eq('gate_pass_no', gpNo).maybeSingle();
    if (data) {
      if (Array.isArray(data.po_list)) setPoList((p) => (p.length ? p : data.po_list));
      if (Array.isArray(data.invoice_list)) setInvList((i) => (i.length ? i : data.invoice_list));
      if (Array.isArray(data.materials) && data.materials.length) {
        setRows((prev) => {
          if (!prev.length) return data.materials;
          const map = new Map(prev.map((r) => [r.key, r]));
          data.materials.forEach((r) => { map.set(r.key, { ...map.get(r.key), ...r }); });
          return Array.from(map.values());
        });
        try {
          const persistedVendorName = most((data.materials || []).map((x) => x.vendor_name));
          const persistedVendorCode = most((data.materials || []).map((x) => x.vendor_code));
          if (persistedVendorName || persistedVendorCode) {
            setVendorBlock((v) => ({ vendor_name: coalesce(v.vendor_name, persistedVendorName), vendor_code: coalesce(v.vendor_code, persistedVendorCode) }));
          }
        } catch { }
      }
      if (data.hold_note) setHoldNote((h) => h || data.hold_note);
    }
  }, []);

  const loadAll = useCallback(async (gpNo) => {
    setLoading(true);
    try {
      await fetchChecklist();
      await fetchGatePassBundle(gpNo);
      await fetchExisting(gpNo);
      toast.success('Gate Pass loaded');
    } catch { } finally { setLoading(false); }
  }, [fetchChecklist, fetchGatePassBundle, fetchExisting]);

  /* ---------- route :gpNo auto-load ---------- */
  useEffect(() => { (async () => { if (!routeGp) return; setQuery(routeGp); await loadAll(routeGp); })(); }, [routeGp]); // eslint-disable-line

  /* ---------- status derivation (document-level) ---------- */
  const deriveMiStatus = (materials) => {
    const hasAny = Array.isArray(materials) && materials.length > 0;
    const anySubmitted = materials.some(r => r.status === 'Submitted');
    const allReleased = hasAny && materials.every(r => r.status === 'Released');
    if (anySubmitted) return 'Submitted';
    if (allReleased) return 'QA Approved'; // "Completed" equivalent per CHECK constraint
    return 'Draft';
  };

  /* ---------- overall_status derivation (document-level) ----------
     Accepted   -> all rows Released  OR doc status is "QA Approved"
     Rejected   -> any row QA Rejected OR doc status is "QA Rejected"
     Quarantine -> any row Submitted, or doc On Hold, or hold_note present
     (otherwise null so we don't fight the DB auto/trigger logic)
  */
  const deriveMiOverallStatus = (materials, docStatus, docHoldNote) => {
    const rowsArr = Array.isArray(materials) ? materials : [];

    const anyRejected =
      rowsArr.some(r =>
        String(r.status || '').toLowerCase() === 'qa rejected' ||
        String(r?.qa?.decision || '').toLowerCase() === 'rejected'
      ) ||
      String(docStatus || '').toLowerCase() === 'qa rejected';

    if (anyRejected) return 'Rejected';

    const allReleased = rowsArr.length > 0 && rowsArr.every(
      r => String(r.status || '').toLowerCase() === 'released'
    );
    const anySubmitted = rowsArr.some(
      r => String(r.status || '').toLowerCase() === 'submitted'
    );
    const onHold = String(docStatus || '').toLowerCase() === 'on hold' || !!docHoldNote;

    if (onHold || anySubmitted) return 'Quarantine';
    if (allReleased || String(docStatus || '').toLowerCase() === 'qa approved') return 'Accepted';

    return null; // let triggers decide if applicable
  };

  /* ---------- persistence ---------- */
  const persist = (payload) =>
    supabase
      .from('material_inspections')
      .upsert(payload, { onConflict: 'gate_pass_no' })
      .select('gate_pass_no,status,overall_status,updated_at,materials')
      .maybeSingle();

  const buildPayload = (override) => {
  const cleanRows = rows.map((r) => {
    const noDamage = !(
      (r.damage?.containers && String(r.damage.containers).trim() !== '') ||
      (r.damage?.qty && String(r.damage.qty).trim() !== '') ||
      (r.damage?.remarks && String(r.damage.remarks).trim() !== '')
    );
    const computedRowStatus = r.status ?? (r.ok === true && noDamage ? 'Released' : 'Draft');

    return {
      key: r.key,
      po_no: r.po_no,
      invoice_no: r.invoice_no,
      invoice_date: r.invoice_date,
      material_code: r.material_code,
      material_desc: r.material_desc,
      po_qty: r.po_qty,
      uom: r.uom,
      recv_qty: r.recv_qty || '',
      vendor_name: r.vendor_name || vendorBlock.vendor_name || '',
      vendor_code: r.vendor_code || vendorBlock.vendor_code || '',
      vendor_batch_no: r.vendor_batch_no || 'NA',
      manufacturer: r.manufacturer || 'NA',
      manufacturer_batch_no: r.manufacturer_batch_no || 'NA',
      ok: r.ok,
      damage: {
        containers: r.damage?.containers || '',
        qty: r.damage?.qty || '',
        uom: r.damage?.uom || r.uom || '',
        remarks: r.damage?.remarks || '',
      },
      remarks: r.remarks || '',
      status: computedRowStatus,
      qa: r.qa || null,
    };
  });

  const finalStatus = override?.status ?? deriveMiStatus(cleanRows);

  const finalOverall =
    override?.overall_status ??
    deriveMiOverallStatus(cleanRows, finalStatus, (override?.hold_note ?? holdNote));

  return {
    gate_pass_no: gp?.gate_pass_no || query.trim(),
    gate_pass_id: gp?.id || null,
    po_list: poList || [],
    invoice_list: invList || [],
    materials: cleanRows,
    status: finalStatus,
    overall_status: finalOverall,
    overall_remarks: override?.overall_remarks || null,
    hold_note: (override?.hold_note ?? holdNote) || null,   // <-- fixed
    updated_by: user?.id || null,
    updated_by_email: user?.email || null,
    created_by: (override?.created_by ?? user?.id) ?? null,
    created_by_email: (override?.created_by_email ?? user?.email) ?? null,
    qa_user_id: override?.qa_user_id || null,
    qa_user_email: override?.qa_user_email || null,
    qa_decided_at: override?.qa_decided_at || null,
    updated_at: new Date().toISOString(),
  };
};

  /* ---------- actions ---------- */
  const handleFetch = useCallback(() => {
    const v = (query || '').trim();
    if (!v) { toast.error('Enter/scan a Gate Pass No.'); gpInputRef.current?.focus(); return; }
    loadAll(v);
  }, [query, loadAll]);

  const editRow = (idx, p) => { setRows((prev) => { const n = [...prev]; n[idx] = { ...n[idx], ...p }; return n; }); };

  const releaseRow = async (idx) => {
    const r = rows[idx];
    if (r.ok !== true) { toast.error('Mark as OK to release'); return; }
    if (r.damage?.containers || r.damage?.qty || r.damage?.remarks) { toast.error('Remove damage details to release'); return; }
    setSaving(true);
    const nextRows = rows.map((row, i) => (i === idx ? { ...row, status: 'Released' } : row));
    setRows(nextRows);
    const nextStatus = deriveMiStatus(nextRows);
    const payload = buildPayload({ status: nextStatus });
    await toast.promise(persist(payload), { loading: 'Releasing material...', success: 'Released (no QA required)', error: 'Release failed' });
    setSaving(false);
  };

  const submitRowQA = async (idx) => {
    const r = rows[idx];
    const hasDamage = !!(r.damage?.containers || r.damage?.qty || r.damage?.remarks);
    if (r.ok !== false && !hasDamage) { toast.error('Set Not OK or add damage details'); return; }
    setSaving(true);
    const nextRows = rows.map((row, i) => (i === idx ? { ...row, status: 'Submitted' } : row));
    setRows(nextRows);
    const payload = buildPayload({ status: 'Submitted' });
    await toast.promise(persist(payload), { loading: 'Submitting for QA...', success: 'Submitted to QA', error: 'Submit failed' });
    setSaving(false);
  };

  const releaseAllOK = async () => {
    const candidates = rows.filter((r) => r.ok === true && !(r.damage?.containers || r.damage?.qty || r.damage?.remarks));
    if (!candidates.length) { toast('No fully OK rows to release'); return; }
    setSaving(true);
    const nextRows = rows.map((r) => r.ok === true && !(r.damage?.containers || r.damage?.qty || r.damage?.remarks) ? { ...r, status: 'Released' } : r);
    setRows(nextRows);
    const nextStatus = deriveMiStatus(nextRows);
    const payload = buildPayload({ status: nextStatus });
    await toast.promise(persist(payload), { loading: 'Releasing OK materials...', success: 'All OK rows released', error: 'Bulk release failed' });
    setSaving(false);
  };

  const saveDraft = async () => {
    setSaving(true);
    const nextStatus = deriveMiStatus(rows);
    const payload = buildPayload({ status: nextStatus });
    await toast.promise(persist(payload), { loading: 'Saving...', success: 'Saved', error: 'Save failed' });
    setSaving(false);
  };

  const holdGate = async () => {
    if (!holdNote.trim()) { toast.error('Add a Hold note/reason'); return; }
    setSaving(true);
    const payload = buildPayload({ status: 'On Hold', hold_note: holdNote });
    await toast.promise(persist(payload), { loading: 'Placing gate on Hold...', success: 'Gate marked On Hold', error: 'Hold failed' });
    setSaving(false);
  };

  /* ---------- print (A4) ---------- */
  const printA4 = () => {
    if (!gp) { toast.error('Load a Gate Pass first'); return; }
    const html = a4Ref.current?.innerHTML || '';
    const w = window.open('', '_blank', 'width=900,height=1200');
    w.document.open();
    w.document.write(`
      <html>
        <head>
          <title>Material Inspection – ${gp.gate_pass_no}</title>
          <style>
            @page{size:A4;margin:16mm;}
            body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#111827;}
            .header{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px;}
            .logo{height:40px;}
            .h1{font-size:20px;font-weight:700;margin:0;}
            .meta{font-size:12px;color:#374151;}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
            .box{border:1px solid #e5e7eb;border-radius:8px;padding:8px;}
            table{width:100%;border-collapse:collapse;table-layout:fixed;}
            th,td{border:1px solid #e5e7eb;padding:8px 10px;font-size:12px;vertical-align:middle;}
            th{background:#f9fafb;text-align:left;}
            .chip{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:9999px;border:1px solid #cbd5e1;font-size:11px;}
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  /* ---------- computed ---------- */
  const okCount = rows.filter((r) => r.status === 'Released').length;
  const qaCount = rows.filter((r) => r.status === 'Submitted').length;

  /* ---------- UI ---------- */
  return (
    <div className="p-3 sm:p-4">
      {/* Gradient header */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Material Inward — Material Inspection</div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2.5 py-0.5 text-[11px] border border-white/70 shadow-sm">
            <CheckCircle2 className="w-3 h-3" /> OK → Submit &amp; Release (no QA)
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2.5 py-0.5 text-[11px] border border-white/70 shadow-sm">
            <XCircle className="w-3 h-3" /> Not OK/Damage → Submit for QA
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={printA4} className="gap-1 bg-white text-blue-800 hover:bg-blue-50">
              <Printer className="w-4 h-4" /><span>Print A4</span>
            </Button>
          </div>
        </div>

        {/* Scan/Search bar */}
        <div className="bg-white p-4 border-b">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs flex items-center gap-2"><QrCode className="w-4 h-4 text-blue-700" />Gate Pass No.</Label>
              <div className="relative">
                <QrCode className="w-4 h-4 absolute left-2 top-3 text-blue-700" />
                <Input
                  id="gpno"
                  ref={gpInputRef}
                  className="pl-8 h-10"
                  placeholder="Scan or type Gate Pass No."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e?.key === 'Enter') handleFetch(); }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Scanner friendly; press Enter to load</div>
            </div>
            <Button onClick={handleFetch} disabled={loading} className="gap-1 h-10">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}<span>Fetch</span>
            </Button>
            <Button variant="outline" onClick={() => { setQuery(''); gpInputRef.current?.focus(); }} className="gap-1 h-10">
              <RefreshCw className="w-4 h-4" /><span>Clear</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Gate & PO/Invoice summary */}
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-2 mb-3"><Truck className="w-5 h-5 text-blue-700" /><div className="font-medium">Gate Pass Details</div></div>
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-14" />))}</div>
        ) : gp ? (
          <>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <InfoRow icon={<QrCode className="w-4 h-4 text-blue-700" />} label="Gate Pass No." value={gp.gate_pass_no} />
              <InfoRow icon={<Truck className="w-4 h-4 text-blue-700" />} label="Transporter" value={gp.transporter_name} />
              <InfoRow icon={<FileText className="w-4 h-4 text-indigo-700" />} label="LR No." value={gp.lr_no} />
              <InfoRow icon={<CalendarIcon className="w-4 h-4 text-blue-700" />} label="LR Date" value={prettyDate(gp.lr_date)} />
              <InfoRow icon={<UserRound className="w-4 h-4 text-blue-700" />} label="Driver Name" value={gp.driver_name} />
              <InfoRow icon={<Truck className="w-4 h-4 text-blue-700" />} label="Vehicle No." value={gp.vehicle_no} />
              {matCount != null && <InfoRow icon={<Package className="w-4 h-4 text-blue-700" />} label="Material Lines" value={String(matCount)} />}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-medium mb-1 flex items-center gap-2"><PackageSearch className="w-4 h-4 text-blue-700" />PO Numbers</div>
                <div className="flex flex-wrap gap-2">
                  {(poList || []).length ? poList.map((p) => (
                    <span key={p} className="text-xs border rounded px-2 py-1.5 bg-slate-50">{p}</span>
                  )) : (
                    <span className="text-xs text-slate-500">No POs linked</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-700" />Invoices by PO</div>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-sm table-fixed">
                    <colgroup><col style={{ width: '34%' }} /><col style={{ width: '33%' }} /><col style={{ width: '33%' }} /></colgroup>
                    <thead className="bg-slate-50 sticky top-0"><tr><th className="text-left p-3 border-b">PO No.</th><th className="text-left p-3 border-b">Invoice No.</th><th className="text-left p-3 border-b">Invoice Date</th></tr></thead>
                    <tbody>
                      {(invList || []).length ? invList.map((r, idx) => (
                        <tr key={idx} className="odd:bg-white even:bg-slate-50/50">
                          <td className="p-3 border-b align-middle">{r.po_no}</td>
                          <td className="p-3 border-b align-middle">{r.invoice_no}</td>
                          <td className="p-3 border-b align-middle">{prettyDate(r.invoice_date)}</td>
                        </tr>
                      )) : (
                        <tr><td className="p-3 text-slate-500" colSpan={3}>No invoices linked</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : <div className="text-sm text-slate-500">Scan or enter a Gate Pass to view details.</div>}
      </Card>

      {/* Checklist (Material Inspection) */}
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-2 mb-3"><ClipboardList className="w-5 h-5 text-blue-700" /><div className="font-medium">Material Inspection Checklist</div><span className="ml-auto text-xs text-slate-500">Use as guidance; per-row decision controls below</span></div>
        {!checkItems.length ? (
          <div className="grid gap-2">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-12" />))}</div>
        ) : (
          <div className="overflow-auto rounded border">
            <table className="min-w-full text-sm table-fixed">
              <colgroup><col style={{ width: 48 }} /><col style={{ width: '44%' }} /><col style={{ width: 220 }} /><col style={{ width: 'auto' }} /></colgroup>
              <thead className="bg-slate-50 sticky top-0"><tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Check</th><th className="p-3 text-center">Result</th><th className="p-3 text-left">Remarks</th></tr></thead>
              <tbody>
                {checkItems.map((it, idx) => (
                  <tr key={it.id || idx} className="odd:bg-white even:bg-slate-50/50">
                    <td className="p-3 border-b align-middle">{idx + 1}</td>
                    <td className="p-3 border-b align-middle">{it.label}</td>
                    <td className="p-3 border-b align-middle">
                      <div className="flex items-center justify-center gap-2">
                        <Button variant={it.ok === true ? '' : 'outline'} className="h-9 px-3 gap-1" onClick={() => setCheckItems((prev) => { const n = [...prev]; n[idx] = { ...n[idx], ok: true }; return n; })}><CheckCircle2 className="w-4 h-4" />OK</Button>
                        <Button variant={it.ok === false ? '' : 'outline'} className="h-9 px-3 gap-1" onClick={() => setCheckItems((prev) => { const n = [...prev]; n[idx] = { ...n[idx], ok: false }; return n; })}><XCircle className="w-4 h-4" />Not OK</Button>
                      </div>
                    </td>
                    <td className="p-3 border-b align-middle">
                      <Input className="h-10" value={it.remarks || ''} onChange={(e) => setCheckItems((prev) => { const n = [...prev]; n[idx] = { ...n[idx], remarks: e.target.value }; return n; })} placeholder="Observation / note" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Materials grid with per-row actions */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3"><Package className="w-5 h-5 text-blue-700" /><div className="font-medium">Materials</div><span className="ml-auto text-xs text-slate-500">{okCount} released • {qaCount} pending QA</span></div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-16" />))}</div>
        ) : rows.length ? (
          <div className="overflow-auto rounded border">
            <table className="min-w-[1850px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">PO No.</th>
                  <th className="p-3 text-left">Invoice No.</th>
                  <th className="p-3 text-left min-w-[260px]">Material</th>
                  <th className="p-3 text-left">PO Qty</th>
                  <th className="p-3 text-left min-w-[160px]">Recv Qty</th>
                  <th className="p-3 text-left min-w-[220px]">Vendor</th>
                  <th className="p-3 text-left min-w-[160px]">Vendor Code</th>
                  <th className="p-3 text-left min-w-[160px]">Vendor Batch</th>
                  <th className="p-3 text-left min-w-[160px]">Manufacturer</th>
                  <th className="p-3 text-left min-w-[160px]">Mfg Batch</th>
                  <th className="p-3 text-left min-w-[220px]">Damage (Cont/Q/UOM)</th>
                  <th className="p-3 text-left min-w-[220px]">Dmg Remarks</th>
                  <th className="p-3 text-left">Result</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left w-[260px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key} className="odd:bg-white even:bg-slate-50/50 align-top">
                    <td className="p-3 border-b">{r.po_no || '-'}</td>
                    <td className="p-3 border-b">
                      <div className="leading-6">{r.invoice_no || '-'}</div>
                      <div className="text-[11px] text-slate-500">{prettyDate(r.invoice_date)}</div>
                    </td>
                    <td className="p-3 border-b">
                      <div className="font-medium leading-6 break-words">{r.material_code}</div>
                      <div className="text-[12px] text-slate-600 whitespace-pre-wrap break-words">{r.material_desc}</div>
                    </td>
                    <td className="p-3 border-b whitespace-nowrap">{r.po_qty} {uomPretty(r.uom)}</td>
                    <td className="p-3 border-b min-w-[160px]">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        inputMode="decimal"
                        className="h-10 w-full text-right"
                        value={r.recv_qty ?? ''}
                        onChange={(e) => editRow(idx, { recv_qty: e.target.value })}
                        onBlur={(e) => editRow(idx, { recv_qty: normalizeQtyInput(e.target.value) })}
                        placeholder="Qty"
                      />
                      <div className="text-[11px] text-slate-500 mt-1">{uomPretty(r.uom)}</div>
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex items-center gap-1 text-xs leading-6"><Building2 className="w-3.5 h-3.5 text-blue-700" /><span className="break-words">{r.vendor_name || vendorBlock.vendor_name || '-'}</span></div>
                    </td>
                    <td className="p-3 border-b"><div className="text-sm break-words">{r.vendor_code || vendorBlock.vendor_code || 'NA'}</div></td>
                    <td className="p-3 border-b">
                      <Input className="h-10" value={r.vendor_batch_no || 'NA'} onChange={(e) => editRow(idx, { vendor_batch_no: e.target.value || 'NA' })} />
                    </td>
                    <td className="p-3 border-b">
                      <Input className="h-10" value={r.manufacturer || 'NA'} onChange={(e) => editRow(idx, { manufacturer: e.target.value || 'NA' })} />
                    </td>
                    <td className="p-3 border-b">
                      <Input className="h-10" value={r.manufacturer_batch_no || 'NA'} onChange={(e) => editRow(idx, { manufacturer_batch_no: e.target.value || 'NA' })} />
                    </td>
                    <td className="p-3 border-b">
                      <div className="grid grid-cols-3 gap-2">
                        <Input className="h-10" value={r.damage?.containers || ''} onChange={(e) => editRow(idx, { damage: { ...r.damage, containers: e.target.value } })} placeholder="Cont" />
                        <Input className="h-10" value={r.damage?.qty || ''} onChange={(e) => editRow(idx, { damage: { ...r.damage, qty: e.target.value } })} placeholder="Qty" />
                        <Input className="h-10" value={r.damage?.uom || r.uom} onChange={(e) => editRow(idx, { damage: { ...r.damage, uom: e.target.value } })} placeholder="UOM" />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {uomPretty(r.damage?.uom || r.uom)}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      <Input className="h-10" value={r.damage?.remarks || ''} onChange={(e) => editRow(idx, { damage: { ...r.damage, remarks: e.target.value } })} placeholder="Damage remarks" />
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex items-center gap-2">
                        <Button variant={r.ok === true ? '' : 'outline'} className="h-9 px-3" onClick={() => editRow(idx, { ok: true, damage: { containers: '', qty: '', uom: r.uom, remarks: '' } })} title="Mark OK"><CheckCircle2 className="w-4 h-4" /></Button>
                        <Button variant={r.ok === false ? '' : 'outline'} className="h-9 px-3" onClick={() => editRow(idx, { ok: false })} title="Mark Not OK"><XCircle className="w-4 h-4" /></Button>
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      <span className={cls('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium', badgeColor(r.status))}>{r.status}</span>
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => releaseRow(idx)} disabled={saving || r.status === 'Released'} className="gap-1 h-9"><CheckCircle2 className="w-4 h-4" /><span>Release</span></Button>
                        <Button size="sm" variant="secondary" onClick={() => submitRowQA(idx)} disabled={saving || r.status === 'Submitted'} className="gap-1 h-9"><Send className="w-4 h-4" /><span>Submit QA</span></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm text-slate-500">No materials found for this Gate Pass.</div>}

        {/* Footer actions */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={saveDraft} disabled={saving || loading} className="gap-1 h-10">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}<span>Save Draft</span></Button>
          <Button variant="secondary" onClick={releaseAllOK} disabled={saving || loading || !rows.length} className="gap-1 h-10"><CheckCircle2 className="w-4 h-4" /><span>Release All OK</span></Button>
          <div className="ml-auto flex items-center gap-2">
            <Input value={holdNote} onChange={(e) => setHoldNote(e.target.value)} placeholder="Hold note (reason)" className="w-64 h-10" />
            <Button variant="outline" onClick={holdGate} disabled={saving || loading || !gp} className="gap-1 h-10"><PauseCircle className="w-4 h-4" /><span>Hold Gate</span></Button>
          </div>
        </div>
      </Card>

      {/* A4 Preview payload (hidden on screen, used by printA4) */}
      <div className="mt-3">
        <Card ref={a4Ref} className="p-4">
          <div className="header" style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e5e7eb', paddingBottom: 8, marginBottom: 12 }}>
            <img src={getLogoUrl()} className="logo" alt="logo" style={{ height: 40 }} />
            <div>
              <div className="h1" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>DigitizerX — Material Inspection</div>
              <div className="meta" style={{ fontSize: 12, color: '#374151' }}>Gate Pass: {gp?.gate_pass_no || '(pending)'} • Date: {iso()}</div>
            </div>
          </div>

          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="box" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
              <div className="font-semibold text-sm mb-2">Gate Details</div>
              <div className="text-sm"><b>Transporter:</b> {gp?.transporter_name || '-'}</div>
              <div className="text-sm"><b>LR No.:</b> {gp?.lr_no || '-'} &nbsp; <b>LR Date:</b> {prettyDate(gp?.lr_date)}</div>
              <div className="text-sm"><b>Driver:</b> {gp?.driver_name || '-'} &nbsp; <b>Vehicle:</b> {gp?.vehicle_no || '-'}</div>
            </div>
            <div className="box" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
              <div className="font-semibold text-sm mb-2">PO & Invoices</div>
              <div className="text-sm"><b>POs:</b> {(poList || []).join(', ') || '-'}</div>
              <div className="text-sm"><b>Invoices:</b> {(invList || []).map((i) => i.invoice_no).filter(Boolean).join(', ') || '-'}</div>
            </div>
          </div>

          <div className="box" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginTop: 12 }}>
            <div className="font-semibold text-sm mb-2">Materials</div>
            <div className="overflow-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>PO</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Invoice</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Material</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>PO Qty</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Recv Qty</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Vendor</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Vendor Code</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Batches</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Damage</th>
                    <th style={{ textAlign: 'left', background: '#f9fafb', padding: '8px 10px', border: '1px solid #e5e7eb' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.po_no}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.invoice_no || '-'}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{r.material_code}</div>
                        <div style={{ fontSize: 11, color: '#475569' }}>{r.material_desc}</div>
                      </td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.po_qty} {uomPretty(r.uom)}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.recv_qty || '-'} {r.recv_qty ? uomPretty(r.uom) : ''}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.vendor_name || vendorBlock.vendor_name || '-'}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.vendor_code || vendorBlock.vendor_code || 'NA'}</td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>
                        <div>Vendor: {r.vendor_batch_no || 'NA'}</div>
                        <div>Mfg: {r.manufacturer || 'NA'} / {r.manufacturer_batch_no || 'NA'}</div>
                      </td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>
                        {(r.damage?.containers || '-')}/{r.damage?.qty || '-'} / {uomPretty(r.damage?.uom || r.uom || '-')} {r.damage?.remarks ? ` — ${r.damage.remarks}` : ''}
                      </td>
                      <td style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12 }}>{r.status}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={10} style={{ border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>No materials.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

/* ---------- tiny subcomponent ---------- */
const InfoRow = ({ icon, label, value }) => (
  <div className="text-sm leading-6">
    <div className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1">{icon}<span>{label}</span></div>
    <div className="font-medium break-words">{value || '-'}</div>
  </div>
);

export default MaterialInspection;
