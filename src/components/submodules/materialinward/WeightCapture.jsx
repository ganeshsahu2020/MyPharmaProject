// src/components/submodules/materialinward/WeightCapture.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import { useUOM } from '../../../contexts/UOMContext';
import toast from 'react-hot-toast';
import Button from '../../ui/button';
import { Card } from '../../ui/card';
import Input from '../../ui/Input';
import Label from '../../ui/Label';
import { Skeleton } from '../../ui/skeleton';
import UOMDropdown from '../../common/UOMDropdown';
import {
  ClipboardList,
  PackageSearch,
  Search,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Send,
  FileText,
  Plus,
  Trash2,
  Info,
  Scale,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Bandage,
  Eye,
  ArrowLeft,
  PencilLine,
  Download,
  Printer,
  Camera,
  X,
  Package as PackageIcon,
  Boxes,
  Hash as HashIcon,
} from 'lucide-react';

/* Item API helper (for item lookup by material code) */
import { getItemByMaterial } from '../../../api/items';

/* Persist weight capture via API */
import { saveWeightCapture } from '../../../api/weightCapture';

/* --- defer plain toasts until after paint (strict-mode safe) --- */
const toastAfterPaint = {
  success: (m) => requestAnimationFrame(() => toast.success(m)),
  error: (m) => requestAnimationFrame(() => toast.error(m)),
  promise: (p, msgs) => toast.promise(p, msgs),
};

/* ---------------- utils ---------------- */
const DEC_DIGITS = 3;
const cls = (...a) => a.filter(Boolean).join(' ');
const nowISO = () => new Date().toISOString();
const todayISO = () =>
  new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
const fmtDate = (d) => {
  try {
    if (!d) return '';
    const x = new Date(d);
    if (isNaN(x)) return d;
    return x.toLocaleDateString();
  } catch {
    return d || '';
  }
};
const addYearsDays = (d, years = 0, days = 0) => {
  const x = new Date(d);
  const yy = Number(years) || 0;
  const dd = Number(days) || 0;
  if (yy) x.setFullYear(x.getFullYear() + yy);
  if (dd) x.setDate(x.getDate() + dd);
  return x.toISOString().slice(0, 10);
};
const cryptoRandom = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
const STR_IS_DAMAGE = (s = '') =>
  /damag|broken|leak|tear|dent|spoil|defect/i.test(String(s || ''));
const roundTo = (val, digits = DEC_DIGITS) => {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return '';
  const p = 10 ** (digits || 0);
  return (Math.round(n * p) / p).toFixed(digits || 0);
};
const csvEscape = (s) =>
  `"${String(s ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
const clean = (s) => String(s ?? '').trim().replace(/^\(|\)$/g, '');
const parseTypable = (s) =>
  s === '' || s == null ? '' : Number.isFinite(Number(s)) ? Number(s) : '';

/* ✅ Count UOMs (no balance required) */
const COUNTABLE_UOMS = [
  'NOS',
  'NO',
  'NUMBERS',
  'NUMBER',
  'CT',
  'PCS',
  'PC',
  'PIECE',
  'PIECES',
  'EA',
  'EACH',
  'EACHES',
  'UNIT',
  'UNITS',
  'PACK',
  'PACKS',
  'PK',
  'PKG',
  'PACKET',
  'PACKETS',
  'BOX',
  'BOXES',
  'CARTON',
  'CARTONS',
  'CASE',
  'CASES',
  'BAG',
  'BAGS',
  'BOTTLE',
  'JAR',
  'SET',
  'SETS',
  'SACHET',
  'POUCH',
  'VIAL',
  'AMP',
  'CAP',
  'TAB',
  'TABLET',
  'TUBE',
  'CAN',
  'JAR',
  'JAR',
];
const isCountableUOM = (u) =>
  COUNTABLE_UOMS.includes(String(u || '').toUpperCase().trim());

/* ✅ Weight UOMs (requires balance) */
const WEIGHT_UOMS = [
  'MCG',
  'µG',
  'UG',
  'MG',
  'G',
  'GM',
  'GMS',
  'GRAM',
  'GRAMS',
  'KG',
  'KGS',
  'KILOGRAM',
  'KILOGRAMS',
  'L',
  'ML',
  'LITRE',
  'LITER',
];
const isWeightUOM = (u) =>
  WEIGHT_UOMS.includes(String(u || '').toUpperCase().trim());

/* ---------- Fallback pretty-print ---------- */
const uomPretty = (u) => {
  const s = String(u || '').trim().toUpperCase();
  const map = {
    KG: 'kg',
    KGS: 'kg',
    KILOGRAM: 'kg',
    KILOGRAMS: 'kg',
    G: 'g',
    GM: 'g',
    GMS: 'g',
    GRAM: 'g',
    GRAMS: 'g',
    MG: 'mg',
    MCG: 'µg',
    UG: 'µg',
    L: 'L',
    LT: 'L',
    LTR: 'L',
    LTRS: 'L',
    LITRE: 'L',
    LITER: 'L',
    LITERS: 'L',
    LITRES: 'L',
    ML: 'mL',
    NOS: 'pcs',
    NO: 'pcs',
    NUMBERS: 'pcs',
    NUMBER: 'pcs',
    CT: 'pcs',
    PC: 'pcs',
    PCS: 'pcs',
    EA: 'each',
    EACH: 'each',
    EACHES: 'each',
    UNIT: 'unit',
    UNITS: 'units',
    BAG: 'bag',
    BAGS: 'bags',
    BOX: 'box',
    BOXES: 'boxes',
    BOTTLE: 'bottle',
    JAR: 'jar',
    PACK: 'pack',
    PACKS: 'packs',
    PK: 'pack',
    PKG: 'pack',
    PACKET: 'pack',
    PACKETS: 'packs',
    SACHET: 'sachet',
    POUCH: 'pouch',
    VIAL: 'vial',
    CAP: 'cap',
    TAB: 'tab',
    TABLET: 'tablet',
    TUBE: 'tube',
    CAN: 'can',
  };
  return map[s] || s || '-';
};

/* ---------------- UOM context helpers (no HTTP) ---------------- */
const buildUomIndex = (uoms = []) => {
  const byCode = {},
    bySym = {},
    byId = {};
  uoms.forEach((r) => {
    const code = (r.uom_code || '').toString().trim();
    const sym = (r.uom || r.uom_name || '').toString().trim();
    const id = (r.id || '').toString().trim();
    if (code) byCode[code.toUpperCase()] = r;
    if (sym) bySym[sym.toUpperCase()] = r;
    if (id) byId[id] = r;
  });
  return { byCode, bySym, byId };
};
const displayFromUom = (val, index) => {
  const k = String(val || '').trim();
  if (!k) return '';
  const up = k.toUpperCase();
  const hit = index.byCode[up] || index.bySym[up] || index.byId[k];
  if (hit) {
    return (
      (hit.uom || hit.uom_name || hit.uom_code || '').toString().trim() ||
      uomPretty(k)
    );
  }
  return uomPretty(k);
};
const countModeFromUom = (val, index) => {
  const disp = displayFromUom(val, index);
  const up = String(disp || '').toUpperCase();
  if (isWeightUOM(up)) return false;
  if (isCountableUOM(up)) return true;
  if (
    /PACK|BOX|BAG|BOTTLE|VIAL|EACH|EA|UNIT|SET|SACHET|POUCH|TAB|CAP|TUBE|CAN|PIECE|PCS/.test(
      up
    )
  )
    return true;
  return false;
};
const userInfoSafe = (u) => ({
  user_id: u?.id || u?.user?.id || null,
  user_email: u?.email || u?.user?.email || null,
  user_name:
    u?.user_metadata?.full_name ||
    u?.user_metadata?.name ||
    u?.full_name ||
    u?.name ||
    null,
});

/* ---------------- small UI bits ---------------- */
const IconInput = React.forwardRef(
  ({ icon: Icon, className = '', ...props }, ref) => (
    <div className="relative min-w-0">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <Icon className="h-4 w-4 text-blue-600/90" />
      </div>
      <Input
        ref={ref}
        {...props}
        className={cls(
          'h-11 w-full pl-11 placeholder:text-slate-400',
          'rounded-md',
          className
        )}
      />
    </div>
  )
);
IconInput.displayName = 'IconInput';

const IconSelect = React.forwardRef(
  ({ icon: Icon, className = '', children, ...props }, ref) => (
    <div className="relative min-w-0">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <Icon className="h-4 w-4 text-blue-600/90" />
      </div>
      <select
        ref={ref}
        {...props}
        className={cls(
          'h-11 w-full pl-11 pr-10 appearance-none border rounded-md bg-white',
          'focus:outline-none focus:ring-2 focus:ring-blue-200',
          className
        )}
      >
        {children}
      </select>
    </div>
  )
);
IconSelect.displayName = 'IconSelect';

/* ---------------- component ---------------- */
const WeightCapture = () => {
  const { user } = useAuth() || {};
  const { uoms = [], loading: uomLoading } = useUOM() || {};
  const uomIndex = useMemo(() => buildUomIndex(uoms), [uoms]);

  const [loading, setLoading] = useState(false);

  // Source (Material Inspection)
  const [poQuery, setPoQuery] = useState('');
  const [miRow, setMiRow] = useState(null);
  const [poSelected, setPoSelected] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoiceSelected, setInvoiceSelected] = useState('');

  // Materials under the PO+Invoice
  const [materials, setMaterials] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Balance (global)
  const [balances, setBalances] = useState([]);
  const [balanceScan, setBalanceScan] = useState('');
  const [balanceCode, setBalanceCode] = useState('');
  const [balanceRow, setBalanceRow] = useState(null);
  const [balanceOK, setBalanceOK] = useState(null);
  const [zeroed, setZeroed] = useState(false);

  // UI
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [showBalances, setShowBalances] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // Preview search/filter
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewFilter, setPreviewFilter] = useState('');

  // Compact tablet keypad
  const [keypad, setKeypad] = useState(false);
  const [qaActiveField, setQaActiveField] = useState(null); // 'net'|'gross'|'tare'|'container_no'|'remarks'

  // refs
  const qaRefs = useRef({});
  const cellRefs = useRef({});
  const previewRef = useRef(null);

  // 🔒 in-flight guard for presets (one fetch per material_code at a time)
  const presetsInflightRef = useRef(new Set());

  // Load balances
  useEffect(() => {
    let alive = true;
    const loadBalances = async () => {
      try {
        let rs = await supabase
          .from('vw_weighing_balance_master')
          .select('*')
          .order('balance_id', { ascending: true });
        if (rs.error) {
          rs = await supabase
            .from('weighing_balance_master')
            .select(
              'id,balance_id,description,model,capacity,status,calibration_due,calibration_due_date,calibration_valid_till,valid_till,next_calibration_due,least_count_digits,area_uid'
            )
            .order('balance_id', { ascending: true });
        }
        if (!rs.error && alive) setBalances(Array.isArray(rs.data) ? rs.data : []);
      } catch {
        /* non-blocking */
      }
    };
    loadBalances();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- helpers ---------- */
  const sumNetByType = (arr, kind = 'GOOD') =>
    (Array.isArray(arr) ? arr : [])
      .filter(
        (x) => String(x.type || 'GOOD').toUpperCase() === kind.toUpperCase()
      )
      .reduce((acc, x) => acc + (Number(x.net || 0) || 0), 0);

  const enhanceMaterialForWeigh = (m) => {
    const mfgBatch =
      m.manufacturer_batch_no && m.manufacturer_batch_no !== 'NA'
        ? m.manufacturer_batch_no
        : m.vendor_batch_no && m.vendor_batch_no !== 'NA'
        ? m.vendor_batch_no
        : '';
    const weights = Array.isArray(m.weight_captures)
      ? m.weight_captures.map((x) => ({ type: 'GOOD', ...x }))
      : [];
    const good = sumNetByType(weights, 'GOOD');
    const damage = sumNetByType(weights, 'DAMAGE');
    const codeOrSym = m.weight_uom || m.uom || '';
    return {
      ...m,
      mfg_batch_no: m.mfg_batch_no || mfgBatch,
      mfg_date: m.mfg_date || todayISO(),
      exp_date: m.exp_date || '',
      retest_date: m.retest_date || '',
      weight_uom: m.weight_uom || m.uom || '',
      uom_disp: displayFromUom(m.uom, uomIndex),
      weight_uom_disp: displayFromUom(m.weight_uom || m.uom, uomIndex),
      weight_captures: weights,
      weigh_good_total: good,
      weigh_damage_total: damage,
      weigh_net_total: good + damage,
      weigh_status: m.weigh_status || 'Draft',
      _presets: null,
      count_mode: countModeFromUom(codeOrSym, uomIndex),
      material_remarks: m.material_remarks || '',
      __qa: {
        type: 'GOOD',
        gross: '',
        tare: '',
        net: '',
        container_no: String(weights.length + 1),
        remarks: '',
        photo: '',
        pack_count: '',
        qty_each: '',
      },
    };
  };

  const decorateWithUOM = useCallback(
    (rows = []) => {
      return (rows || []).map((r) => enhanceMaterialForWeigh(r));
    },
    [uomIndex]
  );

  const fetchByPO = useCallback(
    async (poNoRaw) => {
      const poNo = clean(poNoRaw);
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('material_inspections')
          .select('*')
          .contains('po_list', [poNo])
          .order('updated_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          toastAfterPaint.error('No Material Inspection found for this PO');
          setMiRow(null);
          setInvoiceOptions([]);
          setInvoiceSelected('');
          setMaterials([]);
          return;
        }
        setMiRow(row);
        const invs = (Array.isArray(row.materials) ? row.materials : [])
          .filter((m) => clean(m.po_no) === poNo)
          .map((m) => ({
            invoice_no: clean(m.invoice_no) || '',
            invoice_date: m.invoice_date || '',
          }));
        const uniqInv = Array.from(
          new Map(invs.map((x) => [x.invoice_no || '-', x])).values()
        )
          .filter((x) => !!x.invoice_no);
        setInvoiceOptions(uniqInv);
        const firstInvoice = uniqInv[0]?.invoice_no || '';
        setInvoiceSelected(firstInvoice);
        const base = (Array.isArray(row.materials) ? row.materials : []).filter(
          (m) =>
            clean(m.po_no) === poNo &&
            (!firstInvoice || clean(m.invoice_no) === firstInvoice)
        );
        setMaterials(decorateWithUOM(base));
        setPoSelected(poNo);
        setSelectedIndex(0);
        setShowPreview(false);
        setPreviewQuery('');
        setPreviewFilter('');
      } catch (e) {
        console.error(e);
        toastAfterPaint.error('Unable to load Material Inspection');
        setMiRow(null);
        setInvoiceOptions([]);
        setInvoiceSelected('');
        setMaterials([]);
      } finally {
        setLoading(false);
      }
    },
    [decorateWithUOM]
  );

  // Filter materials when invoice changes
  useEffect(() => {
    const run = async () => {
      if (!miRow || !poSelected) return;
      const inv = clean(invoiceSelected);
      const po = clean(poSelected);
      const base = (Array.isArray(miRow.materials) ? miRow.materials : []).filter(
        (m) => clean(m.po_no) === po && (inv ? clean(m.invoice_no) === inv : true)
      );
      setMaterials(decorateWithUOM(base));
      setSelectedIndex(0);
      setShowPreview(false);
      setPreviewQuery('');
      setPreviewFilter('');
    };
    run();
  }, [invoiceSelected, miRow, poSelected, decorateWithUOM]);

  // If UOMs finish loading later, refresh displays/count_mode
  useEffect(() => {
    if (uomLoading) return;
    setMaterials((prev) =>
      prev.map((m) => ({
        ...m,
        uom_disp: displayFromUom(m.uom, uomIndex),
        weight_uom_disp: displayFromUom(m.weight_uom || m.uom, uomIndex),
        count_mode: countModeFromUom(m.weight_uom || m.uom, uomIndex),
      }))
    );
  }, [uomLoading, uomIndex]);

  /* ---------- Load presets + item mapping (re-entrant safe + in-flight guard) ---------- */
  const loadPresets = useCallback(
    async (idx) => {
      const snap = materials[idx];
      if (!snap) return;

      const code = snap.material_code || '';
      const p = snap._presets;

      // Bail if already loading/loaded or already in-flight for this code
      if ((p && (p.loading || p.loaded)) || presetsInflightRef.current.has(code))
        return;

      presetsInflightRef.current.add(code);

      // Mark loading once
      setMaterials((prev) => {
        const n = [...prev];
        if (!n[idx]) return prev;
        const cur = n[idx];
        if (cur._presets && (cur._presets.loading || cur._presets.loaded))
          return prev;
        n[idx] = { ...cur, _presets: { loading: true } };
        return n;
      });

      try {
        const { data: mat, error: matErr } = await supabase
          .from('materials')
          .select(
            'code,uom,expiry_years,expiry_days,retest_years,retest_days'
          )
          .eq('code', code)
          .maybeSingle();

        const { data: itemData, error: itemErr } = await getItemByMaterial(code);
        const itemRow = itemErr
          ? null
          : (Array.isArray(itemData) ? itemData[0] : itemData) || null;

        setMaterials((prev) => {
          const n = [...prev];
          const row = n[idx];
          if (!row) return prev;

          if (itemRow) {
            row.item_id = row.item_id || itemRow.id || null;
            row.item_code = row.item_code || itemRow.item_code || null;
          }

          if (matErr || !mat) {
            row._presets = { loaded: true, ok: false };
          } else {
            row._presets = { loaded: true, ok: true, ...mat };
            const mfg = row.mfg_date || todayISO();

            if (!row.exp_date)
              row.exp_date = addYearsDays(
                mfg,
                Number(mat.expiry_years || 0),
                Number(mat.expiry_days || 0)
              );
            if (!row.retest_date)
              row.retest_date = addYearsDays(
                mfg,
                Number(mat.retest_years || 0),
                Number(mat.retest_days || 0)
              );

            if (!row.weight_uom_code && (mat.uom || row.uom)) {
              const codeOrId = mat.uom || row.uom;
              row.weight_uom_code = codeOrId;
              row.weight_uom = codeOrId;
              row.weight_uom_disp = displayFromUom(codeOrId, uomIndex);
              row.count_mode = countModeFromUom(codeOrId, uomIndex);
            }
          }

          n[idx] = { ...row };
          return n;
        });
      } catch (e) {
        console.error(e);
        setMaterials((prev) => {
          const n = [...prev];
          const row = n[idx];
          if (!row) return prev;
          row._presets = { loaded: true, ok: false };
          n[idx] = { ...row };
          return n;
        });
      } finally {
        presetsInflightRef.current.delete(code);
      }
    },
    [materials, uomIndex]
  );

  // ⬇️ Trigger presets only when both materials & selectedIndex are stable
  useEffect(() => {
    const row = materials[selectedIndex];
    if (!row) return;
    if (!row._presets || row._presets.loading) loadPresets(selectedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, selectedIndex]);

  /* ---------- Balance: verify + calibration ---------- */
  const verifyBalance = useCallback(async (displayCodeRaw) => {
    const displayCode = clean(displayCodeRaw);
    if (!displayCode) return;
    try {
      let master = null;
      let q1 = await supabase
        .from('vw_weighing_balance_master')
        .select('*')
        .eq('balance_id', displayCode)
        .maybeSingle();
      if (!q1.error && q1.data) master = q1.data;
      if (!master) {
        const { data } = await supabase
          .from('weighing_balance_master')
          .select(
            'id,balance_id,description,model,capacity,status,calibration_due,calibration_due_date,calibration_valid_till,valid_till,next_calibration_due,least_count_digits'
          )
          .eq('balance_id', displayCode)
          .maybeSingle();
        master = data || null;
      }
      setBalanceRow(master);

      let verified = false;
      if (master?.id) {
        const { data: vId, error: eId } = await supabase
          .from('vw_daily_verification_log')
          .select('id')
          .eq('verification_status', 'verified')
          .eq('date', todayISO())
          .eq('balance_id', master.id)
          .limit(1);
        if (!eId && Array.isArray(vId) && vId.length) verified = true;
      }
      if (!verified) {
        const { data: vCode, error: eCode } = await supabase
          .from('vw_daily_verification_log')
          .select('id')
          .eq('verification_status', 'verified')
          .eq('date', todayISO())
          .eq('balance_code', displayCode)
          .limit(1);
        if (!eCode && Array.isArray(vCode) && vCode.length) verified = true;
      }

      let ok = verified;
      let reason = verified ? '' : 'Daily verification missing.';
      const due =
        master?.calibration_due ||
        master?.next_calibration_due ||
        master?.calibration_valid_till ||
        master?.valid_till ||
        master?.calibration_due_date ||
        null;
      if (ok && due) {
        const d = new Date(due);
        if (isFinite(d) && d < new Date()) {
          ok = false;
          reason = 'Calibration expired.';
        }
      }
      setBalanceOK({ ok, reason });
      if (!ok) toastAfterPaint.error(`Balance not ready: ${reason}`);
    } catch (e) {
      console.error(e);
      setBalanceOK({ ok: false, reason: 'Unable to verify balance.' });
      toastAfterPaint.error('Unable to verify balance.');
    }
  }, []);

  useEffect(() => {
    if (balanceScan) setBalanceCode(clean(balanceScan));
  }, [balanceScan]);
  useEffect(() => {
    verifyBalance(balanceCode);
  }, [balanceCode, verifyBalance]);

  // ✅ RESET EFFECT: only when balanceCode becomes empty
  useEffect(() => {
    if (!balanceCode) {
      setBalanceRow(null);
      setBalanceOK(null);
      setZeroed(false);
    }
  }, [balanceCode]);

  /* ---------- Duplicate container nos & row match ---------- */
  const duplicateSet = useMemo(() => {
    const s = new Set();
    const dups = new Set();
    const arr = materials[selectedIndex]?.weight_captures || [];
    arr.forEach((c) => {
      const k = String(c.container_no || '').trim();
      if (!k) return;
      s.has(k) ? dups.add(k) : s.add(k);
    });
    return dups;
  }, [materials, selectedIndex]);

  const rowMatch = useMemo(() => {
    const m = materials[selectedIndex];
    if (!m) return false;
    const target = Number(m.recv_qty || 0) || 0;
    const captured = Number(m.weigh_net_total || 0) || 0;
    return Math.abs(target - captured) < 1e-6;
  }, [materials, selectedIndex]);

  /* ---------- Storage: damage photo upload ---------- */
  const uploadDamagePhoto = async (file) => {
    try {
      const bucket = 'damage-photos';
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
      const key = `${poSelected || 'po'}/${invoiceSelected || 'inv'}/${
        materials[selectedIndex]?.material_code || 'mat'
      }/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const up = supabase.storage
        .from(bucket)
        .upload(key, file, { upsert: false, contentType: file.type || 'image/jpeg' });
      await toast.promise(up, {
        loading: 'Uploading photo…',
        success: 'Photo uploaded',
        error: 'Photo upload failed',
      });
      const { data } = supabase.storage.from(bucket).getPublicUrl(key);
      return data?.publicUrl || '';
    } catch (e) {
      console.error(e);
      return '';
    }
  };

  /* ---------- Row edits ---------- */
  const setRow = (i, patch) =>
    setMaterials((prev) => {
      const n = [...prev];
      n[i] = { ...n[i], ...patch };
      if (patch.weight_captures) {
        const good = sumNetByType(patch.weight_captures, 'GOOD');
        const damage = sumNetByType(patch.weight_captures, 'DAMAGE');
        n[i].weigh_good_total = good;
        n[i].weigh_damage_total = damage;
        n[i].weigh_net_total = good + damage;
        n[i].weigh_status = n[i].weigh_net_total > 0 ? n[i].weigh_status : 'Draft';
      }
      return n;
    });

  /* ---------- Quick Add: weighed or count ---------- */
  const addFromQuickAdd = (i) =>
    setMaterials((prev) => {
      const n = [...prev];
      const row = n[i];
      const qa =
        row.__qa || {
          type: 'GOOD',
          gross: '',
          tare: '',
          net: '',
          container_no: '',
          remarks: '',
          photo: '',
        };
      const who = userInfoSafe(user);
      if (!row.count_mode) {
        if (!balanceOK?.ok) {
          toastAfterPaint.error(
            'Balance not ready — verification/calibration required.'
          );
          return prev;
        }
        if (!zeroed) {
          toastAfterPaint.error('Please Set to Zero before capturing weight.');
          return prev;
        }
      }
      if (!qa.container_no) {
        toastAfterPaint.error('Container No is required.');
        return prev;
      }
      const exists = (row.weight_captures || []).some(
        (x) =>
          String(x.container_no || '').trim() ===
          String(qa.container_no || '').trim()
      );
      if (exists) {
        toastAfterPaint.error('Duplicate container number.');
        return prev;
      }

      let entryType = qa.type || 'GOOD';
      if (STR_IS_DAMAGE(qa.remarks)) entryType = 'DAMAGE';

      const grossN = row.count_mode ? '' : parseTypable(qa.gross);
      const tareN = row.count_mode ? '' : parseTypable(qa.tare);
      let netVal;
      if (row.count_mode) {
        if (qa.net === '' || isNaN(Number(qa.net))) {
          toastAfterPaint.error('Enter Net (Count) in count mode.');
          return prev;
        }
        netVal = roundTo(Number(qa.net), DEC_DIGITS);
      } else {
        const g = Number(grossN || 0) || 0;
        const t = Number(tareN || 0) || 0;
        netVal = roundTo(g - t, DEC_DIGITS);
      }

      const arr = Array.isArray(row.weight_captures)
        ? [...row.weight_captures]
        : [];
      arr.push({
        id: cryptoRandom(),
        type: entryType,
        uom_mode: row.count_mode ? 'COUNT' : 'WEIGHT',
        container_no: qa.container_no,
        gross: row.count_mode ? '' : qa.gross === '' ? '' : String(grossN ?? ''),
        tare: row.count_mode ? '' : qa.tare === '' ? '' : String(tareN ?? ''),
        net: String(netVal),
        remarks: qa.remarks || '',
        photo: qa.photo || '',
        entered_at: nowISO(),
        entered_by_id: who.user_id || null,
        entered_by_email: who.user_email || null,
        entered_by_name: who.user_name || null,
      });
      row.weight_captures = arr;
      const good = sumNetByType(arr, 'GOOD');
      const damage = sumNetByType(arr, 'DAMAGE');
      row.weigh_good_total = good;
      row.weigh_damage_total = damage;
      row.weigh_net_total = good + damage;
      row.__qa = {
        ...row.__qa,
        gross: '',
        tare: '',
        net: '',
        container_no: String(arr.length + 1),
        remarks: '',
        photo: '',
      };
      n[i] = { ...row };
      return n;
    });

  /* ---------- Quick Add: Packs × Qty (count mode) ---------- */
  const addPacksQuick = (i) =>
    setMaterials((prev) => {
      const n = [...prev];
      const row = n[i];
      const qa = row.__qa || {};
      const packs = Math.floor(Number(qa.pack_count || 0) || 0); // ensure whole packs
      const qtyEach = Number(qa.qty_each || 0) || 0;
      const who = userInfoSafe(user);
      if (!row.count_mode) {
        toastAfterPaint.error('Packs quick-add is available for countable UOM only.');
        return prev;
      }
      if (packs <= 0) {
        toastAfterPaint.error('Enter number of packs/boxes.');
        return prev;
      }
      if (qtyEach <= 0) {
        toastAfterPaint.error('Enter quantity per pack/box.');
        return prev;
      }

      let entryType = qa.type || 'GOOD';
      if (STR_IS_DAMAGE(qa.remarks)) entryType = 'DAMAGE';

      const arr = Array.isArray(row.weight_captures)
        ? [...row.weight_captures]
        : [];
      const nextBase = (() => {
        const nums = arr
          .map((x) =>
            Number(String(x.container_no || '').replace(/[^\d]/g, ''))
          )
          .filter((v) => Number.isFinite(v));
        const max = nums.length ? Math.max(...nums) : 0;
        return max + 1;
      })();

      for (let k = 0; k < packs; k += 1) {
        arr.push({
          id: cryptoRandom(),
          type: entryType,
          uom_mode: 'COUNT',
          container_no: String(nextBase + k),
          gross: '',
          tare: '',
          net: String(roundTo(qtyEach, DEC_DIGITS)),
          remarks: qa.remarks || '',
          photo: qa.photo || '',
          container_kind: 'PACK',
          entered_at: nowISO(),
          entered_by_id: who.user_id || null,
          entered_by_email: who.user_email || null,
          entered_by_name: who.user_name || null,
        });
      }

      row.weight_captures = arr;
      const good = sumNetByType(arr, 'GOOD');
      const damage = sumNetByType(arr, 'DAMAGE');
      row.weigh_good_total = good;
      row.weigh_damage_total = damage;
      row.weigh_net_total = good + damage;

      // ✅ Keep qty_each for convenience; only clear pack_count
      row.__qa = { ...row.__qa, pack_count: '', qty_each: qa.qty_each };

      n[i] = { ...row };

      // Friendly confirmation
      toastAfterPaint.success(`Added ${packs} pack(s) × ${qtyEach}`);

      return n;
    });

  const patchContainer = (i, id, patch) =>
    setMaterials((prev) => {
      const n = [...prev];
      const row = n[i];
      const who = userInfoSafe(user);
      const stamp = {
        updated_at: nowISO(),
        updated_by_id: who.user_id || null,
        updated_by_email: who.user_email || null,
        updated_by_name: who.user_name || null,
      };
      const arr = (row.weight_captures || []).map((x) =>
        x.id === id ? { ...x, ...patch, ...stamp } : x
      );
      if (!row.count_mode) {
        const recomputed = arr.map((x) => {
          const g = parseTypable(x.gross === '' ? '' : x.gross);
          const t = parseTypable(x.tare === '' ? '' : x.tare);
          if (g === '' || t === '') return { ...x, net: x.net };
          const netCalc = roundTo(Number(g || 0) - Number(t || 0), DEC_DIGITS);
          return {
            ...x,
            gross: x.gross === '' ? '' : String(g),
            tare: x.tare === '' ? '' : String(t),
            net: String(netCalc),
          };
        });
        row.weight_captures = recomputed;
      } else {
        row.weight_captures = arr;
      }
      const good = sumNetByType(row.weight_captures, 'GOOD');
      const damage = sumNetByType(row.weight_captures, 'DAMAGE');
      row.weigh_good_total = good;
      row.weigh_damage_total = damage;
      row.weigh_net_total = good + damage;
      n[i] = { ...row };
      return n;
    });

  const delContainer = (i, id) =>
    setMaterials((prev) => {
      const n = [...prev];
      const arr = (n[i].weight_captures || []).filter((x) => x.id !== id);
      n[i].weight_captures = arr;
      n[i].weigh_good_total = sumNetByType(arr, 'GOOD');
      n[i].weigh_damage_total = sumNetByType(arr, 'DAMAGE');
      n[i].weigh_net_total =
        sumNetByType(arr, 'GOOD') + sumNetByType(arr, 'DAMAGE');
      return n;
    });

  /* ---------- Save / Release (via API) ---------- */
  const deriveDocStatusFromWeigh = (rows, finalize) => {
    if (finalize) return 'Released';
    const anyCaptured = (Array.isArray(rows) ? rows : []).some(
      (m) =>
        Number(m.weigh_net_total || 0) > 0 ||
        (Array.isArray(m.weight_captures) && m.weight_captures.length > 0)
    );
    return anyCaptured ? 'Submitted' : miRow?.status || 'Draft';
  };

  const persist = async (finalize = false) => {
    if (!poSelected) {
      toastAfterPaint.error('Load a Purchase Order first');
      return false;
    }
    const hasWeightModeActivity = materials.some(
      (m) =>
        !m.count_mode &&
        (Number(m.weigh_net_total || 0) > 0 ||
          (m.weight_captures || []).length > 0)
    );
    if (finalize && hasWeightModeActivity) {
      if (!balanceOK?.ok) {
        toastAfterPaint.error(
          'Balance not ready — verification/calibration required.'
        );
        return false;
      }
      if (!zeroed) {
        toastAfterPaint.error('Please Set to Zero before capturing weight.');
        return false;
      }
    }
    setBusy(true);
    try {
      const savedAt = nowISO();
      const who = userInfoSafe(user);
      const withCapture = (m) =>
        Array.isArray(m.weight_captures) && m.weight_captures.length > 0;
      const nextMaterials = materials.map((m) => ({
        ...m,
        weight_uom_disp: displayFromUom(
          m.weight_uom_code || m.weight_uom || m.uom,
          uomIndex
        ),
        uom_disp: displayFromUom(m.uom_code || m.uom, uomIndex),
        weigh_status:
          finalize && Number(m.weigh_net_total || 0) > 0
            ? 'Completed'
            : m.weigh_status || 'Draft',
        weigh_last_updated_at: savedAt,
        weigh_last_updated_by_id: who.user_id || null,
        weigh_last_updated_by_email: who.user_email || null,
        weigh_last_updated_by_name: who.user_name || null,
        ...(withCapture(m)
          ? {
              weigh_captured_at: m.weigh_captured_at || savedAt,
              weigh_captured_by_id: m.weigh_captured_by_id || who.user_id || null,
              weigh_captured_by_email:
                m.weigh_captured_by_email || who.user_email || null,
              weigh_captured_by_name: m.weigh_captured_by_name || who.user_name || null,
            }
          : {}),
        ...(finalize
          ? {
              weigh_released_at: savedAt,
              weigh_released_by_id: who.user_id || null,
              weigh_released_by_email: who.user_email || null,
              weigh_released_by_name: who.user_name || null,
            }
          : {}),
      }));

      const nextStatus = deriveDocStatusFromWeigh(nextMaterials, finalize);

      const ok = await saveWeightCapture({
        po_no: poSelected,
        invoice_no: invoiceSelected,
        invoice_date: materials[0]?.invoice_date || null,
        materials: nextMaterials,
        finalize,
        user,
      });

      if (ok) {
        toastAfterPaint.success(finalize ? 'Released & saved' : 'Saved');
        if (finalize) {
          setMaterials(
            nextMaterials.map((m) => ({ ...m, weigh_status: 'Completed' }))
          );
          setMiRow((prev) =>
            prev ? { ...prev, status: nextStatus, materials: nextMaterials } : prev
          );
        } else {
          setMiRow((prev) =>
            prev ? { ...prev, status: nextStatus, materials: nextMaterials } : prev
          );
        }
        return true;
      }
      toastAfterPaint.error('Save failed');
      return false;
    } catch (e) {
      console.error(e);
      toastAfterPaint.error('Save failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const current = materials[selectedIndex] || null;

  const allMatched = useMemo(() => {
    if (!materials.length) return false;
    return materials.every((m) => {
      const target = Number(m.recv_qty || 0) || 0;
      const captured = Number(m.weigh_net_total || 0) || 0;
      return target ? Math.abs(captured - target) < 1e-6 : captured > 0;
    });
  }, [materials]);

  /* ---------- keyboard helpers ---------- */
  const qaOrder = ['net', 'gross', 'tare', 'container_no', 'remarks'];
  const focusQA = (name) => {
    const el = qaRefs.current[name];
    if (el) el.focus();
  };
  const handleQAKeyDown = (e, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (current) addFromQuickAdd(selectedIndex);
      return;
    }
    const idx = qaOrder.indexOf(field);
    if (idx === -1) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusQA(qaOrder[Math.min(idx + 1, qaOrder.length - 1)]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusQA(qaOrder[Math.max(idx - 1, 0)]);
    }
  };

  const editCols = ['container_no', 'gross', 'tare', 'net', 'remarks'];
  const focusCell = (id, col) => {
    const el = cellRefs.current[`${id}:${col}`];
    if (el) el.focus();
  };
  const handleCellKeyDown = (e, id, col) => {
    const rows = current?.weight_captures || [];
    const rIndex = rows.findIndex((x) => x.id === id);
    const cIndex = editCols.indexOf(col);
    if (rIndex === -1 || cIndex === -1) return;
    const lastRow = rows.length - 1;
    if (e.key === 'Enter') {
      e.preventDefault();
      focusCell(rows[Math.min(rIndex + 1, lastRow)]?.id, col);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(rows[Math.min(rIndex + 1, lastRow)]?.id, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(rows[Math.max(rIndex - 1, 0)]?.id, col);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusCell(id, editCols[Math.max(cIndex - 1, 0)]);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusCell(id, editCols[Math.min(cIndex + 1, editCols.length - 1)]);
    }
  };

  /* ---------- filtered list for preview ---------- */
  const filteredMaterials = useMemo(() => {
    const q = (previewFilter || '').trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => {
      const hay = `${m.material_code} ${m.material_desc} ${m.mfg_batch_no} ${
        m.weight_uom_disp || m.uom_disp || m.uom || ''
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, previewFilter]);

  const displayUomOf = (m) =>
    m?.weight_uom_disp || m?.uom_disp || uomPretty(m?.weight_uom || m?.uom);

  const exportPreviewCSV = () => {
    if (!materials.length) return;
    const vis = filteredMaterials;
    const d = DEC_DIGITS;
    const rows = [
      [
        'PO',
        'Invoice',
        'Material Code',
        'Material',
        'UOM',
        'PO Qty',
        'Recv Qty',
        'Good',
        'Damage',
        'Total',
        'Status',
      ],
      ...vis.map((m) => {
        const good = Number(m.weigh_good_total || 0);
        const dmg = Number(m.weigh_damage_total || 0);
        const released = m.weigh_status === 'Completed';
        const parts = [];
        if (good > 0) parts.push(`Good/${released ? 'Released' : 'Pending'}`);
        if (dmg > 0) parts.push(`Damage/${released ? 'Released' : 'Pending'}`);
        const status = parts.join(' & ') || '-';
        return [
          poSelected,
          invoiceSelected,
          m.material_code,
          m.material_desc,
          displayUomOf(m),
          Number(m.po_qty || 0).toFixed(d),
          Number(m.recv_qty || 0).toFixed(d),
          good.toFixed(d),
          dmg.toFixed(d),
          Number(m.weigh_net_total || 0).toFixed(d),
          status,
        ].map(csvEscape);
      }),
    ]
      .map((r) => r.join(','))
      .join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WeightPreview_${poSelected}_${invoiceSelected}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printPreview = () => {
    const html = previewRef.current?.innerHTML || '';
    const w = window.open('', '_blank', 'width=1024,height=768');
    if (!w) return;
    w.document.write(`
      <html><head><title>Weight Capture Preview - ${poSelected} / ${invoiceSelected}</title>
      <style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;padding:16px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #e5e7eb;padding:8px;font-size:12px;}thead{background:#f8fafc;}h2{margin:0 0 12px 0;}</style></head>
      <body><h2>Weight Capture Preview</h2>
      <div><b>PO:</b> ${poSelected} &nbsp;&nbsp; <b>Invoice:</b> ${invoiceSelected}</div>
      <div style="margin-top:12px">${html}</div>
      <script>window.onload=()=>window.print()</script></body></html>
    `);
    w.document.close();
  };

  /* ---------- UI ---------- */
  return (
    <div className="p-3 sm:p-4">
      {/* Title */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <Scale className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Weight Capture</div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
            <CheckCircle2 className="w-3 h-3" /> Count UOMs don’t require a balance
          </span>
        </div>

        {/* Top Search Bar */}
        {!showPreview && (
          <div className="bg-white p-3 border-b">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-2">
                  <PackageSearch className="w-4 h-4 text-blue-700" />
                  Purchase Order (with completed Material Inspection)
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Type PO No. and press Fetch"
                    value={poQuery}
                    onChange={(e) => setPoQuery(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && fetchByPO((poQuery || '').trim())
                    }
                    className="min-w-[220px] h-11"
                  />
                  <Button
                    onClick={() => {
                      const v = (poQuery || '').trim();
                      if (!v) {
                        toastAfterPaint.error('Enter a PO No.');
                        return;
                      }
                      fetchByPO(v);
                    }}
                    disabled={loading}
                    className="gap-1"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Fetch
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPoQuery('');
                      setPoSelected('');
                      setInvoiceOptions([]);
                      setInvoiceSelected('');
                      setMiRow(null);
                      setMaterials([]);
                      setSelectedIndex(0);
                    }}
                    className="gap-1"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-700" />
                  Invoice No.
                </Label>
                <select
                  className="w-full border rounded-md h-11 px-2"
                  value={invoiceSelected}
                  onChange={(e) => setInvoiceSelected(e.target.value)}
                  disabled={!invoiceOptions.length}
                >
                  {invoiceOptions.length ? (
                    invoiceOptions.map((x) => (
                      <option key={x.invoice_no} value={x.invoice_no}>
                        {x.invoice_no} — {fmtDate(x.invoice_date)}
                      </option>
                    ))
                  ) : (
                    <option value="">—</option>
                  )}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Select Material</Label>
                  <select
                    className="w-full border rounded-md h-11 px-2"
                    value={selectedIndex}
                    onChange={(e) => setSelectedIndex(Number(e.target.value) || 0)}
                    disabled={!materials.length}
                  >
                    {materials.map((m, i) => (
                      <option
                        key={m.key || `${m.material_code}-${i}`}
                        value={i}
                      >
                        {m.material_code} — {m.material_desc}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setShowPreview(true)}
                  disabled={!materials.length}
                  title="Preview entered data"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PREVIEW SCREEN */}
      {showPreview ? (
        <Card className="overflow-hidden mb-3">
          <div className="px-3 py-2 border-b bg-slate-100">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">
                Preview • PO {poSelected} • Invoice {invoiceSelected}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Input
                  className="h-9 w-52"
                  placeholder="Search materials…"
                  value={previewQuery}
                  onChange={(e) => setPreviewQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setPreviewFilter(previewQuery);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setPreviewFilter(previewQuery)}
                >
                  <Search className="w-4 h-4" />
                  Search
                </Button>
                {previewFilter ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => {
                      setPreviewQuery('');
                      setPreviewFilter('');
                    }}
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </Button>
                ) : null}
                <Button variant="outline" className="gap-1" onClick={exportPreviewCSV}>
                  <Download className="w-4 h-4" />
                  CSV
                </Button>
                <Button variant="outline" className="gap-1" onClick={printPreview}>
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  className="gap-1"
                  onClick={() => setShowPreview(false)}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  className="gap-1"
                  disabled={!materials.length || busy}
                  onClick={async () => {
                    const ok = await persist(true);
                    if (ok) setShowPreview(false);
                  }}
                >
                  <Send className="w-4 h-4" />
                  Release & Submit
                </Button>
              </div>
            </div>
            {previewFilter ? (
              <div className="text-[11px] text-slate-600 mt-1">
                Showing {filteredMaterials.length} of {materials.length} materials
              </div>
            ) : null}
          </div>

          <div className="p-3 overflow-x-auto" ref={previewRef}>
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Material</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-left">PO Qty</th>
                  <th className="p-2 text-left">Recv Qty</th>
                  <th className="p-2 text-left">Good</th>
                  <th className="p-2 text-left">Damage</th>
                  <th className="p-2 text-left">Total</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left w-[110px]">Edit</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((m, i) => {
                  const d = DEC_DIGITS;
                  const released = m.weigh_status === 'Completed';
                  const goodQty = Number(m.weigh_good_total || 0);
                  const dmgQty = Number(m.weigh_damage_total || 0);
                  const Badge = ({ kind, show }) =>
                    show ? (
                      <span
                        className={cls(
                          'px-2 py-[2px] rounded border text-xs mr-1',
                          kind === 'Good'
                            ? released
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-emerald-50/60 text-emerald-800/80 border-emerald-200/60'
                            : released
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-rose-50/60 text-rose-700/80 border-rose-200/60'
                        )}
                      >
                        {kind}/ {released ? 'Released' : 'Pending'}
                      </span>
                    ) : null;
                  return (
                    <tr
                      key={m.key || `${m.material_code}-${i}`}
                      className="align-top"
                    >
                      <td className="p-2 border-b">{i + 1}</td>
                      <td className="p-2 border-b">
                        <div className="font-medium">{m.material_code}</div>
                        <div className="text-xs text-slate-600">{m.material_desc}</div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Batch: {m.mfg_batch_no || '-'} • Mfg: {fmtDate(m.mfg_date)} •
                          Exp: {fmtDate(m.exp_date)}
                        </div>
                      </td>
                      <td className="p-2 border-b">{displayUomOf(m)}</td>
                      <td className="p-2 border-b">
                        {Number(m.po_qty || 0).toFixed(d)}
                      </td>
                      <td className="p-2 border-b">
                        {Number(m.recv_qty || 0).toFixed(d)}
                      </td>
                      <td className="p-2 border-b text-emerald-700">
                        {goodQty.toFixed(d)}
                      </td>
                      <td className="p-2 border-b text-rose-700">
                        {dmgQty.toFixed(d)}
                      </td>
                      <td className="p-2 border-b font-semibold">
                        {Number(m.weigh_net_total || 0).toFixed(d)}
                      </td>
                      <td className="p-2 border-b">
                        <Badge kind="Good" show={goodQty > 0} />
                        <Badge kind="Damage" show={dmgQty > 0} />
                        {goodQty === 0 && dmgQty === 0 ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : null}
                      </td>
                      <td className="p-2 border-b">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            const idx = materials.findIndex(
                              (x) =>
                                (x.key || `${x.material_code}`) ===
                                (m.key || `${m.material_code}`)
                            );
                            setSelectedIndex(Math.max(0, idx));
                            setShowPreview(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <PencilLine className="w-4 h-4" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredMaterials.length && (
                  <tr>
                    <td className="p-3 text-slate-500 text-sm" colSpan={10}>
                      No matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Details Section */}
      {!showPreview && (
        <Card className="mb-3 overflow-hidden">
          <div
            className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between cursor-pointer"
            onClick={() => setShowDetails((s) => !s)}
          >
            <div className="text-sm font-semibold">Details</div>
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
          {showDetails ? (
            !current ? (
              <div className="p-3 text-sm text-slate-500">
                {loading ? 'Loading…' : 'Select a PO and invoice, then choose a material.'}
              </div>
            ) : (
              <div className="p-3 grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Purchase Order No *</Label>
                  <Input value={poSelected || ''} readOnly className="h-11" />
                </div>
                <div>
                  <Label className="text-xs">Invoice No *</Label>
                  <Input value={invoiceSelected || ''} readOnly className="h-11" />
                </div>
                <div>
                  <Label className="text-xs">Select Material Code *</Label>
                  <Input
                    value={`${current.material_code} — ${current.material_desc}`}
                    readOnly
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Select Mfg Batch No *</Label>
                  <Input
                    value={current.mfg_batch_no || ''}
                    onChange={(e) => setRow(selectedIndex, { mfg_batch_no: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Mfg Date</Label>
                  <Input
                    type="date"
                    value={current.mfg_date || ''}
                    onChange={(e) => {
                      const v = e.target.value || todayISO();
                      const patch = { mfg_date: v };
                      const p = current._presets || {};
                      if (!current.exp_date && p.loaded && p.ok) {
                        patch.exp_date = addYearsDays(
                          v,
                          Number(p.expiry_years || 0),
                          Number(p.expiry_days || 0)
                        );
                      }
                      if (!current.retest_date && p.loaded && p.ok) {
                        patch.retest_date = addYearsDays(
                          v,
                          Number(p.retest_years || 0),
                          Number(p.retest_days || 0)
                        );
                      }
                      setRow(selectedIndex, patch);
                    }}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Select UOM</Label>
                  <UOMDropdown
                    value={current.weight_uom_code || current.weight_uom || current.uom || ''}
                    onChange={(val) =>
                      setRow(selectedIndex, {
                        weight_uom: val,
                        weight_uom_code: val,
                        weight_uom_disp: displayFromUom(val, uomIndex),
                        count_mode: countModeFromUom(val, uomIndex),
                      })
                    }
                    className="border rounded-md h-11 px-2 w-full"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    {displayUomOf(current)}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input
                    type="date"
                    value={current.exp_date || ''}
                    onChange={(e) => setRow(selectedIndex, { exp_date: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Retest Date</Label>
                  <Input
                    type="date"
                    value={current.retest_date || ''}
                    onChange={(e) => setRow(selectedIndex, { retest_date: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">PO Quantity</Label>
                  <Input
                    value={`${Number(current.po_qty || 0).toFixed(DEC_DIGITS)} ${displayUomOf(
                      current
                    )}`}
                    readOnly
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Received (Invoice) Quantity</Label>
                  <Input
                    value={`${Number(current.recv_qty || 0).toFixed(DEC_DIGITS)} ${displayUomOf(
                      current
                    )}`}
                    readOnly
                    className="h-11"
                  />
                </div>
              </div>
            )
          ) : null}
        </Card>
      )}

      {/* Balance / Count Capture */}
      {!showPreview && (
        <Card className="mb-3 overflow-hidden">
          <div
            className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between cursor-pointer"
            onClick={() => setShowBalances((s) => !s)}
          >
            <div className="text-sm font-semibold">Balances & Quick Add</div>
            <div className="flex items-center gap-2">
              <Label className="text-xs mr-1">Compact Keypad</Label>
              <Button
                size="sm"
                variant={keypad ? 'secondary' : 'outline'}
                onClick={(e) => {
                  e.stopPropagation();
                  setKeypad((x) => !x);
                }}
              >
                {keypad ? 'On' : 'Off'}
              </Button>
              {showBalances ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>

          {showBalances && (
            <div className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Scan/Select Balance */}
                <div className="md:col-span-6">
                  <Label className="text-xs">Scan/Select Balance Id *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <IconInput
                      icon={Scale}
                      placeholder="Scan Balance Id *"
                      value={balanceScan}
                      onChange={(e) => setBalanceScan(e.target.value)}
                      disabled={!!current?.count_mode}
                    />
                    <IconSelect
                      icon={Scale}
                      value={balanceCode}
                      onChange={(e) => setBalanceCode(clean(e.target.value))}
                      disabled={!!current?.count_mode}
                    >
                      <option value="">— Select —</option>
                      {balances.map((b) => (
                        <option key={b.balance_id} value={b.balance_id}>
                          {b.balance_id}
                          {b.description ? ` — ${b.description}` : ''}
                        </option>
                      ))}
                    </IconSelect>
                  </div>
                </div>

                {/* Entry Type */}
                <div className="md:col-span-3">
                  <Label className="text-xs">Entry Type</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={current?.__qa?.type === 'GOOD' ? 'secondary' : 'outline'}
                      onClick={() =>
                        current && setRow(selectedIndex, { __qa: { ...current.__qa, type: 'GOOD' } })
                      }
                      className="gap-1"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Good
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        current?.__qa?.type === 'DAMAGE' ? 'destructive' : 'outline'
                      }
                      onClick={() =>
                        current &&
                        setRow(selectedIndex, { __qa: { ...current.__qa, type: 'DAMAGE' } })
                      }
                      className="gap-1"
                    >
                      <Bandage className="w-4 h-4" />
                      Damage
                    </Button>
                  </div>
                </div>

                {/* Zero/Status */}
                <div className="md:col-span-3 flex items-end">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cls(
                        'inline-flex items-center px-2 py-[2px] rounded border text-xs',
                        current?.count_mode
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : balanceOK?.ok
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      )}
                    >
                      {current?.count_mode
                        ? 'Count mode — no balance required'
                        : balanceOK?.ok
                        ? 'Verified & in calibration'
                        : 'Balance not ready'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={zeroed ? 'secondary' : 'outline'}
                      disabled={!!current?.count_mode || !balanceOK?.ok}
                      onClick={() => {
                        if (current?.count_mode) return;
                        if (!balanceOK?.ok) {
                          toastAfterPaint.error('Balance not ready.');
                          return;
                        }
                        setZeroed(true);
                        toastAfterPaint.success('Zero set');
                      }}
                      title={current?.count_mode ? 'Not required in count mode' : ''}
                    >
                      Set to Zero
                    </Button>
                  </div>
                </div>

                {/* Row 2: Net / Gross / Tare / Container / Add */}
                <div className="md:col-span-3">
                  <Label className="text-xs">
                    {current?.count_mode ? 'Net (Count)' : 'Net Wt.'}
                  </Label>
                  <IconInput
                    icon={Scale}
                    ref={(el) => (qaRefs.current.net = el)}
                    value={current?.__qa?.net || ''}
                    onFocus={() => setQaActiveField('net')}
                    onKeyDown={(e) => handleQAKeyDown(e, 'net')}
                    onChange={(e) =>
                      current &&
                      setRow(selectedIndex, { __qa: { ...current.__qa, net: e.target.value } })
                    }
                    placeholder={current?.count_mode ? 'Net (Count)' : 'Net Wt.'}
                  />
                </div>

                <div className="md:col-span-3">
                  <Label className="text-xs">Gross Wt *</Label>
                  <IconInput
                    icon={Scale}
                    ref={(el) => (qaRefs.current.gross = el)}
                    value={current?.__qa?.gross || ''}
                    onFocus={() => setQaActiveField('gross')}
                    onKeyDown={(e) => handleQAKeyDown(e, 'gross')}
                    onChange={(e) => {
                      if (!current) return;
                      const gross = e.target.value;
                      if (current.count_mode) {
                        setRow(selectedIndex, { __qa: { ...current.__qa, gross } });
                      } else {
                        const t = parseTypable(current.__qa.tare);
                        const g = parseTypable(gross);
                        if (g === '' || t === '') {
                          setRow(selectedIndex, { __qa: { ...current.__qa, gross } });
                        } else {
                          setRow(selectedIndex, {
                            __qa: { ...current.__qa, gross, net: roundTo(g - t, DEC_DIGITS) },
                          });
                        }
                      }
                    }}
                    placeholder="Gross Wt"
                    disabled={!!current?.count_mode}
                  />
                </div>

                <div className="md:col-span-3">
                  <Label className="text-xs">Tare Wt. *</Label>
                  <IconInput
                    icon={Scale}
                    ref={(el) => (qaRefs.current.tare = el)}
                    value={current?.__qa?.tare || ''}
                    onFocus={() => setQaActiveField('tare')}
                    onKeyDown={(e) => handleQAKeyDown(e, 'tare')}
                    onChange={(e) => {
                      if (!current) return;
                      const tare = e.target.value;
                      if (current.count_mode) {
                        setRow(selectedIndex, { __qa: { ...current.__qa, tare } });
                      } else {
                        const g = parseTypable(current.__qa.gross);
                        const t = parseTypable(tare);
                        if (g === '' || t === '') {
                          setRow(selectedIndex, { __qa: { ...current.__qa, tare } });
                        } else {
                          setRow(selectedIndex, {
                            __qa: { ...current.__qa, tare, net: roundTo(g - t, DEC_DIGITS) },
                          });
                        }
                      }
                    }}
                    placeholder="Tare Wt"
                    disabled={!!current?.count_mode}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs">Container No *</Label>
                  <IconInput
                    icon={PackageIcon}
                    ref={(el) => (qaRefs.current.container_no = el)}
                    value={current?.__qa?.container_no || ''}
                    onFocus={() => setQaActiveField('container_no')}
                    onKeyDown={(e) => handleQAKeyDown(e, 'container_no')}
                    onChange={(e) =>
                      current &&
                      setRow(selectedIndex, {
                        __qa: { ...current.__qa, container_no: e.target.value },
                      })
                    }
                    placeholder="1"
                  />
                </div>

                <div className="md:col-span-1 flex items-end">
                  <Button
                    onClick={() => current && addFromQuickAdd(selectedIndex)}
                    className="w-full gap-1"
                    disabled={!current}
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>

                {/* Packs/Boxes quick-add (count mode) */}
                <div className="md:col-span-3 grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-xs">Packs</Label>
                    <IconInput
                      icon={Boxes}
                      value={current?.__qa?.pack_count || ''}
                      onChange={(e) =>
                        current &&
                        setRow(selectedIndex, {
                          __qa: { ...current.__qa, pack_count: e.target.value },
                        })
                      }
                      placeholder="e.g., 10"
                      disabled={!current?.count_mode}
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">Qty / Pack</Label>
                    <IconInput
                      icon={HashIcon}
                      value={current?.__qa?.qty_each || ''}
                      onChange={(e) =>
                        current &&
                        setRow(selectedIndex, {
                          __qa: { ...current.__qa, qty_each: e.target.value },
                        })
                      }
                      placeholder="e.g., 6"
                      disabled={!current?.count_mode}
                    />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-1"
                      onClick={() => current && addPacksQuick(selectedIndex)}
                      disabled={
                        !current?.count_mode ||
                        !(Number(current?.__qa?.pack_count) > 0 &&
                          Number(current?.__qa?.qty_each) > 0)
                      }
                      title="Add pack_count × qty_each as rows"
                    >
                      <Plus className="w-4 h-4" />
                      Add Packs
                    </Button>
                  </div>
                </div>

                {/* Remarks + Photo */}
                <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Remarks</Label>
                    <Input
                      ref={(el) => (qaRefs.current.remarks = el)}
                      value={current?.__qa?.remarks || ''}
                      onFocus={() => setQaActiveField('remarks')}
                      onKeyDown={(e) => handleQAKeyDown(e, 'remarks')}
                      onChange={(e) =>
                        current &&
                        setRow(selectedIndex, {
                          __qa: { ...current.__qa, remarks: e.target.value },
                        })
                      }
                      placeholder='Optional. If includes "damage/broken/leak/tear", it is stored as Damage.'
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      Photo (Damage only)
                    </Label>
                    <div className="flex items-center gap-3">
                      <input
                        className="text-xs"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f || !current) return;
                          const url = await uploadDamagePhoto(f);
                          if (url)
                            setRow(selectedIndex, {
                              __qa: { ...current.__qa, photo: url },
                            });
                        }}
                      />
                      {current?.__qa?.photo ? (
                        <img
                          src={current.__qa.photo}
                          alt="preview"
                          className="h-10 w-10 rounded object-cover border"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Optional</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Captures Table & Summary */}
      {!showPreview && (
        <Card className="overflow-hidden">
          <div className="p-3">
            {!current ? (
              <div className="text-sm text-slate-500">No material selected.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Container No.</th>
                        <th className="p-2 text-left">Gross</th>
                        <th className="p-2 text-left">Tare</th>
                        <th className="p-2 text-left">Net</th>
                        <th className="p-2 text-left">Remarks & Photo</th>
                        <th className="p-2 text-left w-[120px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(current.weight_captures || []).map((c, ci) => (
                        <tr key={c.id || `${ci}`} className="align-top">
                          <td className="p-2 border-b">{ci + 1}</td>
                          <td className="p-2 border-b">
                            <select
                              className="w-full border rounded-md h-11 px-2 text-xs"
                              value={c.type || 'GOOD'}
                              onChange={(e) =>
                                patchContainer(selectedIndex, c.id, {
                                  type: e.target.value,
                                })
                              }
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, c.id, 'container_no')
                              }
                            >
                              <option value="GOOD">Good</option>
                              <option value="DAMAGE">Damage</option>
                            </select>
                          </td>
                          <td className="p-2 border-b">
                            <Input
                              ref={(el) =>
                                (cellRefs.current[`${c.id}:container_no`] = el)
                              }
                              value={c.container_no || ''}
                              onChange={(e) =>
                                patchContainer(selectedIndex, c.id, {
                                  container_no: e.target.value,
                                })
                              }
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, c.id, 'container_no')
                              }
                              className={cls(
                                'h-11',
                                duplicateSet.has(String(c.container_no || '').trim())
                                  ? 'ring-1 ring-rose-400'
                                  : ''
                              )}
                              placeholder="e.g., 1"
                            />
                          </td>
                          <td className="p-2 border-b">
                            <Input
                              ref={(el) => (cellRefs.current[`${c.id}:gross`] = el)}
                              value={c.gross || ''}
                              onChange={(e) =>
                                patchContainer(selectedIndex, c.id, {
                                  gross: e.target.value,
                                })
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, c.id, 'gross')}
                              placeholder="Gross Wt"
                              className="h-11"
                              disabled={!!current?.count_mode}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <Input
                              ref={(el) => (cellRefs.current[`${c.id}:tare`] = el)}
                              value={c.tare || ''}
                              onChange={(e) =>
                                patchContainer(selectedIndex, c.id, {
                                  tare: e.target.value,
                                })
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, c.id, 'tare')}
                              placeholder="Tare Wt"
                              className="h-11"
                              disabled={!!current?.count_mode}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <Input
                              ref={(el) => (cellRefs.current[`${c.id}:net`] = el)}
                              value={c.net || ''}
                              onChange={(e) =>
                                patchContainer(selectedIndex, c.id, {
                                  net: e.target.value,
                                })
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, c.id, 'net')}
                              placeholder={current.count_mode ? 'Net (Count)' : 'Net Wt'}
                              className="h-11"
                            />
                          </td>
                          <td className="p-2 border-b">
                            <div className="flex flex-col gap-2">
                              <Input
                                ref={(el) => (cellRefs.current[`${c.id}:remarks`] = el)}
                                value={c.remarks || ''}
                                onChange={(e) =>
                                  patchContainer(selectedIndex, c.id, {
                                    remarks: e.target.value,
                                  })
                                }
                                onKeyDown={(e) =>
                                  handleCellKeyDown(e, c.id, 'remarks')
                                }
                                placeholder="Remarks / damage"
                                className="h-11"
                              />
                              {String(c.type).toUpperCase() === 'DAMAGE' && (
                                <div className="flex items-center gap-3">
                                  <input
                                    className="text-xs"
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      if (!f) return;
                                      const url = await uploadDamagePhoto(f);
                                      if (url)
                                        patchContainer(selectedIndex, c.id, { photo: url });
                                    }}
                                  />
                                  {c.photo ? (
                                    <img
                                      src={c.photo}
                                      alt="damage"
                                      className="h-10 w-10 rounded object-cover border"
                                    />
                                  ) : (
                                    <span className="text-[11px] text-slate-500">
                                      Optional photo
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 border-b">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => delContainer(selectedIndex, c.id)}
                                className="gap-1"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!current.weight_captures?.length && (
                        <tr>
                          <td colSpan={8} className="p-3 text-slate-500 text-sm">
                            No entries yet — use the Balances strip above to add
                            containers/parts.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="p-2 text-right text-sm">
                          <span className="text-slate-600">Good Total:</span>
                        </td>
                        <td colSpan={5} className="p-2">
                          <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {Number(current.weigh_good_total || 0).toFixed(DEC_DIGITS)}{' '}
                            {displayUomOf(current)}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="p-2 text-right text-sm">
                          <span className="text-slate-600">Damage Total:</span>
                        </td>
                        <td colSpan={5} className="p-2">
                          <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full border bg-rose-50 text-rose-700 border-rose-200 text-xs">
                            <Bandage className="w-3.5 h-3.5" />
                            {Number(current.weigh_damage_total || 0).toFixed(DEC_DIGITS)}{' '}
                            {displayUomOf(current)}
                          </span>
                        </td>
                      </tr>
                      <tr className={cls(rowMatch ? 'bg-emerald-50/40' : 'bg-rose-50/40')}>
                        <td colSpan={3} className="p-2 text-right text-sm">
                          <span className="text-slate-600">Captured Total:</span>
                        </td>
                        <td colSpan={5} className="p-2">
                          <b>{Number(current.weigh_net_total || 0).toFixed(DEC_DIGITS)}</b>{' '}
                          {displayUomOf(current)}
                          <span className="text-xs text-slate-600 ml-2">
                            Target: {(Number(current.recv_qty || 0) || 0).toFixed(DEC_DIGITS)} •
                            Remaining:{' '}
                            {Math.max(
                              (Number(current.recv_qty || 0) || 0) -
                                (Number(current.weigh_net_total || 0) || 0),
                              0
                            ).toFixed(DEC_DIGITS)}
                          </span>
                          {!rowMatch && (
                            <span className="ml-2 text-xs text-rose-600">
                              (Mismatch — add/remove containers as needed)
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => persist(false)}
                    disabled={busy || !materials.length}
                    className="gap-1"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => persist(true)}
                    disabled={busy || !materials.length}
                    className="gap-1"
                  >
                    <Send className="w-4 h-4" />
                    Release & Submit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setShowPreview(true)}
                    disabled={!materials.length}
                  >
                    <Eye className="w-4 h-4" />
                    Preview
                  </Button>
                  <div className="ml-auto text-xs">
                    Overall (invoice):{' '}
                    <span
                      className={cls(
                        'px-2 py-[2px] rounded border',
                        allMatched
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      )}
                    >
                      {allMatched ? 'All totals matched' : 'Pending totals to match'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Compact keypad */}
      {keypad && !showPreview && (
        <div className="fixed bottom-4 right-4 bg-white border rounded-2xl shadow-xl p-3 w-[260px] z-40">
          <div className="text-xs text-slate-600 mb-2">
            Keypad → {qaActiveField || '—'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '←'].map((k) => (
              <button
                key={k}
                className="h-10 rounded-lg border hover:bg-slate-50 text-sm"
                onClick={() => {
                  if (!current || !qaActiveField) return;
                  const val = String(current.__qa[qaActiveField] || '');
                  if (k === '←') {
                    const nv = val.slice(0, -1);
                    setRow(selectedIndex, {
                      __qa: { ...current.__qa, [qaActiveField]: nv },
                    });
                  } else {
                    const nv = val + k;
                    setRow(selectedIndex, {
                      __qa: { ...current.__qa, [qaActiveField]: nv },
                    });
                  }
                }}
              >
                {k}
              </button>
            ))}
            <button
              className="col-span-2 h-10 rounded-lg border hover:bg-slate-50 text-sm"
              onClick={() => {
                if (!current || !qaActiveField) return;
                setRow(selectedIndex, {
                  __qa: { ...current.__qa, [qaActiveField]: '' },
                });
              }}
            >
              Clear
            </button>
            <button
              className="h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
              onClick={() => current && addFromQuickAdd(selectedIndex)}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-slate-600 flex items-center gap-2">
        <Info className="w-3 h-3" />
        Count-mode (pack/box/ea/unit etc.) doesn’t require a balance — enter counts or use
        “Add Packs”. Weight-mode (mg/g/kg/L/mL) requires a verified, zeroed balance.
      </div>

      {!materials.length && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-11 w-full" />
          ))}
        </div>
      )}
    </div>
  );
};

export default WeightCapture;
