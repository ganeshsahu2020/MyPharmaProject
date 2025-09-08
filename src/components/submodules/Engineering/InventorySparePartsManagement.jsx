// src/components/modules/engineering/InventorySparePartsManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../utils/supabaseClient';
import Button from '../../ui/button';  // Default import
import toast, { Toaster } from 'react-hot-toast';
import {
  PackageSearch, Search, Plus, Upload, Save, Edit3, Trash2, Printer, Download,
  RefreshCw, QrCode, MoveRight, ScanLine
} from 'lucide-react';
import logo from '../../../assets/logo.png';
import { printHTMLViaIframe, getLogoDataURL, makeQR } from '../../../utils/print';
import DebugOverlayTamer from '../../common/DebugOverlayTamer';
import { useUOM } from '../../../contexts/UOMContext';

/* ─────────────── small helpers ─────────────── */
const downloadText = (filename, text, mime = 'text/csv') => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
const csvLine = (arr) =>
  arr.map((v) => String(v ?? '').replace(/"/g, '""'))
    .map((v) => /[,\"\n]/.test(v) ? `"${v}"` : v).join(',');
const parseCSV = (text) => {
  const [h, ...lines] = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!h) return [];
  const headers = h.split(',').map((x) => x.trim());
  return lines.map((line) => {
    const cols = line.split(',');
    const obj = {}; headers.forEach((k, i) => { obj[k] = cols[i] ? cols[i].trim() : ''; });
    return obj;
  });
};
const nowIso = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/* demo/template CSV */
const PART_CSV_HEADERS = ['part_code', 'part_name', 'description', 'uom_code', 'active', 'min_qty', 'max_qty', 'reorder_point', 'plant_code', 'bin_code', 'qty_on_hand', 'supplier_name', 'lead_time_days'];
const DEMO_ROWS = [
  ['FLT-HEPA-24x24', 'HEPA Filter 24x24x12 H13', 'Terminal HEPA for cleanroom AHU', 'EA', true, 2, 20, 4, 'Plant1', 'BIN-A1', 6, 'ABC Filters', 14],
  ['FLT-PREF-20x20', 'Pre-Filter 20x20x2 G4', 'Coarse pre-filter for AHU stage-1', 'EA', true, 10, 100, 20, 'Plant1', 'BIN-A2', 12, 'CleanAir Supplies', 7],
  ['GSK-TRIC-1.5', 'Tri-Clamp Gasket 1.5" PTFE', 'PTFE sanitary gasket for TC ferrules', 'EA', true, 20, 200, 40, 'Plant1', 'BIN-B1', 15, 'PharmSeal', 5],
  ['O-RING-EPDM-112', 'O-Ring EPDM AS568-112', 'EPDM O-ring for pump head', 'EA', true, 30, 300, 60, 'Plant1', 'BIN-B2', 80, 'SealsRUs', 3],
  ['TUBE-SIL-1/4', 'Silicone Tubing 1/4" ID', 'Peristaltic grade silicone tubing', 'M', true, 10, 100, 20, 'Plant1', 'BIN-C1', 18, 'BioFlex Tubes', 10],
  ['UV-LAMP-RO-254NM', 'UV Lamp 254nm (RO)', 'UV disinfection lamp for RO loop', 'EA', true, 1, 10, 2, 'Plant1', 'BIN-W1', 1, 'AquaPure Systems', 21],
  ['GAUGE-0-6BAR', 'Pressure Gauge 0–6 bar SS316', '1/4" BSP bottom mount', 'EA', true, 2, 10, 2, 'Plant1', 'BIN-M1', 3, 'Instrumetrix', 14],
  ['BRG-6203-2RS', 'Bearing 6203-2RS', 'Double-sealed deep groove bearing', 'EA', true, 4, 40, 8, 'Plant1', 'BIN-M2', 6, 'MotionParts Co.', 9],
  ['PROBE-PT100-3M', 'Temperature Probe PT100 3m', 'Class A stainless probe', 'EA', true, 2, 12, 3, 'Plant1', 'BIN-E1', 2, 'ThermoSense', 12],
  ['COIL-SOL-24V', 'Solenoid Valve Coil 24V DC', 'Standard coil for SS316 valve', 'EA', true, 5, 50, 10, 'Plant1', 'BIN-V1', 9, 'ValveTech', 8],
];
const downloadPartsTemplate = () =>
  downloadText('parts_import_template.csv', [csvLine(PART_CSV_HEADERS), csvLine(DEMO_ROWS[0])].join('\n'));
const downloadDemoCSV = () =>
  downloadText('parts_seed_demo.csv', [csvLine(PART_CSV_HEADERS)].concat(DEMO_ROWS.map((r) => csvLine(r))).join('\n'));

/* ─────────────── QR scan modal (camera w/ fallback) ─────────────── */
const ScanModal = ({ open, onClose, onResult }) => {
  const [supported, setSupported] = useState(false);
  const [manual, setManual] = useState('');
  const videoRef = useRef(null); const rafRef = useRef(null); const streamRef = useRef(null); const detRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const boot = async () => {
      try {
        const ok = 'BarcodeDetector' in window; setSupported(ok); if (!ok) return;
        const sup = await window.BarcodeDetector.getSupportedFormats(); if (!sup.includes('qr_code')) { setSupported(false); return; }
        detRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
        const tick = async () => {
          try {
            if (videoRef.current && detRef.current) {
              const bar = await detRef.current.detect(videoRef.current);
              if (bar && bar[0]?.rawValue) { onResult(bar[0].rawValue); stop(); return; }
            }
          } catch {}
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {}
    };
    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current) { try { videoRef.current.pause(); } catch {} }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    boot(); return () => stop();
  }, [open, onResult]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center">
      <div className="bg-white rounded-xl p-4 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Scan QR</div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        {supported ? (
          <video ref={videoRef} className="w-full rounded border" playsInline />
        ) : (
          <div className="text-sm">
            <div className="mb-2 text-red-600">QR camera scanning not supported. Paste payload below.</div>
            <textarea
              className="w-full h-40 border rounded p-2"
              placeholder="Paste QR payload here"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <div className="mt-2 text-right">
              <Button onClick={() => { if (manual.trim()) { onResult(manual.trim()); onClose(); } }}>Use Text</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────── Single-bin print modal ─────────────── */
const SingleBinModal = ({ open, onClose, onPrint, defaults }) => {
  const [plant, setPlant] = useState(defaults?.plant_id || 'Plant1');
  const [bin, setBin] = useState(defaults?.bin || '');
  useEffect(() => { if (open) { setPlant(defaults?.plant_id || 'Plant1'); setBin(defaults?.bin || ''); } }, [open, defaults]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center">
      <div className="bg-white rounded-xl p-4 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Print Bin Label</h3>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="border rounded p-2"
            placeholder="Plant (e.g., Plant1)"
            value={plant}
            onChange={(e) => setPlant(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="Bin (e.g., BIN-A1)"
            value={bin}
            onChange={(e) => setBin(e.target.value)}
          />
        </div>
        <div className="mt-3 text-right">
          <Button onClick={() => onPrint(plant, bin)}><Printer size={16} className="mr-1" />Print</Button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────── Main Component ─────────────── */
const InventorySparePartsManagement = () => {
  /* UOMs via context */
  const { uoms, loading: uomLoading } = useUOM();
  const uomOptions = useMemo(
    () => (uoms || []).map(u => ({ id: u.id, code: u.uom_code, name: u.uom_name ?? u.uom_code })),
    [uoms]
  );
  const uomCodeById = useMemo(() => {
    const m = {}; (uoms || []).forEach(u => { m[u.id] = u.uom_code; }); return m;
  }, [uoms]);

  /* data */
  const [parts, setParts] = useState([]);
  const [low, setLow] = useState([]);
  const [plants, setPlants] = useState([]);
  const [plantIdByUid, setPlantIdByUid] = useState({});
  const [qohTotals, setQohTotals] = useState({}); // part_id -> total QOH

  /* ui */
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('details');
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const fileRef = useRef(null);

  /* modal forms */
  const [form, setForm] = useState({ id: null, part_code: '', part_name: '', description: '', uom_code: '', is_quarantine: false, active: true });
  const [locRows, setLocRows] = useState([]);
  const [scanOpen, setScanOpen] = useState(false); const [scanTarget, setScanTarget] = useState(null);
  const [transfer, setTransfer] = useState({ part_uid: null, part_code: '', plant_id: 'Plant1', src_bin: '', dst_plant_id: 'Plant1', dst_bin: '', qty: 0 });
  const [singleBinOpen, setSingleBinOpen] = useState(false); const [singleDefaults, setSingleDefaults] = useState({ plant_id: 'Plant1', bin: '' });

  /* lookups */
  const loadPlants = async () => {
    const r = await supabase.from('plant_master').select('id,plant_id').order('plant_id');
    if (!r.error) {
      setPlants(r.data || []);
      const m = {}; (r.data || []).forEach((x) => { m[x.id] = x.plant_id; }); setPlantIdByUid(m);
    }
  };
  const resolveUomUid = async (uom_code) => {
    if (!uom_code) return null;
    const found = (uoms || []).find(u => String(u.uom_code || '').toLowerCase() === String(uom_code).toLowerCase());
    if (found) return found.id;
    const q = await supabase.from('uom_master').select('id').eq('uom_code', uom_code).maybeSingle();
    if (q.error) throw q.error;
    return q.data?.id || null;
  };
  const resolvePlantUid = async (plantId) => {
    const p = await supabase.from('plant_master').select('id').ilike('plant_id', plantId).maybeSingle();
    if (p.error) throw p.error;
    return p.data?.id || null;
  };
  const loadPartLocations = async (part_uid) => {
    const r = await supabase.from('part_location')
      .select('id,plant_uid,bin_code,min_qty,max_qty,qty_on_hand,reorder_point,supplier_name,lead_time_days')
      .eq('part_uid', part_uid);
    if (r.error) return [];
    return (r.data || []).map((x) => ({
      id: x.id,
      plant_uid: x.plant_uid, plant_id: plantIdByUid[x.plant_uid] || '',
      bin_code: x.bin_code || '',
      min_qty: x.min_qty || 0, max_qty: x.max_qty || 0,
      qty_on_hand: x.qty_on_hand || 0, reorder_point: x.reorder_point || 0,
      supplier_name: x.supplier_name || '', lead_time_days: x.lead_time_days ?? '',
    }));
  };

  /* totals across bins */
  const loadQohTotals = async () => {
    const r = await supabase.from('part_location').select('part_uid,qty_on_hand');
    if (r.error) { setQohTotals({}); return; }
    const map = {};
    for (const row of r.data || []) {
      const k = row.part_uid; map[k] = (map[k] || 0) + Number(row.qty_on_hand || 0);
    }
    setQohTotals(map);
  };

  /* fetch */
  const fetchAll = async () => {
    try {
      setBusy(true);
      await loadPlants();
      const p = await supabase.from('part_master').select('*').order('part_code');
      if (!p.error) setParts(p.data || []);
      const l = await supabase.from('vw_parts_low_stock').select('*');
      if (!l.error) setLow(l.data || []);
      await loadQohTotals();
      setSelected(new Set());
    } catch (e) {
      toast.error(e.message || 'Load failed');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return parts;
    return parts.filter((r) => [r.part_code, r.part_name].some((x) => String(x || '').toLowerCase().includes(s)));
  }, [parts, q]);

  /* CSV import */
  const importCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text(); const rows = parseCSV(text); const newConf = [];
    await toast.promise((async () => {
      for (const r of rows) {
        try {
          const exist = await supabase.from('part_master').select('id,part_name').eq('part_code', r.part_code).maybeSingle();
          if (exist.error) throw exist.error;
          if (exist.data && exist.data.part_name && r.part_name && exist.data.part_name !== r.part_name) {
            newConf.push({ type: 'name_mismatch', part_code: r.part_code, existing_name: exist.data.part_name, csv_name: r.part_name });
          }
          let part_uid = exist.data?.id || null;
          if (!part_uid) {
            const uom_uid = await resolveUomUid(r.uom_code);
            const ins = await supabase.from('part_master').insert([{
              part_code: r.part_code, part_name: r.part_name, description: r.description || '',
              uom_uid, active: String(r.active).toLowerCase() !== 'false'
            }]).select('id').single();
            if (ins.error) throw ins.error; part_uid = ins.data.id;
          }
          const puid = await resolvePlantUid(r.plant_code || 'Plant1');
          if (puid) {
            let q = supabase.from('part_location').select('id').eq('part_uid', part_uid).eq('plant_uid', puid);
            q = r.bin_code ? q.eq('bin_code', r.bin_code) : q.is('bin_code', null);
            const plExist = await q.maybeSingle();
            const payload = {
              part_uid, plant_uid: puid, bin_code: r.bin_code || null,
              min_qty: Number(r.min_qty || 0), max_qty: Number(r.max_qty || 0),
              qty_on_hand: Number(r.qty_on_hand || 0), reorder_point: Number(r.reorder_point || 0),
              supplier_name: r.supplier_name || null, lead_time_days: r.lead_time_days ? Number(r.lead_time_days) : null
            };
            if (plExist.data?.id) {
              const upd = await supabase.from('part_location').update(payload).eq('id', plExist.data.id);
              if (upd.error) throw upd.error;
            } else {
              const ins2 = await supabase.from('part_location').insert([payload]);
              if (ins2.error) throw ins2.error;
            }
          }
        } catch (err) { newConf.push({ type: 'error', part_code: r.part_code, error: err.message }); }
      }
    })(), { loading: 'Importing CSV…', success: 'Import complete', error: (e) => e?.message || 'Import failed' });
    setConflicts(newConf); if (fileRef.current) fileRef.current.value = '';
    await fetchAll();
    if (newConf.length) toast((t) => `Import completed with ${newConf.length} conflict(s). Use Export Conflicts.`, { icon: '⚠️' });
  };
  const exportConflictsCSV = () => {
    if (!conflicts.length) { toast.error('No conflicts'); return; }
    const cols = Object.keys(conflicts[0]);
    const lines = [cols.join(',')].concat(conflicts.map((r) => cols.map((h) => String(r[h] ?? '').replace(/,/g, ';')).join(',')));
    downloadText(`parts_import_conflicts_${nowIso()}.csv`, lines.join('\n'));
  };

  /* CRUD — open editor immediately; then hydrate locations async */
  const openEdit = (r) => {
    // open UI immediately
    setForm({
      id: r.id,
      part_code: r.part_code || '',
      part_name: r.part_name || '',
      description: r.description || '',
      uom_code: uomCodeById[r.uom_uid] || '',
      is_quarantine: !!r.is_quarantine,
      active: !!r.active
    });
    setLocRows([{ id: null, plant_id: 'Plant1', plant_uid: null, bin_code: '', min_qty: 0, max_qty: 0, qty_on_hand: 0, reorder_point: 0, supplier_name: '', lead_time_days: '' }]);
    setTab('details');
    setEditing(true);
    // then load locations
    (async () => {
      const rows = await loadPartLocations(r.id);
      setLocRows(rows.length ? rows : [{ id: null, plant_id: 'Plant1', plant_uid: null, bin_code: '', min_qty: 0, max_qty: 0, qty_on_hand: 0, reorder_point: 0, supplier_name: '', lead_time_days: '' }]);
    })();
  };
  const openNew = () => {
    setForm({ id: null, part_code: '', part_name: '', description: '', uom_code: '', is_quarantine: false, active: true });
    setLocRows([{ id: null, plant_id: 'Plant1', plant_uid: null, bin_code: '', min_qty: 0, max_qty: 0, qty_on_hand: 0, reorder_point: 0, supplier_name: '', lead_time_days: '' }]);
    setTab('details'); setEditing(true);
  };
  const savePartAndLocations = async () => {
    await toast.promise((async () => {
      if (!form.part_code.trim() || !form.part_name.trim()) throw new Error('Part Code & Name required');
      const uom_uid = await resolveUomUid(form.uom_code);
      if (form.uom_code && !uom_uid) throw new Error(`UOM "${form.uom_code}" not found`);
      const payloadPM = {
        part_code: form.part_code.trim(), part_name: form.part_name.trim(), description: form.description || '',
        uom_uid: uom_uid || null, is_quarantine: !!form.is_quarantine, active: !!form.active
      };
      let part_uid = form.id;
      if (part_uid) {
        const { error } = await supabase.from('part_master').update(payloadPM).eq('id', part_uid);
        if (error) throw error;
      } else {
        const ins = await supabase.from('part_master').insert([payloadPM]).select('id').single();
        if (ins.error) throw ins.error; part_uid = ins.data.id; setForm((f) => ({ ...f, id: part_uid }));
      }
      for (const row of locRows) {
        const plant_uid = row.plant_uid || (row.plant_id ? await resolvePlantUid(row.plant_id) : await resolvePlantUid('Plant1'));
        if (!plant_uid) throw new Error(`Plant "${row.plant_id || 'Plant1'}" not found`);
        const payloadPL = {
          part_uid, plant_uid, bin_code: row.bin_code || null,
          min_qty: Number(row.min_qty || 0), max_qty: Number(row.max_qty || 0),
          qty_on_hand: Number(row.qty_on_hand || 0), reorder_point: Number(row.reorder_point || 0),
          supplier_name: row.supplier_name || null, lead_time_days: row.lead_time_days === '' ? null : Number(row.lead_time_days)
        };
        if (row.id) {
          const upd = await supabase.from('part_location').update(payloadPL).eq('id', row.id);
          if (upd.error) throw upd.error;
        } else {
          const ins2 = await supabase.from('part_location').insert([payloadPL]).select('id').single();
          if (ins2.error) throw ins2.error; row.id = ins2.data.id;
        }
      }
      await fetchAll();
    })(), { loading: 'Saving…', success: 'Saved', error: (e) => e?.message || 'Save failed' });
  };
  const deletePart = async (id, code) => {
    const ok = confirm(`Delete part "${code}"? This also removes its locations.`); if (!ok) return;
    await toast.promise(supabase.from('part_master').delete().eq('id', id), {
      loading: 'Deleting…', success: 'Deleted', error: (e) => e?.message || 'Delete failed'
    });
    setEditing(false); fetchAll();
  };

  /* locations handlers */
  const addLocRow = () => setLocRows((prev) => prev.concat([{
    id: null, plant_id: 'Plant1', plant_uid: null, bin_code: '', min_qty: 0, max_qty: 0, qty_on_hand: 0, reorder_point: 0, supplier_name: '', lead_time_days: ''
  }]));
  const updateLocRow = (idx, key, val) => setLocRows((prev) => {
    const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'plant_id') next[idx].plant_uid = null; return next;
  });
  const deleteLocRow = async (idx) => {
    const row = locRows[idx];
    if (row.id) {
      const ok = confirm('Delete this location row?'); if (!ok) return;
      const { error } = await supabase.from('part_location').delete().eq('id', row.id);
      if (error) { toast.error(error.message); return; }
    }
    setLocRows((prev) => prev.filter((_, i) => i !== idx));
  };

  /* label payload enrichment — keep data clean */
  const getLocMapForPlant = async (plantId = 'Plant1') => {
    const puid = await resolvePlantUid(plantId); if (!puid) return {};
    const l = await supabase.from('part_location')
      .select('part_uid,bin_code,qty_on_hand,reorder_point,min_qty,max_qty,supplier_name,lead_time_days')
      .eq('plant_uid', puid);
    if (l.error) return {};
    const m = {}; (l.data || []).forEach((r) => {
      m[r.part_uid] = {
        bin_code: r.bin_code, qty_on_hand: r.qty_on_hand,
        reorder_point: r.reorder_point, min_qty: r.min_qty, max_qty: r.max_qty,
        supplier_name: r.supplier_name, lead_time_days: r.lead_time_days
      };
    }); return m;
  };
  const addPrintFields = (rows, locMap) =>
    rows.map((r) => ({
      ...r,
      plant_id: 'Plant1',
      // keep data clean; use '-' only in HTML text
      uom_code: uomCodeById[r.uom_uid] || null,
      bin_code: locMap[r.id]?.bin_code ?? null,
      qty_on_hand: locMap[r.id]?.qty_on_hand ?? null,
      reorder_point: locMap[r.id]?.reorder_point ?? null,
      min_qty: locMap[r.id]?.min_qty ?? null,
      max_qty: locMap[r.id]?.max_qty ?? null,
      supplier_name: locMap[r.id]?.supplier_name ?? null,
      lead_time_days: locMap[r.id]?.lead_time_days ?? null
    }));

  /* Printing */
  const printPartLabelsPreview = async (rows, { w = 50, h = 38, cols = 3 } = {}) => {
    if (!rows?.length) { toast.error('No rows to print'); return; }
    const locMap = await getLocMapForPlant('Plant1');
    const items = addPrintFields(rows, locMap);
    const logoURL = await getLogoDataURL(logo);
    const qrImgs = await Promise.all(items.map((it) =>
      makeQR(JSON.stringify({
        type: 'part',
        part_uid: it.id,
        part_code: it.part_code,
        plant_id: it.plant_id || 'Plant1',
        bin_code: it.bin_code || null,
        uom: it.uom_code || null,
      }))
    ));
    const grid = items.map((it, i) => `
      <div class="card">
        <div class="hdr">${logoURL ? `<img src="${logoURL}" alt="logo"/>` : ''}<div class="title">${(it.part_name || '').replace(/</g, '&lt;')}</div></div>
        <div class="sub">ID: ${(it.part_code || '').replace(/</g, '&lt;')}</div>
        <div class="kv">UOM: ${(it.uom_code || '-')} • Bin: ${(it.bin_code || '-')}</div>
        <div class="kv">QOH: ${(it.qty_on_hand ?? '-')} • Reorder: ${(it.reorder_point ?? '-')}</div>
        <div class="qr"><img src="${qrImgs[i]}" alt="QR"/><div class="cap">QR • ${(String(it.id || it.part_code || '').slice(0,4) + '…' + String(it.id || it.part_code || '').slice(-4))}</div></div>
      </div>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Part Labels</title>
      <style>
        @page{margin:8mm} body{font-family:Arial,Helvetica,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:4mm}
        .card{width:${w}mm;height:${h}mm;border:1px solid #cbd5e1;border-radius:6px;padding:3mm;display:flex;flex-direction:column;justify-content:space-between}
        .hdr{display:flex;gap:6px;align-items:center} .hdr img{height:10mm} .title{font-weight:700;font-size:12px}
        .sub{font-size:10px;color:#374151;margin-top:2px}
        .kv{font-size:10px;color:#111}
        .qr{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .qr img{max-height:16mm;max-width:100%} .cap{font-size:10px;color:#6b7280;margin-top:2px}
      </style></head><body><div class="grid">${grid}</div></body></html>`;
    printHTMLViaIframe(html);
    toast.success('Opened label preview');
  };
  const printBinLabelsPreview = async (plant_id = 'Plant1', { w = 50, h = 38, cols = 3 } = {}) => {
    const p = await supabase.from('plant_master').select('id').ilike('plant_id', plant_id).maybeSingle();
    if (p.error || !p.data) { toast.error('Plant not found'); return; }
    const r = await supabase.from('part_location').select('bin_code').eq('plant_uid', p.data.id).not('bin_code', 'is', null);
    if (r.error) { toast.error(r.error.message); return; }
    const bins = Array.from(new Set((r.data || []).map((x) => x.bin_code).filter(Boolean)));
    if (!bins.length) { toast.error('No bins to print'); return; }
    const logoURL = await getLogoDataURL(logo);
    const qrImgs = await Promise.all(bins.map((bin) =>
      makeQR(JSON.stringify({ type: 'bin', plant_id, bin_code: bin }))
    ));
    const grid = bins.map((bin, i) => `
      <div class="card">
        <div class="hdr">${logoURL ? `<img src="${logoURL}" alt="logo"/>` : ''}<div class="title">DigitizerX — ${plant_id}</div></div>
        <div class="sub">Bin: ${bin}</div>
        <div class="qr"><img src="${qrImgs[i]}" alt="QR"/><div class="cap">QR • ${(bin.length>8 ? bin.slice(0,4)+'…'+bin.slice(-4) : bin)}</div></div>
      </div>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Bin Labels</title>
      <style>
        @page{margin:8mm} body{font-family:Arial,Helvetica,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:4mm}
        .card{width:${w}mm;height:${h}mm;border:1px solid #cbd5e1;border-radius:6px;padding:3mm;display:flex;flex-direction:column;justify-content:space-between}
        .hdr{display:flex;gap:6px;align-items:center} .hdr img{height:10mm} .title{font-weight:700;font-size:12px}
        .sub{font-size:10px;color:#374151;margin-top:2px}
        .qr{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .qr img{max-height:18mm;max-width:100%} .cap{font-size:10px;color:#6b7280;margin-top:2px}
      </style></head><body><div class="grid">${grid}</div></body></html>`;
    printHTMLViaIframe(html);
    toast.success('Opened label preview');
  };
  const printSingleBinLabel = async (plant_id = 'Plant1', bin) => {
    if (!bin) { toast.error('Enter a bin'); return; }
    const logoURL = await getLogoDataURL(logo);
    const qrImg = await makeQR(JSON.stringify({ type: 'bin', plant_id, bin_code: bin }));
    const w = 50, h = 38, cols = 1;
    const grid = `
      <div class="card">
        <div class="hdr">${logoURL ? `<img src="${logoURL}" alt="logo"/>` : ''}<div class="title">DigitizerX — ${plant_id}</div></div>
        <div class="sub">Bin: ${bin}</div>
        <div class="qr"><img src="${qrImg}" alt="QR"/><div class="cap">QR • ${(bin.length>8 ? bin.slice(0,4)+'…'+bin.slice(-4) : bin)}</div></div>
      </div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Bin Label</title>
      <style>
        @page{margin:8mm} body{font-family:Arial,Helvetica,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:4mm}
        .card{width:${w}mm;height:${h}mm;border:1px solid #cbd5e1;border-radius:6px;padding:3mm;display:flex;flex-direction:column;justify-content:space-between}
        .hdr{display:flex;gap:6px;align-items:center} .hdr img{height:10mm} .title{font-weight:700;font-size:12px}
        .sub{font-size:10px;color:#374151;margin-top:2px}
        .qr{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .qr img{max-height:18mm;max-width:100%} .cap{font-size:10px;color:#6b7280;margin-top:2px}
      </style></head><body><div class="grid">${grid}</div></body></html>`;
    printHTMLViaIframe(html);
    toast.success('Opened bin label');
  };

  /* QR payload parsing */
  const parseQR = (txt) => {
    try {
      const o = JSON.parse(txt);
      const type = o.type || o.t;
      if (type === 'part') {
        return {
          type: 'part',
          part_uid: o.part_uid || o.uid || null,
          part_code: o.part_code || o.code || null,
          plant_id: o.plant_id || o.plant || null,
          bin_code: o.bin_code || o.bin || null,
        };
      }
      if (type === 'bin') {
        return {
          type: 'bin',
          plant_id: o.plant_id || o.plant || 'Plant1',
          bin_code: o.bin_code || o.bin || '',
        };
      }
      return { type: 'unknown', raw: txt };
    } catch {
      if (txt.includes('|')) { const [p, b] = txt.split('|'); return { type: 'bin', plant_id: p, bin_code: b }; }
      if (/^BIN-/i.test(txt)) { return { type: 'bin', plant_id: 'Plant1', bin_code: txt }; }
      return { type: 'unknown', raw: txt };
    }
  };
  const onScanResult = (text) => {
    const payload = parseQR(text);
    if (scanTarget === 'part') {
      if (payload.type === 'part' && (payload.part_uid || payload.part_code)) {
        setTransfer((t) => ({ ...t, part_uid: payload.part_uid || t.part_uid, part_code: payload.part_code || t.part_code }));
        setEditing(true); setTab('transfer');
      } else { toast.error('Not a Part QR'); }
    } else if (scanTarget === 'destbin') {
      if (payload.type === 'bin' && payload.bin_code) {
        setTransfer((t) => ({ ...t, dst_bin: payload.bin_code, dst_plant_id: payload.plant_id || t.dst_plant_id || 'Plant1' }));
      } else { toast.error('Not a Bin QR'); }
    }
  };

  /* Transfer */
  const doBinTransfer = async () => {
    try {
      const t = transfer;
      if (!t.part_uid && !t.part_code) { toast.error('Scan/select a Part first'); return; }
      if (!t.part_uid && t.part_code) {
        const find = await supabase.from('part_master').select('id').eq('part_code', t.part_code).maybeSingle();
        if (find.data?.id) t.part_uid = find.data.id;
      }
      if (!t.part_uid) { toast.error('Unknown part'); return; }
      if (!t.src_bin || !t.dst_bin) { toast.error('Select source & destination bins'); return; }
      const qty = Number(t.qty || 0); if (!(qty > 0)) { toast.error('Qty must be > 0'); return; }

      try {
        const { error } = await supabase.rpc('bin_transfer', {
          p_part_uid: t.part_uid,
          p_src_plant_id: t.plant_id, p_src_bin: t.src_bin || null,
          p_dst_plant_id: t.dst_plant_id, p_dst_bin: t.dst_bin || null,
          p_qty: qty
        });
        if (error) throw error;
        toast.success('Transfer complete (RPC)');
      } catch {
        const srcPlantUid = await resolvePlantUid(t.plant_id || 'Plant1');
        const dstPlantUid = await resolvePlantUid(t.dst_plant_id || t.plant_id || 'Plant1');

        let qs = supabase.from('part_location').select('id,qty_on_hand')
          .eq('part_uid', t.part_uid).eq('plant_uid', srcPlantUid);
        qs = t.src_bin ? qs.eq('bin_code', t.src_bin) : qs.is('bin_code', null);
        const src = await qs.maybeSingle(); if (src.error || !src.data) throw new Error('Source location not found');
        const srcQty = Number(src.data.qty_on_hand || 0); if (srcQty < qty) throw new Error(`Insufficient stock at source. QOH=${srcQty}`);

        let qd = supabase.from('part_location').select('id,qty_on_hand')
          .eq('part_uid', t.part_uid).eq('plant_uid', dstPlantUid);
        qd = t.dst_bin ? qd.eq('bin_code', t.dst_bin) : qd.is('bin_code', null);
        const dst = await qd.maybeSingle(); let dstId = dst.data?.id || null; let dstQty = Number(dst.data?.qty_on_hand || 0);
        if (!dstId) {
          const ins = await supabase.from('part_location').insert([{
            part_uid: t.part_uid, plant_uid: dstPlantUid, bin_code: t.dst_bin || null,
            min_qty: 0, max_qty: 0, qty_on_hand: 0, reorder_point: 0
          }]).select('id').single();
          if (ins.error) throw ins.error; dstId = ins.data.id; dstQty = 0;
        }
        const e1 = await supabase.from('part_location').update({ qty_on_hand: srcQty - qty }).eq('id', src.data.id);
        if (e1.error) throw e1.error;
        const e2 = await supabase.from('part_location').update({ qty_on_hand: dstQty + qty }).eq('id', dstId);
        if (e2.error) throw e2.error;

        const { data: { user } } = await supabase.auth.getUser(); const uid = user?.id || null;
        const reason = `BIN_TRANSFER ${t.plant_id}/${t.src_bin || '-'} -> ${t.dst_plant_id}/${t.dst_bin || '-'}`;
        const tx = await supabase.from('part_txn').insert([
          { part_uid: t.part_uid, plant_uid: srcPlantUid, qty: -qty, reason, created_by: uid },
          { part_uid: t.part_uid, plant_uid: dstPlantUid, qty, reason, created_by: uid }
        ]);
        if (tx.error) throw tx.error;
        toast.success('Transfer complete');
      }
      setTransfer((prev) => ({ ...prev, qty: 0 }));
      await Promise.all([fetchAll(), loadQohTotals()]);
    } catch (e) { toast.error(e.message || 'Transfer failed'); }
  };

  /* selection */
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((prev) => {
    const nxt = new Set(prev); const ids = filtered.map((r) => r.id);
    const allSel = ids.every((id) => nxt.has(id));
    ids.forEach((id) => { if (allSel) nxt.delete(id); else nxt.add(id); });
    return nxt;
  });

  /* URL params → open edit / prefill, then clear only after action */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const part = searchParams.get('part') || searchParams.get('part_uid') || searchParams.get('part_id');
    const partCode = searchParams.get('partCode') || searchParams.get('part_code');
    const plant = searchParams.get('plant') || searchParams.get('plant_id');
    const bin = searchParams.get('bin') || searchParams.get('bin_code');
    let acted = false;
    (async () => {
      if (part || partCode) {
        let row = null;
        if (part) {
          // try as UUID; if no row, try as code fallback
          const q1 = await supabase.from('part_master').select('*').eq('id', part).maybeSingle();
          row = q1.data || null;
          if (!row) {
            const q2 = await supabase.from('part_master').select('*').ilike('part_code', part).maybeSingle();
            row = q2.data || null;
          }
        } else if (partCode) {
          const q3 = await supabase.from('part_master').select('*').ilike('part_code', partCode).maybeSingle();
          row = q3.data || null;
        }
        if (row) { openEdit(row); acted = true; }
        else if (part || partCode) { toast.error('Part not found'); }
      }
      if (plant && bin) {
        setSingleDefaults({ plant_id: plant, bin });
        setTransfer(t => ({ ...t, dst_plant_id: plant, dst_bin: bin }));
        acted = true;
      }
    })().finally(() => {
      if (acted) {
        const next = new URLSearchParams(searchParams);
        ['part', 'part_uid', 'part_id', 'partCode', 'part_code', 'plant', 'plant_id', 'bin', 'bin_code'].forEach(k => next.delete(k));
        setSearchParams(next, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  /* render */
  return (
    <div className="p-4">
      <Toaster position="top-right" />
      <DebugOverlayTamer />
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScanResult} />
      <SingleBinModal
        open={singleBinOpen}
        onClose={() => setSingleBinOpen(false)}
        onPrint={(plant, bin) => { setSingleBinOpen(false); printSingleBinLabel(plant, bin); }}
        defaults={singleDefaults}
      />

      {/* Title */}
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-blue-700 text-center flex items-center justify-center gap-2">
          <PackageSearch size={18} /> Inventory & Spare Parts
        </h1>
      </div>

      {/* Toolbar */}
      <div className="mb-3 border rounded">
        <div className="overflow-x-auto">
          <div className="flex items-center gap-2 whitespace-nowrap px-2 py-2">
            <div className="relative shrink-0">
              <Search size={14} className="absolute left-2 top-2.5 text-indigo-600" />
              <input
                className="border rounded pl-7 pr-2 py-1 text-sm"
                placeholder="Search by code or name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => fetchAll()} title="Reload lists" className="shrink-0">
              <RefreshCw size={16} className="mr-1" />Reload
            </Button>
            <label className="inline-flex items-center gap-1 cursor-pointer shrink-0" title="Import parts CSV">
              <Upload size={16} /> Import CSV
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCSV} disabled={busy} />
            </label>
            <Button variant="outline" onClick={downloadPartsTemplate} className="shrink-0">
              <Download size={16} className="mr-1" />Parts CSV
            </Button>
            <Button variant="outline" onClick={downloadDemoCSV} className="shrink-0">
              <Download size={16} className="mr-1" />Demo CSV
            </Button>
            <Button variant="outline" onClick={() => printPartLabelsPreview(filtered)} className="shrink-0">
              <Printer size={16} className="mr-1" />Preview Part Labels
            </Button>
            <Button variant="outline" onClick={() => printBinLabelsPreview('Plant1')} className="shrink-0">
              <Printer size={16} className="mr-1" />Preview Bin Labels
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSingleDefaults({ plant_id: 'Plant1', bin: '' }); setSingleBinOpen(true); }}
              className="shrink-0"
            >
              <Printer size={16} className="mr-1" />Bin Label
            </Button>
            <Button
              variant="outline"
              onClick={() => { setScanTarget('part'); setScanOpen(true); }}
              title="Scan Part"
              className="shrink-0"
            >
              <ScanLine size={16} className="mr-1" />Scan Part
            </Button>
            <Button
              variant="outline"
              onClick={() => { setScanTarget('destbin'); setScanOpen(true); }}
              title="Scan Bin"
              className="shrink-0"
            >
              <QrCode size={16} className="mr-1" />Scan Bin
            </Button>
            <div className="ml-auto" />
            <Button onClick={openNew} className="shrink-0"><Plus size={16} className="mr-1" />New Part</Button>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        {/* Parts with Total QOH */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Parts</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 w-10 text-left"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Total QOH</th>
                <th className="p-2 text-left">Active</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                    />
                  </td>
                  <td className="p-2">{r.part_code}</td>
                  <td className="p-2">{r.part_name}</td>
                  <td className="p-2">{qohTotals[r.id] ?? 0}</td>
                  <td className="p-2">{r.active ? 'Yes' : 'No'}</td>
                  <td className="p-2 flex gap-1">
                    <Button variant="ghost" onClick={() => openEdit(r)} title="Edit"><Edit3 size={16} /></Button>
                    <Button variant="ghost" onClick={() => printPartLabelsPreview([r])} title="Print label"><Printer size={16} /></Button>
                    <Button variant="ghost" onClick={() => deletePart(r.id, r.part_code)} title="Delete"><Trash2 size={16} /></Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (<tr><td className="p-2 text-gray-500" colSpan={6}>No parts.</td></tr>)}
            </tbody>
          </table>
        </div>

        {/* Low / Reorder */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Low / Reorder</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Part</th>
                <th className="p-2 text-left">Plant</th>
                <th className="p-2 text-left">Bin</th>
                <th className="p-2 text-left">QOH</th>
                <th className="p-2 text-left">Reorder</th>
              </tr>
            </thead>
            <tbody>
              {low.map((r) => (
                <tr key={r.part_location_uid} className="border-t">
                  <td className="p-2">{r.part_code} — {r.part_name}</td>
                  <td className="p-2">{plantIdByUid[r.plant_uid] || r.plant_uid}</td>
                  <td className="p-2">
                    {r.bin_code || '-'}
                    {r.bin_code ? (
                      <Button
                        variant="ghost"
                        title="Print this bin label"
                        onClick={() => { setSingleDefaults({ plant_id: plantIdByUid[r.plant_uid] || 'Plant1', bin: r.bin_code }); setSingleBinOpen(true); }}
                      ><Printer size={16} /></Button>
                    ) : null}
                  </td>
                  <td className="p-2">{r.qty_on_hand}</td>
                  <td className="p-2">{r.reorder_point}</td>
                </tr>
              ))}
              {!low.length && (<tr><td className="p-2 text-gray-500" colSpan={5}>No low stock.</td></tr>)}
            </tbody>
          </table>

          {/* Quick transfer */}
          <div className="p-3 border-t text-sm">
            <div className="font-semibold mb-2">Quick Bin Transfer</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="border rounded p-2 w-40"
                placeholder="Part Code or UID"
                value={transfer.part_code}
                onChange={(e) => setTransfer({ ...transfer, part_code: e.target.value })}
              />
              <select
                className="border rounded p-2"
                value={transfer.plant_id}
                onChange={(e) => setTransfer({ ...transfer, plant_id: e.target.value })}
              >
                {plants.map((p) => (<option key={p.id} value={p.plant_id}>{p.plant_id}</option>))}
              </select>
              <input
                className="border rounded p-2 w-28"
                placeholder="From Bin"
                value={transfer.src_bin}
                onChange={(e) => setTransfer({ ...transfer, src_bin: e.target.value })}
              />
              <span className="opacity-70"><MoveRight size={16} /></span>
              <select
                className="border rounded p-2"
                value={transfer.dst_plant_id}
                onChange={(e) => setTransfer({ ...transfer, dst_plant_id: e.target.value })}
              >
                {plants.map((p) => (<option key={p.id} value={p.plant_id}>{p.plant_id}</option>))}
              </select>
              <input
                className="border rounded p-2 w-28"
                placeholder="To Bin"
                value={transfer.dst_bin}
                onChange={(e) => setTransfer({ ...transfer, dst_bin: e.target.value })}
              />
              <input
                className="border rounded p-2 w-24"
                type="number"
                step="any"
                placeholder="Qty"
                value={transfer.qty}
                onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })}
              />
              <Button variant="outline" onClick={() => { setScanTarget('part'); setScanOpen(true); }} title="Scan Part">
                <ScanLine size={16} className="mr-1" />Part
              </Button>
              <Button variant="outline" onClick={() => { setScanTarget('destbin'); setScanOpen(true); }} title="Scan Bin">
                <QrCode size={16} className="mr-1" />Bin
              </Button>
              <Button onClick={doBinTransfer}><MoveRight size={16} className="mr-1" />Transfer</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Editor Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-40">
          <div className="bg-white rounded-xl p-4 w-full max-w-5xl shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{form.id ? 'Edit' : 'New'} Part</h3>
              <div className="flex gap-2">
                {form.id ? (<Button onClick={() => deletePart(form.id, form.part_code)}><Trash2 size={16} className="mr-1" />Delete</Button>) : null}
                <Button variant="outline" onClick={() => setEditing(false)}>Close</Button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 border-b">
              {['details', 'locations', 'transfer'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-blue-600 font-semibold' : 'text-gray-600'}`}
                >
                  {t === 'details' ? 'Details' : t === 'locations' ? 'Locations' : 'Bin Transfer'}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <input
                  className="border p-2 rounded"
                  placeholder="Part Code *"
                  value={form.part_code}
                  onChange={(e) => setForm({ ...form, part_code: e.target.value })}
                />
                <input
                  className="border p-2 rounded"
                  placeholder="Part Name *"
                  value={form.part_name}
                  onChange={(e) => setForm({ ...form, part_name: e.target.value })}
                />
                <input
                  className="border p-2 rounded col-span-2"
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="flex gap-2">
                  <select
                    className="border p-2 rounded w-full"
                    value={form.uom_code}
                    onChange={(e) => setForm({ ...form, uom_code: e.target.value })}
                    disabled={uomLoading}
                  >
                    <option value="">{uomLoading ? 'Loading UOMs…' : 'Select UOM…'}</option>
                    {uomOptions.sort((a, b) => a.code.localeCompare(b.code)).map((u) => (
                      <option key={u.id} value={u.code}>{u.code} — {u.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  /> Active
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.is_quarantine}
                    onChange={(e) => setForm({ ...form, is_quarantine: e.target.checked })}
                  /> Quarantine
                </label>
                <div className="col-span-2 mt-2 text-right">
                  <Button onClick={savePartAndLocations}><Save size={16} className="mr-1" />Save</Button>
                </div>
              </div>
            )}

            {tab === 'locations' && (
              <div className="mt-4">
                <div className="mb-2 flex justify-between">
                  <div className="font-semibold">Locations</div>
                  <Button onClick={addLocRow}><Plus size={16} className="mr-1" />Add Row</Button>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2">Plant</th><th className="p-2">Bin</th><th className="p-2">Min</th><th className="p-2">Max</th><th className="p-2">Reorder</th><th className="p-2">QOH</th><th className="p-2">Supplier</th><th className="p-2">Lead(d)</th><th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locRows.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">
                            <select
                              className="border rounded p-1"
                              value={row.plant_id}
                              onChange={(e) => updateLocRow(idx, 'plant_id', e.target.value)}
                            >
                              {plants.map((p) => (<option key={p.id} value={p.plant_id}>{p.plant_id}</option>))}
                            </select>
                          </td>
                          <td className="p-2"><input className="border rounded p-1 w-28" value={row.bin_code} onChange={(e) => updateLocRow(idx, 'bin_code', e.target.value)} placeholder="BIN-A1" /></td>
                          <td className="p-2"><input className="border rounded p-1 w-20" type="number" step="any" value={row.min_qty} onChange={(e) => updateLocRow(idx, 'min_qty', e.target.value)} /></td>
                          <td className="p-2"><input className="border rounded p-1 w-20" type="number" step="any" value={row.max_qty} onChange={(e) => updateLocRow(idx, 'max_qty', e.target.value)} /></td>
                          <td className="p-2"><input className="border rounded p-1 w-24" type="number" step="any" value={row.reorder_point} onChange={(e) => updateLocRow(idx, 'reorder_point', e.target.value)} /></td>
                          <td className="p-2"><input className="border rounded p-1 w-24" type="number" step="any" value={row.qty_on_hand} onChange={(e) => updateLocRow(idx, 'qty_on_hand', e.target.value)} /></td>
                          <td className="p-2"><input className="border rounded p-1 w-36" value={row.supplier_name} onChange={(e) => updateLocRow(idx, 'supplier_name', e.target.value)} /></td>
                          <td className="p-2"><input className="border rounded p-1 w-20" type="number" value={row.lead_time_days} onChange={(e) => updateLocRow(idx, 'lead_time_days', e.target.value)} /></td>
                          <td className="p-2"><Button variant="ghost" onClick={() => deleteLocRow(idx)} title="Remove"><Trash2 size={16} /></Button></td>
                        </tr>
                      ))}
                      {!locRows.length && (<tr><td className="p-2 text-gray-500" colSpan={9}>No locations. Add a row.</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-right"><Button onClick={savePartAndLocations}><Save size={16} className="mr-1" />Save Locations</Button></div>
              </div>
            )}

            {tab === 'transfer' && (
              <div className="mt-4 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <label className="w-28">Part</label>
                  <input className="border rounded p-2 flex-1" readOnly value={transfer.part_code || transfer.part_uid || ''} />
                  <Button onClick={() => { setScanTarget('part'); setScanOpen(true); }}><ScanLine size={16} className="mr-1" />Scan Part</Button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-28">From Plant</label>
                  <select
                    className="border rounded p-2"
                    value={transfer.plant_id}
                    onChange={(e) => setTransfer({ ...transfer, plant_id: e.target.value })}
                  >
                    {plants.map((p) => (<option key={p.id} value={p.plant_id}>{p.plant_id}</option>))}
                  </select>
                  <label className="w-16 text-right">Bin</label>
                  <input
                    className="border rounded p-2 flex-1"
                    value={transfer.src_bin}
                    onChange={(e) => setTransfer({ ...transfer, src_bin: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-28">To Plant</label>
                  <select
                    className="border rounded p-2"
                    value={transfer.dst_plant_id}
                    onChange={(e) => setTransfer({ ...transfer, dst_plant_id: e.target.value })}
                  >
                    {plants.map((p) => (<option key={p.id} value={p.plant_id}>{p.plant_id}</option>))}
                  </select>
                  <label className="w-16 text-right">Bin</label>
                  <input
                    className="border rounded p-2 flex-1"
                    value={transfer.dst_bin}
                    onChange={(e) => setTransfer({ ...transfer, dst_bin: e.target.value })}
                  />
                  <Button onClick={() => { setScanTarget('destbin'); setScanOpen(true); }}><QrCode size={16} className="mr-1" />Scan Bin</Button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-28">Qty</label>
                  <input
                    className="border rounded p-2 w-32"
                    type="number"
                    step="any"
                    value={transfer.qty}
                    onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })}
                  />
                  <Button onClick={doBinTransfer}><MoveRight size={16} className="mr-1" />Transfer</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InventorySparePartsManagement;
