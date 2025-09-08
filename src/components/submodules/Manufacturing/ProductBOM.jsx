// src/components/submodules/Manufacturing/ProductBOM.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import Button from '../../ui/button';  // Default import
import { Card } from '../../ui/card';
import Input from '../../ui/Input';  // Correct import statement for default export
import Label from '../../ui/Label';
import { Skeleton } from '../../ui/skeleton';
import {
  Package, Plus, Trash2, Save, Upload, Download, Search, Printer, Copy, Trash,
  CheckCircle, RotateCcw, Info, Layers, Scale, Hash, Tag, FileText, Ruler, Pill,
  Coins, Building2, Clock3, FileDown, Sparkles, BadgeCheck, Percent,
  User as UserIcon
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import fallbackLogo from '../../../assets/logo.png';

/* ---------- formatting helpers ---------- */
const fmt3 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

/* tiny white chip for brand header */
const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

/* ---------- local persistence fallback (only if DB columns are missing) ---------- */
const metaKey = (pid) => `dx.bomMeta.${pid}`;
const readMeta = (pid) => {
  if (!pid) return null;
  try {
    const raw = localStorage.getItem(metaKey(pid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeMeta = (pid, meta) => {
  try {
    if (pid) localStorage.setItem(metaKey(pid), JSON.stringify(meta || {}));
  } catch {}
};

/* ---------- helpers ---------- */
const computeUnits = (batchKg, unitWeightMg) => {
  const b = Number(batchKg), w = Number(unitWeightMg);
  if (b <= 0 || w <= 0) return 0;
  return Math.floor((b * 1_000_000) / w);
};
const computeScale = (batchKg, unitWeightMg, basisUnits) => {
  const b = Number(batchKg), w = Number(unitWeightMg), bs = Number(basisUnits || 0);
  if (b > 0 && w > 0 && bs > 0) {
    const u = Math.floor((b * 1_000_000) / w);
    const s = u / bs;
    return s > 0 ? s : 1;
  }
  return 1;
};

const ProductBOM = () => {
  /* ---------- Masters ---------- */
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]); // includes status

  /* ---------- Auth / user ---------- */
  const [user, setUser] = useState(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) setUser(data.user);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* ---------- UI state ---------- */
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [loadingBOM, setLoadingBOM] = useState(false);
  const [productId, setProductId] = useState('');
  const [filter, setFilter] = useState('');
  const [materialType, setMaterialType] = useState('');

  // currency + FX date + currencies list + fetchedAt
  const [currency, setCurrency] = useState(
    () => localStorage.getItem('dx.bomCurrency') || 'INR'
  );
  const [fxDate, setFxDate] = useState(
    () => localStorage.getItem('dx.bomFxDate') || new Date().toISOString().slice(0, 10)
  );
  const [currencies, setCurrencies] = useState(['INR']);
  const [fxFetchedAt, setFxFetchedAt] = useState(null);

  // BOM lines (base)
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  // batch planner
  const [batchKg, setBatchKg] = useState(0);
  const [unitWeightMg, setUnitWeightMg] = useState(0);
  const [basisUnits, setBasisUnits] = useState(1000);

  // Create / Clone Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [productDraft, setProductDraft] = useState({ id: null, sku: '', name: '' });

  // Clone + modal helpers
  const [cloneFromId, setCloneFromId] = useState(null);
  const [modalTitle, setModalTitle] = useState('Create Product (SKU)');

  // Preview modal (+ edit mode in preview)
  const [showPreview, setShowPreview] = useState(false);
  const [previewEdit, setPreviewEdit] = useState(false);

  // edit/save/delete stamps
  const [lastEditedAt, setLastEditedAt] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [lastDeletedAt, setLastDeletedAt] = useState(null);

  const fileRef = useRef(null);
  const previewScrollRef = useRef(null);

  // Org identity for print header/PDF
  const [companyName] = useState(
    localStorage.getItem('dx.companyName') || 'DigitizerX · Pharma Material Tracking'
  );
  const [companyLogoUrl] = useState(localStorage.getItem('dx.companyLogoUrl') || '');

  const userEmail = user?.email || 'unknown@user';

  /* ---------- Activity log (best-effort) ---------- */
  const logAction = async (action, details = {}) => {
    try {
      await supabase.from('activity_log').insert({
        module: 'manufacturing',
        feature: 'product_bom',
        action,
        product_id: productId || null,
        user_id: user?.id || null,
        user_email: userEmail,
        details,
      });
    } catch {
      /* ignore if table doesn't exist */
    }
  };
  const markEdited = () => {
    setLastEditedAt(new Date().toISOString());
  };

  /* ---------- Load masters ---------- */
  useEffect(() => {
    (async () => {
      setLoadingMasters(true);
      try {
        const [p, m] = await Promise.all([
          supabase.from('products').select('id,sku,name,status,currency').order('sku'),
          supabase.from('materials').select('id,code,name,unit,rate,category,status').order('code'),
        ]);
        if (p.error) throw p.error;
        if (m.error) throw m.error;
        setProducts(p.data || []);
        setMaterials(m.data || []);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load masters');
      } finally {
        setLoadingMasters(false);
      }
    })();
  }, []);

  /* ---------- Load currencies from fx_rates (dynamic picklist) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('fx_rates')
          .select('currency')
          .order('currency', { ascending: true });
        if (Array.isArray(data) && data.length) {
          const uniq = Array.from(new Set(data.map((x) => x.currency))).filter(Boolean);
          if (uniq.length) setCurrencies(uniq);
        }
      } catch {/* ignore */}
    })();
  }, []);

  /* ---------- Derived helpers ---------- */
  const filteredMaterials = useMemo(() => {
    const q = (filter || '').trim().toLowerCase();
    return materials.filter((m) => {
      if (materialType && m.category !== materialType) return false;
      if (!q) return true;
      return (m.code || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q);
    });
  }, [materials, filter, materialType]);

  const findMaterialById = (id) => materials.find((m) => m.id === id);
  const findMaterialByCode = (code) =>
    materials.find((m) => (m.code || '').toLowerCase() === String(code || '').toLowerCase());

  const activeProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  /* ---------- Persist currency/date (and try to store on product) ---------- */
  useEffect(() => {
    localStorage.setItem('dx.bomCurrency', currency);
    if (productId) supabase.from('products').update({ currency }).eq('id', productId);
  }, [currency, productId]);

  useEffect(() => {
    localStorage.setItem('dx.bomFxDate', fxDate);
  }, [fxDate]);

  /* ---------- Planner: units + scale (scale fallback = 1) ---------- */
  const units = useMemo(() => computeUnits(batchKg, unitWeightMg), [batchKg, unitWeightMg]);
  const scale = useMemo(
    () => computeScale(batchKg, unitWeightMg, basisUnits),
    [batchKg, unitWeightMg, basisUnits]
  );

  const autoQty = (qty, overPct, sc) =>
    round3(Number(qty || 0) * (sc ?? scale) * (1 + Number(overPct || 0) / 100));

  /* ---------- Load BOM (resilient: RPC → fallback to tables) ---------- */
  const loadBOM = async (pid, showToast = false) => {
    if (!pid) {
      setLines([]);
      setBatchKg(0);
      setUnitWeightMg(0);
      setBasisUnits(1000);
      return;
    }
    setLoadingBOM(true);

    const runner = async () => {
      // Planner: try products table, else local fallback
      let plan = { batch: 0, unitW: 0, basis: 1000 };
      try {
        const prod = await supabase
          .from('products')
          .select('batch_size_kg, unit_weight_mg, basis_units')
          .eq('id', pid)
          .single();
        if (!prod.error) {
          plan = {
            batch: Number(prod.data?.batch_size_kg || 0),
            unitW: Number(prod.data?.unit_weight_mg || 0),
            basis: Number(prod.data?.basis_units || 1000),
          };
        } else {
          const p = readMeta(pid);
          if (p) plan = { batch: Number(p.batchKg || 0), unitW: Number(p.unitWeightMg || 0), basis: Number(p.basisUnits || 1000) };
        }
      } catch {
        const p = readMeta(pid);
        if (p) plan = { batch: Number(p.batchKg || 0), unitW: Number(p.unitWeightMg || 0), basis: Number(p.basisUnits || 1000) };
      }
      setBatchKg(plan.batch);
      setUnitWeightMg(plan.unitW);
      setBasisUnits(plan.basis);
      const localScale = computeScale(plan.batch, plan.unitW, plan.basis);

      // Try RPC first
      let rows = [];
      let rpcFailed = false;
      try {
        const rpc = await supabase.rpc('product_bom_enriched_fx', {
          p_product_id: pid,
          p_currency: currency,
          p_scale: 1,
          p_on: fxDate,
        });
        if (rpc.error) {
          rpcFailed = true;
          throw rpc.error;
        }
        rows = rpc.data || [];
      } catch (e) {
        rpcFailed = true;
        console.warn('RPC failed, using fallback:', e?.message || e);
      }

      if (rpcFailed) {
        // fallback to product_bom (+ materials)
        let bom;
        try {
          bom = await supabase
            .from('product_bom')
            .select('material_id,qty,unit,overage_pct')
            .eq('product_id', pid);
          if (bom.error) throw bom.error;
        } catch (e) {
          const msg = String(e?.message || ''), code = e?.code || '';
          if (code === '42703' || (msg.includes('column') && msg.includes('overage_pct'))) {
            bom = await supabase.from('product_bom').select('material_id,qty,unit').eq('product_id', pid);
          } else {
            throw e;
          }
        }
        rows = (bom.data || []).map((b) => {
          const m = findMaterialById(b.material_id);
          return {
            material_id: b.material_id,
            material_code: m?.code || '',
            material_name: m?.name || '',
            unit: b.unit || m?.unit || '',
            qty: Number(b.qty || 0),
            rate_base: Number(m?.rate || 0),
            overage_pct: Number(b.overage_pct || 0),
          };
        });
      } else {
        // If RPC lacks overage_pct, pull from product_bom
        if (rows.length && (rows[0].overage_pct === undefined || rows[0].overage_pct === null)) {
          const ov = await supabase.from('product_bom').select('material_id,overage_pct').eq('product_id', pid);
          const map = {};
          if (!ov.error) (ov.data || []).forEach((r) => (map[r.material_id] = Number(r.overage_pct || 0)));
          rows = rows.map((r) => ({ ...r, overage_pct: map[r.material_id] ?? 0 }));
        }
      }

      const mapped = rows.map((r) => {
        const base = {
          material_id: r.material_id,
          material_code: r.material_code || '',
          description: `${r.material_code || ''} ${r.material_name || ''}`.trim(),
          unit: r.unit || '',
          qty: Number(r.qty || 0),
          rate: Number((r.rate_fx ?? r.rate_base) || 0),
          overage_pct: Number(r.overage_pct || 0),
          manual: false,
        };
        return { ...base, req_qty: autoQty(base.qty, base.overage_pct, localScale) };
      });

      setLines(mapped);

      // FX meta (best effort)
      try {
        const meta = await supabase
          .from('fx_rates')
          .select('updated_at, as_of, currency')
          .eq('currency', currency)
          .lte('as_of', fxDate)
          .order('as_of', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!meta.error) setFxFetchedAt(meta.data?.updated_at || null);
      } catch {/* ignore */}
    };

    try {
      if (showToast) {
        await toast.promise(runner(), {
          loading: 'Loading BOM…',
          success: 'BOM loaded',
          error: 'Failed to load BOM',
        });
      } else {
        await runner();
      }
    } finally {
      setLoadingBOM(false);
    }
  };

  useEffect(() => {
    if (productId) {
      loadBOM(productId, true);
    } else {
      setLines([]);
      setBatchKg(0);
      setUnitWeightMg(0);
      setBasisUnits(1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, currency, fxDate]);

  /* ---------- Recalc all (when planner changes) ---------- */
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => (l.manual ? l : { ...l, req_qty: autoQty(l.qty, l.overage_pct) }))
    );
  }, [scale]);

  /* ---------- Line ops ---------- */
  const addEmptyLine = () => {
    markEdited();
    setLines((p) => [
      ...p,
      {
        material_id: '',
        material_code: '',
        description: '',
        unit: '',
        qty: 1,
        rate: 0,
        overage_pct: 0,
        req_qty: autoQty(1, 0),
        manual: false,
      },
    ]);
  };

  const removeLine = (idx) => {
    markEdited();
    setLines((p) => p.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, patch) => {
    markEdited();
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const onSelectMaterial = (idx, val) => {
    markEdited();
    const m = findMaterialById(val);
    setLines((p) =>
      p.map((l, i) => {
        if (i !== idx) return l;
        if (!m) {
          return {
            ...l,
            material_id: '',
            material_code: '',
            description: '',
            unit: '',
            rate: 0,
            req_qty: l.manual ? l.req_qty : autoQty(l.qty, l.overage_pct),
          };
        }
        const next = {
          ...l,
          material_id: m.id,
          material_code: m.code || '',
          description: `${m.code || ''} ${m.name || ''}`.trim(),
          unit: m.unit || '',
          rate: Number(m.rate || 0),
        };
        if (!next.manual) next.req_qty = autoQty(next.qty, next.overage_pct);
        return next;
      })
    );
  };

  const onEditReqQty = (idx, val) => {
    markEdited();
    updateLine(idx, { req_qty: Number(val) || 0, manual: true });
  };

  const onResetReqQty = (idx) => {
    markEdited();
    setLines((p) =>
      p.map((l, i) =>
        i === idx ? { ...l, req_qty: autoQty(l.qty, l.overage_pct), manual: false } : l
      )
    );
  };

  const onChangeOverage = (idx, val) => {
    markEdited();
    const pct = Number(val) || 0;
    setLines((p) =>
      p.map((l, i) => {
        if (i !== idx) return l;
        return l.manual
          ? { ...l, overage_pct: pct }
          : { ...l, overage_pct: pct, req_qty: autoQty(l.qty, pct) };
      })
    );
  };

  const onChangeBaseQty = (idx, val) => {
    markEdited();
    const qty = parseFloat(val) || 0;
    setLines((p) =>
      p.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, qty };
        if (!next.manual) next.req_qty = autoQty(qty, next.overage_pct);
        return next;
      })
    );
  };

  /* ---------- Save ---------- */
  const saveBOM = async () => {
    if (!productId) {
      toast.error('Select a Product');
      return;
    }
    const valid = lines.filter((l) => l.material_id && Number(l.qty) > 0);
    if (!valid.length) {
      toast.error('Add at least one valid line');
      return;
    }
    setSaving(true);

    const runner = async () => {
      // try saving planner on product; if not present, fallback to local meta
      try {
        const up = await supabase
          .from('products')
          .update({
            batch_size_kg: batchKg,
            unit_weight_mg: unitWeightMg,
            basis_units: basisUnits,
            // best effort audit fields (ignore if not present)
            last_modified_by: user?.id ?? null,
            last_modified_email: userEmail,
            last_modified_at: new Date().toISOString(),
          })
          .eq('id', productId);
        if (up.error) throw up.error;
      } catch {
        const overMap = {};
        for (const l of valid) overMap[l.material_id] = Number(l.overage_pct || 0);
        writeMeta(productId, {
          batchKg,
          unitWeightMg,
          basisUnits,
          overages: overMap,
        });
      }

      // persist lines to DB (qty + unit + overage_pct if exists)
      const del = await supabase.from('product_bom').delete().eq('product_id', productId);
      if (del.error) throw del.error;

      const payload = valid.map((l) => ({
        product_id: productId,
        material_id: l.material_id,
        qty: Number(l.qty || 0),
        unit: l.unit || null,
        overage_pct: Number(l.overage_pct || 0),
      }));

      try {
        const ins = await supabase.from('product_bom').insert(payload);
        if (ins.error) throw ins.error;
      } catch (e) {
        // fallback if overage_pct column isn't there yet
        const msg = String(e?.message || ''), code = e?.code || '';
        if (code === '42703' || (msg.includes('column') && msg.includes('overage_pct'))) {
          const payloadNoOver = payload.map(({ overage_pct, ...r }) => r);
          const ins2 = await supabase.from('product_bom').insert(payloadNoOver);
          if (ins2.error) throw ins2.error;
          const overMap = {};
          for (const l of valid) overMap[l.material_id] = Number(l.overage_pct || 0);
          writeMeta(productId, {
            batchKg,
            unitWeightMg,
            basisUnits,
            overages: overMap,
          });
        } else throw e;
      }

      await loadBOM(productId, false);
    };

    try {
      await toast.promise(runner(), {
        loading: 'Saving BOM…',
        success: 'BOM saved',
        error: (e) => e?.message || 'Failed to save BOM',
      });
      setLastSavedAt(new Date().toISOString());
      await logAction('save', { lines: lines.length });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- New Product (SKU) & New SKU (Clone) ---------- */
  const openNewProductModal = () => {
    setCloneFromId(null);
    setProductDraft({ id: null, sku: '', name: '' });
    setModalTitle('Create Product (SKU)');
    setShowProductModal(true);
    setLines([]);
    setBatchKg(0);
    setUnitWeightMg(0);
    setBasisUnits(1000);
  };

  const openCloneAsNewSku = () => {
    if (!productId) {
      toast.error('Select product to clone');
      return;
    }
    const p = products.find((x) => x.id === productId);
    setCloneFromId(productId);
    setProductDraft({
      id: null,
      sku: p?.sku ? `${p.sku}-NEW` : '',
      name: p?.name || '',
    });
    setModalTitle('Create New SKU from Existing');
    setShowProductModal(true);
  };

  const upsertProduct = async () => {
    const sku = (productDraft.sku || '').trim();
    const name = (productDraft.name || '').trim();
    if (!sku || !name) {
      toast.error('SKU & Name required');
      return;
    }

    const runner = async () => {
      let newId = null;

      if (cloneFromId) {
        const { data, error } = await supabase.rpc('clone_product_as_new_sku', {
          p_source_product_id: cloneFromId,
          p_new_sku: sku,
          p_new_name: name,
          p_currency: currency,
        });
        if (error) throw error;
        newId = data;
      } else {
        const ins = await supabase
          .from('products')
          .insert([{
            sku, name, status: 'Active', currency,
            created_by: user?.id ?? null,
            created_email: userEmail,
            created_at: new Date().toISOString(),
          }])
          .select('id')
          .single();
        if (ins.error) {
          // retry without audit fields if columns not present
          const ins2 = await supabase
            .from('products')
            .insert([{ sku, name, status: 'Active', currency }])
            .select('id')
            .single();
          if (ins2.error) throw ins2.error;
          newId = ins2.data.id;
        } else {
          newId = ins.data.id;
        }
      }

      const p = await supabase
        .from('products')
        .select('id,sku,name,status,currency')
        .order('sku');
      if (p.error) throw p.error;

      setProducts(p.data || []);
      setProductId(newId);
      setShowProductModal(false);
      setCloneFromId(null);
      writeMeta(newId, {
        batchKg: 0,
        unitWeightMg: 0,
        basisUnits: 1000,
        overages: {},
      });
      await loadBOM(newId, false);
      await logAction('create_product', { product_id: newId, sku, name });
    };

    await toast.promise(runner(), {
      loading: cloneFromId ? 'Cloning SKU…' : 'Creating SKU…',
      success: cloneFromId ? 'New SKU cloned' : 'SKU created',
      error: (e) => e?.message || 'Failed to create SKU',
    });
  };

  /* ---------- Delete product ---------- */
  const deleteProduct = async () => {
    const p = products.find((x) => x.id === productId);
    if (!p) {
      toast.error('Select product');
      return;
    }
    if (!confirm(`Delete product "${p.sku} · ${p.name}" and its BOM?`)) return;
    await toast.promise(
      (async () => {
        const delB = await supabase.from('product_bom').delete().eq('product_id', productId);
        if (delB.error) throw delB.error;
        const delP = await supabase.from('products').delete().eq('id', productId);
        if (delP.error) throw delP.error;
        writeMeta(productId, { batchKg: 0, unitWeightMg: 0, basisUnits: 1000, overages: {} });
        setProductId('');
        setLines([]);
        const list = await supabase
          .from('products')
          .select('id,sku,name,status,currency')
          .order('sku');
        if (list.error) throw list.error;
        setProducts(list.data || []);
        setLastDeletedAt(new Date().toISOString());
        await logAction('delete_product', { sku: p.sku, name: p.name });
      })(),
      {
        loading: 'Deleting…',
        success: 'Product deleted',
        error: (e) => e?.message || 'Delete failed',
      }
    );
  };

  /* ---------- CSV ---------- */
  const exportCSV = () => {
    if (!productId) {
      toast.error('Select a Product');
      return;
    }
    const header = 'material_id,material_code,qty,unit,overage_pct';
    const rows = lines.map((l) =>
      [
        `"${l.material_id || ''}"`,
        `"${l.material_code || ''}"`,
        `"${Number(l.qty || 0).toFixed(3)}"`,
        `"${l.unit || ''}"`,
        `"${Number(l.overage_pct || 0).toFixed(2)}"`,
      ].join(',')
    );
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_${productId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFilePicked = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      onCsvParsed(text);
    } catch (err) {
      console.error(err);
      toast.error('Failed to read CSV');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onCsvParsed = (csvText) => {
    const linesArr = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (linesArr.length <= 1) {
      toast.error('CSV empty');
      return;
    }
    const header = linesArr[0]
      .split(',')
      .map((s) => s.replaceAll('"', '').trim().toLowerCase());
    const idx = {
      material_id: header.indexOf('material_id'),
      material_code: header.indexOf('material_code'),
      qty: header.indexOf('qty'),
      unit: header.indexOf('unit'),
      overage_pct: header.indexOf('overage_pct'),
    };
    if (idx.material_id < 0 && idx.material_code < 0) {
      toast.error('CSV must include material_id or material_code');
      return;
    }
    if (idx.qty < 0) {
      toast.error('CSV must include qty');
      return;
    }
    const next = [];
    for (let i = 1; i < linesArr.length; i++) {
      const cols = linesArr[i].split(',').map((s) => s.replaceAll('"', '').trim());
      if (cols.length < header.length) continue;
      const matId = idx.material_id >= 0 ? cols[idx.material_id] : '';
      const matCode = idx.material_code >= 0 ? cols[idx.material_code] : '';
      const qty = parseFloat(cols[idx.qty] || '0');
      const unit = idx.unit >= 0 ? cols[idx.unit] || '' : '';
      const over = idx.overage_pct >= 0 ? parseFloat(cols[idx.overage_pct] || '0') : 0;
      let m = null;
      if (matId) m = findMaterialById(matId);
      if (!m && matCode) m = findMaterialByCode(matCode);
      if (!m) continue;
      next.push({
        material_id: m.id,
        material_code: m.code || '',
        description: `${m.code || ''} ${m.name || ''}`.trim(),
        unit: unit || m.unit || '',
        qty: isFinite(qty) ? qty : 0,
        rate: Number(m.rate || 0),
        overage_pct: isFinite(over) ? over : 0,
        req_qty: autoQty(isFinite(qty) ? qty : 0, isFinite(over) ? over : 0),
        manual: false,
      });
    }
    // merge duplicates
    const merged = new Map();
    for (const l of next) {
      const prev = merged.get(l.material_id);
      if (prev) {
        const mergedQty = Number(prev.qty) + Number(l.qty);
        merged.set(l.material_id, {
          ...l,
          qty: mergedQty,
          req_qty: autoQty(mergedQty, l.overage_pct),
        });
      } else merged.set(l.material_id, l);
    }
    const arr = Array.from(merged.values());
    setLines(arr);
    markEdited();
    toast.success(`Loaded ${merged.size} lines from CSV`);
  };

  /* ---------- PDF (A4 professional layout) ---------- */
  const toImageDataURL = async (url) => {
    if (!url) return null;
    if (/^data:image\/(png|jpeg|jpg);base64,/.test(url)) return url;
    try {
      const r = await fetch(url, { mode: 'cors' });
      const b = await r.blob();
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(b);
      });
    } catch {
      return null;
    }
  };

  const exportPDF = async () => {
    if (!productId) {
      toast.error('Select a Product');
      return;
    }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;
    let cursorY = margin;

    // Header: logo + company + title
    const logoData = await toImageDataURL(companyLogoUrl || fallbackLogo);
    if (logoData) {
      const imgH = 26, imgW = 26;
      doc.addImage(logoData, 'PNG', margin, cursorY, imgW, imgH);
    } else {
      doc.setFillColor(20, 23, 31);
      doc.rect(margin, cursorY, 26, 26, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(companyName, margin + 34, cursorY + 17);
    cursorY += 40;

    doc.setFontSize(16);
    doc.text('Bill of Materials (BOM)', margin, cursorY);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(
      `Generated: ${new Date().toLocaleString()} • User: ${userEmail}`,
      pageW - margin,
      cursorY,
      { align: 'right' }
    );
    cursorY += 16;

    // Product block
    const p = activeProduct || {};
    const blockLines = [
      ['Product', `${p.sku || ''}  ·  ${p.name || ''}`],
      ['Currency', currency],
      ['FX as of', fxDate + (fxFetchedAt ? `  (fetched ${new Date(fxFetchedAt).toLocaleString()})` : '')],
      ['Batch Size (kg)', fmt3(batchKg)],
      ['Unit Weight (mg/tab)', fmt3(unitWeightMg)],
      ['BOM Basis (units)', `${basisUnits}`],
      ['Total Units (auto)', `${units}`],
      ['Scale (units/basis)', fmt3(scale)],
    ];

    autoTable(doc, {
      startY: cursorY,
      head: [['Label', 'Value']],
      body: blockLines,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [7, 89, 133], textColor: 255 },
      columnStyles: { 0: { cellWidth: 150, fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
    });
    cursorY = doc.lastAutoTable.finalY + 14;

    // Materials table
    const head = [[
      'Code','Material','Unit','Base Qty /1000','Overage %',
      `Required Qty ×${fmt3(scale)}`, `Rate (${currency})`, `Line Cost (${currency})`,
    ]];
    const body = lines.map((l) => {
      const mat = findMaterialById(l.material_id);
      const name = l.description || `${mat?.code || ''} ${mat?.name || ''}`;
      const lineCost = Number(l.req_qty || 0) * Number(l.rate || 0);
      return [
        l.material_code || mat?.code || '',
        name,
        l.unit || mat?.unit || '',
        fmt3(l.qty),
        `${Number(l.overage_pct || 0).toFixed(2)}`,
        fmt3(l.req_qty),
        fmt3(l.rate),
        fmt3(lineCost),
      ];
    });

    const colWidths = {
      0: { cellWidth: 50 }, 1: { cellWidth: 165 }, 2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 55, halign: 'right' }, 4: { cellWidth: 45, halign: 'right' },
      5: { cellWidth: 70, halign: 'right' }, 6: { cellWidth: 50, halign: 'right' },
      7: { cellWidth: 52, halign: 'right' },
    };

    autoTable(doc, {
      startY: cursorY, head, body, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [7, 89, 133], textColor: 255 },
      bodyStyles: { valign: 'middle' },
      columnStyles: colWidths,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      rowPageBreak: 'auto',
      didDrawPage: () => {
        const page = doc.getNumberOfPages();
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Page ${page}`, pageW - margin, pageH - 18, { align: 'right' });
      },
    });

    const totalBaseCost = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
    const totalReqCost  = lines.reduce((s, l) => s + Number(l.req_qty || 0) * Number(l.rate || 0), 0);
    const y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(11); doc.setTextColor(30); doc.setFont('helvetica', 'bold');
    doc.text(`Totals (${currency})`, margin, y + 14);

    autoTable(doc, {
      startY: y + 20,
      head: [['Metric', 'Amount']],
      body: [['Base Cost', fmt3(totalBaseCost)], ['Required Cost', fmt3(totalReqCost)]],
      styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [7, 89, 133], textColor: 255 },
      theme: 'grid',
      columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' }, 1: { cellWidth: 120, halign: 'right' } },
      margin: { left: margin, right: margin }, tableWidth: 260,
    });

    const file = `BOM_${(activeProduct?.sku || 'Product')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(file);
  };

  /* ---------- Print ---------- */
  const printBOM = () => window.print();

  /* ---------- Totals (screen) ---------- */
  const totalBaseCost = useMemo(
    () => lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0),
    [lines]
  );
  const totalReqCost = useMemo(
    () => lines.reduce((s, l) => s + Number(l.req_qty || 0) * Number(l.rate || 0), 0),
    [lines]
  );

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveBOM();
      }
      if (e.key === 'Escape' && showPreview) {
        setShowPreview(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, productId, lines]);

  /* ---------- Status badges ---------- */
  const productStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    const cls =
      s === 'active'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-gray-50 text-gray-700 border-gray-200';
    return (
      <span className={`text-xs border rounded-full px-2 py-0.5 ${cls}`}>
        {status || 'Unknown'}
      </span>
    );
  };

  const materialStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    const cls =
      s === 'active'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-gray-50 text-gray-700 border-gray-200';
    return (
      <span className={`text-[11px] border rounded-full px-2 py-[2px] ${cls}`}>
        {status || '—'}
      </span>
    );
  };

  /* ---------- Table header (screen) ---------- */
  const tableHeader = (
    <thead className="bg-gray-50">
      <tr className="align-middle">
        <th className="text-left p-3 w-[320px]">Material</th>
        <th className="text-left p-3 w-[260px]">Description</th>
        <th className="text-center p-3 w-24">Unit</th>
        <th className="text-center p-3 w-28">Status</th>
        {/* widened for readability */}
        <th className="text-center p-3 w-48">
          Base Qty
          <div className="text-[10px] opacity-60">per {basisUnits} units</div>
        </th>
        <th className="text-center p-3 w-32">Overages (%)</th>
        {/* widened for readability */}
        <th className="text-center p-3 w-56">
          Required Qty
          <div className="text-[10px] opacity-60">×{fmt3(scale)}</div>
        </th>
        <th className="text-center p-3 w-36">Rate ({currency})</th>
        <th className="text-center p-3 w-40">Line Cost ({currency})</th>
        <th className="p-3 w-24"></th>
      </tr>
    </thead>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 print:overflow-visible">
      {/* print centering & pagination */}
      <style>{`
        @media print{
          @page { size: A4 portrait; margin: 12mm; }
          body{background:#fff;}
          .print-container{width: 190mm; margin: 0 auto;}
          .card-print{box-shadow:none;border:1px solid #e5e7eb;}
          .no-print{display:none !important;}
          .modal-visible{display:none !important;} /* hide preview modal while printing */
          tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
          /* Ensure tables fit the page width even if a min-width class is present */
          .print-container table{min-width: auto !important; width: 100% !important; font-size: 11px;}
          .print-container img{max-width:100%;}
        }
      `}</style>

      {/* Brand header */}
      <div className="rounded-xl overflow-hidden no-print">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-4 flex items-center gap-3">
          <Package className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Product BOM</div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <WhiteChip><Sparkles className="w-3 h-3" /> Pro UI</WhiteChip>
            <WhiteChip>Blue accents</WhiteChip>
            <WhiteChip>White chips</WhiteChip>
          </div>
        </div>
      </div>

      <div className="print-container space-y-4">
        {/* Org header (prints) */}
        <div className="flex items-center gap-3 pb-2 border-b print:mt-2">
          <img src={companyLogoUrl || fallbackLogo} alt="Logo" className="h-7 w-auto rounded" />
          <div className="text-sm md:text-base font-semibold">{companyName}</div>
        </div>

        {/* Title row + badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <Package className="w-6 h-6 text-sky-700" />
          {loadingMasters ? <Skeleton className="h-6 w-48" /> : <h1 className="text-xl font-semibold">Product BOM</h1>}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200">
              <UserIcon className="w-3.5 h-3.5" /> {userEmail}
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
              <Info className="w-3.5 h-3.5" /> Rates as of {fxDate}
            </span>
            {fxFetchedAt && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200">
                <Clock3 className="w-3.5 h-3.5" /> Fetched at {new Date(fxFetchedAt).toLocaleString()}
              </span>
            )}
            {activeProduct && productStatusBadge(activeProduct.status)}
            <span className="text-sm opacity-70">
              {lines.length} line(s) · Base {fmt3(totalBaseCost)} {currency} · Required {fmt3(totalReqCost)} {currency}
            </span>
          </div>
        </div>

        {/* audit chips */}
        {(lastEditedAt || lastSavedAt || lastDeletedAt) && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {lastEditedAt && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                Edited by {userEmail} @ {new Date(lastEditedAt).toLocaleString()}
              </span>
            )}
            {lastSavedAt && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                Saved by {userEmail} @ {new Date(lastSavedAt).toLocaleString()}
              </span>
            )}
            {lastDeletedAt && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                Deleted by {userEmail} @ {new Date(lastDeletedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Product + Material Type + Search + Currency/Date */}
        <Card className="p-4 card-print">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
              {/* Product */}
              <div className="min-w-0">
                <Label>Product (SKU)</Label>
                {loadingMasters ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <div className="relative">
                    <Package className="w-4 h-4 absolute left-3 top-3 text-sky-700" />
                    <select
                      className="border rounded px-3 pl-8 py-2 w-full min-w-0"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* actions */}
                <div className="mt-2 flex flex-wrap gap-2 w-full no-print">
                  <Button variant="outline" onClick={openNewProductModal} className="inline-flex items-center justify-center flex-1 min-w-[180px]">
                    <Plus className="w-4 h-4 mr-1" /><span className="truncate">New Product (SKU)</span>
                  </Button>
                  <Button variant="outline" onClick={openCloneAsNewSku} className="inline-flex items-center justify-center flex-1 min-w-[180px]" disabled={!productId}>
                    <Copy className="w-4 h-4 mr-1" /><span className="truncate">New SKU (Clone)</span>
                  </Button>
                  <Button variant="destructive" onClick={deleteProduct} className="inline-flex items-center justify-center flex-1 min-w-[140px]" disabled={!productId}>
                    <Trash className="w-4 h-4 mr-1" />Delete
                  </Button>
                </div>
              </div>

              {/* Material Type */}
              <div className="min-w-0">
                <Label>Material Type</Label>
                {loadingMasters ? <Skeleton className="h-10 w-full" /> : (
                  <div className="relative">
                    <Layers className="w-4 h-4 absolute left-3 top-3 text-violet-700" />
                    <select className="border rounded px-3 pl-8 py-2 w-full min-w-0" value={materialType} onChange={(e) => setMaterialType(e.target.value)}>
                      <option value="">All</option>
                      <option>Raw Material</option>
                      <option>Packaging Material</option>
                      <option>Miscellaneous Items</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="min-w-0">
                <Label>Material quick filter</Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-blue-600" />
                  <Input className="w-full pl-9" placeholder="Search material code/name" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
              </div>

              {/* Currency (editable with suggestions) */}
              <div className="min-w-0">
                <Label>Currency</Label>
                <div className="relative">
                  <Coins className="w-4 h-4 absolute left-3 top-3 text-green-700" />
                  <Input
                    list="currency-list"
                    className="pl-8 uppercase tracking-wider"
                    placeholder="e.g., USD"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  />
                  <datalist id="currency-list">
                    {currencies.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              {/* FX date */}
              <div className="min-w-0">
                <Label>FX effective date</Label>
                <Input type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
              </div>
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 no-print">
              <Button className="shrink-0 inline-flex items-center" onClick={addEmptyLine} variant="secondary">
                <Plus className="w-4 h-4 mr-2" />Add Line
              </Button>
              <Button className="shrink-0 inline-flex items-center" onClick={saveBOM} disabled={!productId || saving || loadingBOM} title="Save BOM">
                <Save className="w-4 h-4 mr-2" />Save BOM
              </Button>
              <Button className="shrink-0 inline-flex items-center" onClick={exportCSV} disabled={!productId}>
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFilePicked} />
              <Button className="shrink-0 inline-flex items-center" onClick={() => fileRef.current?.click()} variant="outline">
                <Upload className="w-4 h-4 mr-2" />Import CSV
              </Button>
              <Button className="shrink-0 inline-flex items-center" onClick={() => { setPreviewEdit(false); setShowPreview(true); }} variant="outline">
                <FileText className="w-4 h-4 mr-2" />Preview
              </Button>
              <Button className="shrink-0 inline-flex items-center" onClick={exportPDF} variant="outline">
                <FileDown className="w-4 h-4 mr-2" />Export PDF (A4)
              </Button>
              <Button className="shrink-0 inline-flex items-center" onClick={printBOM} variant="outline">
                <Printer className="w-4 h-4 mr-2" />Print Page
              </Button>
            </div>
          </div>
        </Card>

        {/* Batch planner */}
        <Card className="p-4 card-print">
          <div className="grid md:grid-cols-5 sm:grid-cols-2 gap-4 items-end">
            <div className="min-w-0">
              <Label className="flex items-center gap-2"><Scale className="w-4 h-4 text-emerald-700" /> Batch Size (kg)</Label>
              <Input type="number" min={0} step="0.001" value={Number(batchKg || 0).toFixed(3)} onChange={(e) => setBatchKg(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="min-w-0">
              <Label className="flex items-center gap-2"><Pill className="w-4 h-4 text-rose-700" /> Unit Weight (mg per tablet)</Label>
              <Input type="number" min={0} step="0.001" value={Number(unitWeightMg || 0).toFixed(3)} onChange={(e) => setUnitWeightMg(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="min-w-0">
              <Label className="flex items-center gap-2"><Hash className="w-4 h-4 text-indigo-700" /> BOM Basis (units)</Label>
              <Input type="number" min={1} step="1" value={basisUnits} onChange={(e) => setBasisUnits(Number(e.target.value || 1))} />
            </div>
            <div className="min-w-0">
              <Label>Total Units (auto)</Label>
              <Input readOnly value={units || 0} />
            </div>
            <div className="text-sm opacity-70 min-w-0">
              <div>Scale = Units / Basis = {units} / {basisUnits} = <b>{fmt3(scale)}</b></div>
              <div className="mt-1">Override Required Qty; click <RotateCcw className="inline w-3 h-3" /> to reset.</div>
            </div>
          </div>
        </Card>

        {/* Lines (screen table) */}
        <Card className="p-0 overflow-x-auto card-print">
          <div className="w-full">
            <table className="table-auto min-w-[1360px] w-full text-sm">
              {tableHeader}
              <tbody>
                {loadingBOM && (
                  <>
                    {[...Array(3)].map((_, i) => (
                      <tr key={`sk-${i}`} className="border-t">
                        {Array.from({ length: 10 }).map((__, j) => (
                          <td key={`sk-${i}-${j}`} className="p-3"><Skeleton className="h-8 w-full" /></td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {!loadingBOM && lines.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center opacity-60">No BOM lines yet</td></tr>
                )}

                {!loadingBOM && lines.map((l, idx) => {
                  const mat = findMaterialById(l.material_id);
                  const lineCost = Number(l.req_qty || 0) * Number(l.rate || 0);
                  const matStatus = mat?.status || 'Inactive';
                  return (
                    <tr key={idx} className="border-t align-middle">
                      {/* Material */}
                      <td className="p-2">
                        <div className="relative">
                          <Tag className="w-4 h-4 absolute left-2 top-2.5 text-sky-700" />
                          <select
                            className="border rounded px-2 pl-7 py-1.5 w-full sm:min-w-[240px]"
                            value={l.material_id || ''}
                            onChange={(e) => onSelectMaterial(idx, e.target.value)}
                            title={l.material_code}
                          >
                            <option value="">Select material</option>
                            {filteredMaterials.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                          </select>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="p-2">
                        <div className="relative">
                          <FileText className="w-4 h-4 absolute left-2.5 top-2.5 text-amber-600" />
                          <Input
                            value={l.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                            title={l.description}
                            className="pl-8"
                            placeholder="Description"
                          />
                        </div>
                      </td>

                      {/* Unit */}
                      <td className="p-2 text-center">
                        <div className="relative">
                          <Ruler className="w-4 h-4 absolute left-2.5 top-2.5 text-orange-600" />
                          <Input value={l.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} className="pl-8 text-center" placeholder="unit" />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-1 justify-center">
                          <BadgeCheck className={`w-4 h-4 ${matStatus?.toLowerCase() === 'active' ? 'text-emerald-600' : 'text-gray-500'}`} />
                          {materialStatusBadge(matStatus)}
                        </div>
                      </td>

                      {/* Base Qty */}
                      <td className="p-2 text-center">
                        <div className="relative">
                          <Layers className="w-4 h-4 absolute left-2.5 top-2.5 text-violet-700" />
                          <Input
                            type="number"
                            min={0}
                            step="0.001"
                            value={Number(l.qty || 0).toFixed(3)}
                            onChange={(e) => onChangeBaseQty(idx, e.target.value)}
                            className="pl-8 text-center w-full"
                          />
                        </div>
                      </td>

                      {/* Overages (%) */}
                      <td className="p-2 text-center">
                        <div className="relative">
                          <Percent className="w-4 h-4 absolute left-2.5 top-2.5 text-fuchsia-700" />
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            value={Number(l.overage_pct || 0)}
                            onChange={(e) => onChangeOverage(idx, e.target.value)}
                            className="pl-8 text-center"
                          />
                        </div>
                      </td>

                      {/* Required Qty + reset */}
                      <td className="p-2">
                        <div className="relative flex items-center justify-center gap-2">
                          <Scale className="w-4 h-4 absolute left-2.5 top-2.5 text-cyan-700" />
                          <Input
                            type="number"
                            min={0}
                            step="0.001"
                            value={Number(l.req_qty || 0).toFixed(3)}
                            onChange={(e) => onEditReqQty(idx, parseFloat(e.target.value) || 0)}
                            className="pl-8 text-center w-full"
                          />
                          <Button size="icon" variant="ghost" title="Reset to auto" onClick={() => onResetReqQty(idx)}>
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>

                      {/* Rate */}
                      <td className="p-2 text-center">
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          value={Number(l.rate || 0).toFixed(3)}
                          onChange={(e) => updateLine(idx, { rate: parseFloat(e.target.value) || 0 })}
                          className="text-center w-full"
                        />
                      </td>

                      {/* Cost */}
                      <td className="p-2 text-center font-mono whitespace-nowrap">
                        {fmt3(Number(l.req_qty || 0) * Number(l.rate || 0))} {currency}
                      </td>

                      {/* Delete */}
                      <td className="p-2 text-center">
                        <Button size="sm" variant="ghost" onClick={() => removeLine(idx)} title="Delete" className="inline-flex items-center">
                          <Trash2 className="w-4 h-4 mr-1" />Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 text-sm flex flex-wrap gap-6 justify-end">
            <div className="flex gap-6"><span className="opacity-70">Lines</span><span className="font-medium">{lines.length}</span></div>
            <div className="flex gap-6"><span className="opacity-70">Base Cost</span><span className="font-mono">{fmt3(totalBaseCost)} {currency}</span></div>
            <div className="flex gap-6"><span className="opacity-70">Required Cost</span><span className="font-mono">{fmt3(totalReqCost)} {currency}</span></div>
          </div>
        </Card>

        {/* Modal: Create / Clone product */}
        {showProductModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-5">
              <div className="text-lg font-semibold mb-3">{modalTitle}</div>
              <div className="grid gap-3">
                <div className="relative">
                  <Tag className="w-4 h-4 absolute left-3 top-3 text-sky-700" />
                  <Input className="pl-8" placeholder="SKU" value={productDraft.sku} onChange={(e) => setProductDraft((d) => ({ ...d, sku: e.target.value }))} />
                </div>
                <div className="relative">
                  <Package className="w-4 h-4 absolute left-3 top-3 text-emerald-700" />
                  <Input className="pl-8" placeholder="Name" value={productDraft.name} onChange={(e) => setProductDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
              </div>
              {cloneFromId && <div className="mt-2 text-xs text-slate-600">This will clone the existing product’s BOM into the new SKU.</div>}
              <div className="mt-4 flex items-center gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowProductModal(false)}>Cancel</Button>
                <Button onClick={upsertProduct} className="inline-flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />Create
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Preview (editable) */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 modal-visible">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-6xl p-0 flex flex-col max-h-[85vh]">
              {/* sticky top toolbar */}
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-5 py-3 flex items-center justify-between gap-2">
                <div className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-sky-700" /> BOM Preview
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant={previewEdit ? 'secondary' : 'outline'} onClick={() => setPreviewEdit((v) => !v)}>
                    {previewEdit ? 'View Mode' : 'Edit in Preview'}
                  </Button>
                  {previewEdit && (
                    <>
                      <Button variant="outline" onClick={addEmptyLine}><Plus className="w-4 h-4 mr-2" />Add Line</Button>
                      <Button onClick={saveBOM} disabled={!productId || saving || loadingBOM}><Save className="w-4 h-4 mr-2" />Save Changes</Button>
                    </>
                  )}
                  <Button variant="outline" onClick={printBOM}><Printer className="w-4 h-4 mr-2" />Print</Button>
                  <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
                </div>
              </div>

              {/* scrollable body */}
              <div ref={previewScrollRef} className="px-5 pb-4 overflow-y-auto overscroll-contain">
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Code</th>
                        <th className="p-2 text-left">Material</th>
                        <th className="p-2 text-center">Unit</th>
                        <th className="p-2 text-right">Base Qty /1000</th>
                        <th className="p-2 text-right">Overage %</th>
                        <th className="p-2 text-right">Required Qty ×{fmt3(scale)}</th>
                        <th className="p-2 text-right">Rate ({currency})</th>
                        <th className="p-2 text-right">Line Cost ({currency})</th>
                        {previewEdit && <th className="p-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const mat = findMaterialById(l.material_id);
                        const name = l.description || `${mat?.code || ''} ${mat?.name || ''}`;
                        const lineCost = Number(l.req_qty || 0) * Number(l.rate || 0);

                        if (!previewEdit) {
                          return (
                            <tr key={i} className="border-t">
                              <td className="p-2">{l.material_code || mat?.code || ''}</td>
                              <td className="p-2">{name}</td>
                              <td className="p-2 text-center">{l.unit || mat?.unit || ''}</td>
                              <td className="p-2 text-right">{fmt3(l.qty)}</td>
                              <td className="p-2 text-right">{Number(l.overage_pct || 0).toFixed(2)}</td>
                              <td className="p-2 text-right">{fmt3(l.req_qty)}</td>
                              <td className="p-2 text-right">{fmt3(l.rate)}</td>
                              <td className="p-2 text-right">{fmt3(lineCost)}</td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={i} className="border-t align-middle">
                            <td className="p-2 font-mono">{l.material_code || mat?.code || ''}</td>
                            <td className="p-2">
                              <select
                                className="border rounded px-2 py-1.5 w-full"
                                value={l.material_id || ''}
                                onChange={(e) => onSelectMaterial(i, e.target.value)}
                                title={name}
                              >
                                <option value="">Select material</option>
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <Input value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} className="text-center" />
                            </td>
                            <td className="p-2">
                              <Input type="number" min={0} step="0.001" value={Number(l.qty || 0).toFixed(3)} onChange={(e) => onChangeBaseQty(i, e.target.value)} className="text-right" />
                            </td>
                            <td className="p-2">
                              <Input type="number" min={0} step="0.1" value={Number(l.overage_pct || 0)} onChange={(e) => onChangeOverage(i, e.target.value)} className="text-right" />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center justify-end gap-1">
                                <Input type="number" min={0} step="0.001" value={Number(l.req_qty || 0).toFixed(3)} onChange={(e) => onEditReqQty(i, parseFloat(e.target.value) || 0)} className="text-right" />
                                <Button size="icon" variant="ghost" title="Reset" onClick={() => onResetReqQty(i)}>
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                            <td className="p-2">
                              <Input type="number" min={0} step="0.001" value={Number(l.rate || 0).toFixed(3)} onChange={(e) => updateLine(i, { rate: parseFloat(e.target.value) || 0 })} className="text-right" />
                            </td>
                            <td className="p-2 text-right font-mono">{fmt3(lineCost)}</td>
                            <td className="p-2 text-center">
                              <Button size="sm" variant="ghost" onClick={() => removeLine(i)} title="Delete">
                                <Trash2 className="w-4 h-4 mr-1" />Delete
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-sm flex flex-wrap gap-6 justify-end">
                  <div>Base Cost: <span className="font-mono">{fmt3(totalBaseCost)} {currency}</span></div>
                  <div>Required Cost: <span className="font-mono">{fmt3(totalReqCost)} {currency}</span></div>
                </div>
              </div>

              {/* sticky bottom quick-bar */}
              <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t px-5 py-2 flex items-center justify-end gap-2">
                {previewEdit && (
                  <>
                    <Button variant="outline" onClick={addEmptyLine}><Plus className="w-4 h-4 mr-2" />Add Line</Button>
                    <Button onClick={saveBOM} disabled={!productId || saving || loadingBOM}><Save className="w-4 h-4 mr-2" />Save Changes</Button>
                  </>
                )}
                <Button variant="outline" onClick={printBOM}><Printer className="w-4 h-4 mr-2" />Print</Button>
                <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductBOM;
