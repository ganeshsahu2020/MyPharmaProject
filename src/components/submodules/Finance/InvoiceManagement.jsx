// src/components/submodules/Procurement/InvoiceManagement.jsx
// Invoice Management: BOM-driven & direct materials with inline editing,
// Find/Edit (with Created By names), FX display (get_fx_rate), and robust save/edit/delete flows.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import toast from "react-hot-toast";
import Button from "../../ui/button";
import { Card } from "../../ui/card";
import Input from "../../ui/Input";
import Label from "../../ui/Label";
import { Skeleton } from "../../ui/skeleton";
import {
  ClipboardCheck,
  Mail,
  Plus,
  Save,
  Trash2,
  ShieldAlert,
  Link as LinkIcon,
  CheckCircle2,
  UserPlus,
  Edit2,
  X,
  Search,
  RefreshCw,
  EyeOff,
  UserCircle2,
  Building2,
  Boxes,
  PackageOpen,
  Filter,
  ChevronRight,
  Landmark,
} from "lucide-react";

/* ---------- constants & small utils ---------- */
const COMPANY_CODE = "MFI";
const FY_CODE = "25";
const FIXED_INV = "INV";
const CURRENCIES = ["INR","USD","EUR","GBP","AED","JPY"];

const money3 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

const pad5 = (n) => String(n).padStart(5, "0");
const parseSeq = (docNo) => {
  if (!docNo || typeof docNo !== "string") return null;
  const parts = docNo.split("/");
  if (parts.length !== 4) return null;
  const seq = parseInt(parts[3], 10);
  return Number.isFinite(seq) ? seq : null;
};
const formatInvoiceNo = (company, fy, seq) =>
  `${company}/${fy}/${FIXED_INV}/${pad5(seq)}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === "string" && UUID_RE.test(s);

/* tiny chips (white chips on brand-colored borders/text) */
const Chip = ({ color = "blue", children }) => {
  const palette = {
    blue:
      "border-blue-200 text-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.05)]",
    gray: "border-gray-200 text-gray-700 shadow-[0_0_0_1px_rgba(0,0,0,0.03)]",
    green:
      "border-emerald-200 text-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]",
    amber:
      "border-amber-200 text-amber-700 shadow-[0_0_0_1px_rgba(245,158,11,0.10)]",
    red: "border-rose-200 text-rose-700 shadow-[0_0_0_1px_rgba(244,63,94,0.10)]",
    indigo:
      "border-indigo-200 text-indigo-700 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]",
    violet:
      "border-violet-200 text-violet-700 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]",
  }[color];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-white px-2 py-[2px] text-[11px] font-medium ${palette}`}
    >
      {children}
    </span>
  );
};

/* =======================================================
   Component
======================================================= */
const InvoiceManagement = () => {
  const nav = useNavigate();

  /* Current user (for created_by + name in header) */
  const [me, setMe] = useState({ id: null, fullName: "" });

  // ensure a profile row exists and return {uid, fullName}
  const getUserContext = async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id || null;
    const md = u?.user?.user_metadata || {};
    const first = (md.first_name || md.firstName || "").trim();
    const last = (md.last_name || md.lastName || "").trim();
    const email = u?.user?.email || "";
    if (uid) {
      await supabase
        .from("profiles")
        .upsert(
          { id: uid, first_name: first, last_name: last, email },
          { onConflict: "id" }
        );
    }
    const fullName =
      first || last ? `${first} ${last}`.trim() : email || uid || "";
    return { uid, fullName };
  };

  /* Masters */
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [matVendorMap, setMatVendorMap] = useState(new Map()); // material_id -> Set(vendor_id)

  /* Editor visibility & mode */
  const [editorOpen, setEditorOpen] = useState(false); // 🔒 hidden by default
  const openNewInvoice = () => {
    resetEditor();
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
  };

  /* Editor selections */
  const [vendorId, setVendorId] = useState("");
  const [selected, setSelected] = useState([]); // [{product_id,sku,qty}]
  const [manualLines, setManualLines] = useState([]); // [{material_id,unit,rate,qty}]

  /* Preview & state (INR-native) */
  const [previewRows, setPreviewRows] = useState([]); // [{material_id,material_code,material_name,unit,total_qty,rate,total_cost,include}]
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lastKnown, setLastKnown] = useState("MFI/25/INV/00209");
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);
  const [loading, setLoading] = useState(false);

  /* Currency/FX display (non-breaking; amounts still saved in INR) */
  const [currency, setCurrency] = useState("INR");
  const [asOf, setAsOf] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [fxRate, setFxRate] = useState(1); // INR per 1 unit of display currency
  const [fxLoading, setFxLoading] = useState(false);

  /* New vendor (modal) */
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", email: "", phone: "", code: "" });

  /* Alignment tool (manual) */
  const [alignMatId, setAlignMatId] = useState("");
  const [alignChoices, setAlignChoices] = useState(new Set());
  const [showAlignTool, setShowAlignTool] = useState(false);

  /* Vendor gating for header */
  const [allowedVendorIds, setAllowedVendorIds] = useState(new Set());
  const [showAllVendors, setShowAllVendors] = useState(false);
  const [loadingAllowed, setLoadingAllowed] = useState(false);

  /* Per-row editor state */
  const [editingRowId, setEditingRowId] = useState(null);
  const [rowVendorId, setRowVendorId] = useState("");
  const [rowShowAll, setRowShowAll] = useState(false);

  /* Find / Edit panel state + filters */
  const [showFinder, setShowFinder] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [invSearch, setInvSearch] = useState("");
  const [invStatus, setInvStatus] = useState(""); // Verified/Draft/Cancelled
  const [invVendorFilter, setInvVendorFilter] = useState(""); // name (datalist)
  const [invList, setInvList] = useState([]); // [{id,invoice_no,vendor_name,total,status,created_by_name}]

  /* Quick Edit palette (floating) */
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickVendor, setQuickVendor] = useState("");
  const [quickInvoice, setQuickInvoice] = useState("");

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { uid, fullName } = await getUserContext();
        setMe({ id: uid, fullName });
        await Promise.all([loadMasters(), loadInvoiceList()]);
      } catch (e) {
        console.warn("user/profile bootstrap failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Load masters ---------- */
  const loadMasters = async () => {
    setLoading(true);
    try {
      const [v, p, m, mv] = await Promise.all([
        supabase
          .from("vendors")
          .select("id,name,email,phone,status,code")
          .order("name"),
        supabase.from("products").select("id,sku,name,status").order("sku"),
        supabase
          .from("materials")
          .select("id,code,name,unit,rate,status")
          .order("code"),
        supabase.from("material_vendors").select("material_id,vendor_id"),
      ]);
      if (v.error) throw v.error;
      if (p.error) throw p.error;
      if (m.error) throw m.error;
      if (mv.error) throw mv.error;

      setVendors(v.data || []);
      setProducts(p.data || []);
      setMaterials(m.data || []);

      const map = new Map();
      (mv.data || []).forEach((r) => {
        if (!map.has(r.material_id)) map.set(r.material_id, new Set());
        map.get(r.material_id).add(r.vendor_id);
      });
      setMatVendorMap(map);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load masters");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- FX handling ---------- */
  const refreshFx = async () => {
    if (currency === "INR") {
      setFxRate(1);
      return;
    }
    setFxLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_fx_rate", {
        p_currency: currency,
        p_on: asOf,
      });
      if (error) throw error;
      const rate = typeof data === "number" ? data
        : Number(Array.isArray(data) ? data?.[0]?.get_fx_rate ?? data?.[0] : data?.get_fx_rate);
      if (!rate || !isFinite(rate)) throw new Error("No FX rate available");
      setFxRate(rate);
      toast.success(`FX ${currency}→INR = ${rate.toFixed(6)}`);
    } catch (e) {
      setFxRate(1);
      toast.error(`FX load failed: ${e.message || e}`);
    } finally {
      setFxLoading(false);
    }
  };
  useEffect(() => { refreshFx(); /* eslint-disable-next-line */ }, [currency, asOf]);

  const inDisplay = (amountInInr) =>
    currency === "INR" ? amountInInr : Number(amountInInr || 0) / Number(fxRate || 1);

  /* ---------- Find / Edit: load list (with creator names) ---------- */
  const loadInvoiceList = async () => {
    setListLoading(true);
    try {
      let q = supabase
        .from("invoices")
        .select(
          "id,invoice_no,total,status,created_at,created_by,vendor_id,vendor:vendors(name),vendor_snapshot"
        )
        .order("created_at", { ascending: false });

      if (invSearch?.trim()) q = q.ilike("invoice_no", `%${invSearch.trim()}%`);
      if (invStatus) q = q.eq("status", invStatus);
      if (invVendorFilter?.trim()) {
        const name = invVendorFilter.trim().toLowerCase();
        const match = vendors.find((v) => (v.name || "").toLowerCase() === name);
        if (match) q = q.eq("vendor_id", match.id);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      const uids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];

      const namesById = new Map();
      if (uids.length > 0) {
        const { data: profs, error: pe } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,email")
          .in("id", uids);
        if (pe) console.warn("profiles select failed", pe);
        (profs || []).forEach((p) => {
          const fn = (p.first_name || "").trim();
          const ln = (p.last_name || "").trim();
          const nm = fn || ln ? `${fn} ${ln}`.trim() : p.email || p.id;
          namesById.set(p.id, nm);
        });
      }

      const hydrated = rows.map((r) => {
        const invNo =
          r.invoice_no || `INV-${String(r.id).slice(0, 8).toUpperCase()}`;
        const vendorName =
          r.vendor?.name || r.vendor_snapshot?.name || "(unknown vendor)";
        return {
          id: r.id,
          invoice_no: invNo,
          total: r.total ?? 0,
          status: r.status || "Verified",
          created_by_name: namesById.get(r.created_by) || "—",
          vendor_name: vendorName,
          created_at: r.created_at,
        };
      });

      setInvList(hydrated);
    } catch (e) {
      console.error("loadInvoiceList", e);
      toast.error("Failed to load invoices");
    } finally {
      setListLoading(false);
    }
  };

  /* ---------- Product & manual lines ---------- */
  const addProduct = () =>
    setSelected((s) => [...s, { product_id: "", sku: "", qty: 1 }]);
  const removeProduct = (idx) =>
    setSelected((s) => s.filter((_, i) => i !== idx));
  const updateProduct = (idx, patch) =>
    setSelected((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const onPickProduct = (idx, prodId) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) { updateProduct(idx, { product_id: "", sku: "" }); return; }
    updateProduct(idx, { product_id: p.id, sku: p.sku });
  };

  const addManualLine = () =>
    setManualLines((s) => [...s, { material_id: "", unit: "", rate: 0, qty: 1 }]);
  const removeManualLine = (idx) =>
    setManualLines((s) => s.filter((_, i) => i !== idx));
  const updateManualLine = (idx, patch) =>
    setManualLines((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const onPickManualMaterial = (idx, matId) => {
    const m = materials.find((x) => x.id === matId);
    if (!m) { updateManualLine(idx, { material_id: "", unit: "", rate: 0 }); return; }
    updateManualLine(idx, {
      material_id: m.id,
      unit: m.unit || "",
      rate: Number(m.rate || 0),
    });
  };

  /* ---------- Reserve invoice number ---------- */
  const reserveInvoiceNumber = async () => {
    try {
      const base = invoiceNo || lastKnown || `${COMPANY_CODE}/${FY_CODE}/${FIXED_INV}/00000`;
      const lastSeq = parseSeq(base);
      const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
      const next = formatInvoiceNo(COMPANY_CODE, FY_CODE, nextSeq);
      setInvoiceNo(next);
      setLastKnown(next);
      toast.success(`Reserved ${next}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to reserve invoice number");
    }
  };

  /* ---------- Build preview (INR-native) ---------- */
  const generatePreview = async ({ silent } = { silent: false }) => {
    const run = async () => {
      if (selected.length === 0 && manualLines.length === 0) {
        throw new Error("Add products or manual lines");
      }

      // 1) Expand BOM picks with exact qty (+overage%) × product qty
      const picks = selected.filter((r) => r.product_id && Number(r.qty) > 0);
      let bomRows = [];
      if (picks.length > 0) {
        const productIds = picks.map((r) => r.product_id);
        const { data: rows, error } = await supabase
          .from("product_bom")
          .select(`product_id,material_id,qty,unit,overage_pct,
                   materials:materials!product_bom_material_fk(code,name,unit,rate),
                   product:products!product_bom_product_fk(sku,name)`)
          .in("product_id", productIds);
        if (error) throw error;

        const matMap = new Map(materials.map((m) => [m.id, m]));
        for (const pick of picks) {
          const these = (rows || []).filter((x) => x.product_id === pick.product_id);
          for (const r of these) {
            const mat = r.materials || matMap.get(r.material_id) || {};
            const base = Number(r.qty || 0);
            const over = Number(r.overage_pct || 0);
            const scaled = base * Number(pick.qty || 0);
            const reqQty = over ? scaled * (1 + over / 100) : scaled; // 👈 exact BOM qty (+overage)
            bomRows.push({
              material_id: r.material_id,
              material_code: mat.code || "",
              material_name: mat.name || "",
              unit: r.unit || mat.unit || "",
              total_qty: reqQty,
              rate: Number(mat.rate || 0), // INR
            });
          }
        }
      }

      // 2) Expand manual materials
      const manualExpanded = manualLines
        .filter((x) => x.material_id && Number(x.qty) > 0)
        .map((x) => {
          const m = materials.find((mm) => mm.id === x.material_id);
          return {
            material_id: x.material_id,
            material_code: m?.code || "",
            material_name: m?.name || "",
            unit: x.unit || m?.unit || "",
            total_qty: Number(x.qty || 0),
            rate: Number(x.rate || 0), // INR
          };
        });

      // 3) Merge by material
      const byId = new Map();
      for (const row of [...bomRows, ...manualExpanded]) {
        const ex = byId.get(row.material_id);
        if (!ex) byId.set(row.material_id, { ...row });
        else {
          const qty = Number(ex.total_qty || 0) + Number(row.total_qty || 0);
          const rate = Number(ex.rate || 0) || Number(row.rate || 0);
          byId.set(row.material_id, { ...ex, total_qty: qty, rate });
        }
      }

      const final = [...byId.values()].map((r) => ({
        ...r,
        total_cost: Number(r.rate || 0) * Number(r.total_qty || 0), // INR
        include: true,
      }));

      if (final.length === 0) throw new Error("Nothing to preview");
      setPreviewRows(final);
      return true;
    };

    if (silent) {
      try { await run(); } catch {/* quiet */ }
    } else {
      await toast.promise(run(), {
        loading: "Building preview…",
        success: "Preview ready",
        error: (e) => e.message || "Failed to generate preview",
      });
    }
  };

  /* Auto preview when user picks/changes */
  const autoTimer = useRef(null);
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (
      selected.some((r) => r.product_id && Number(r.qty) > 0) ||
      manualLines.some((x) => x.material_id && Number(x.qty) > 0)
    ) {
      autoTimer.current = setTimeout(() => generatePreview({ silent: true }), 300);
    } else {
      setPreviewRows([]);
    }
    return () => autoTimer.current && clearTimeout(autoTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, manualLines]);

  /* Inline edit helpers in preview (INR) */
  const updatePreviewQty = (id, val) =>
    setPreviewRows((rows) =>
      rows.map((r) =>
        r.material_id === id
          ? { ...r, total_qty: Number(val || 0), total_cost: Number(val || 0) * Number(r.rate || 0) }
          : r
      )
    );

  const updatePreviewRate = (id, val) =>
    setPreviewRows((rows) =>
      rows.map((r) =>
        r.material_id === id
          ? { ...r, rate: Number(val || 0), total_cost: Number(val || 0) * Number(r.total_qty || 0) }
          : r
      )
    );

  /* Include toggles */
  const setInclude = (material_id, checked) =>
    setPreviewRows((rows) =>
      rows.map((r) =>
        r.material_id === material_id ? { ...r, include: checked } : r
      )
    );

  const includedRows = useMemo(
    () => previewRows.filter((r) => r.include),
    [previewRows]
  );

  const previewSubtotal = useMemo(
    () => includedRows.reduce((s, r) => s + Number(r.total_cost || 0), 0), // INR
    [includedRows]
  );
  const displaySubtotal = useMemo(
    () => inDisplay(previewSubtotal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewSubtotal, currency, fxRate]
  );

  /* Alignment helpers */
  const isAlignedMaterialVendor = (matId, vId) => {
    const set = matVendorMap.get(matId);
    return !!(set && set.has(vId));
  };

  const missingAlignment = useMemo(() => {
    if (!vendorId) return [];
    return includedRows.filter((r) => !isAlignedMaterialVendor(r.material_id, vendorId));
  }, [includedRows, vendorId, matVendorMap]);

  const refreshAlignments = async () =>
    toast.promise(
      (async () => {
        const { data, error } = await supabase
          .from("material_vendors")
          .select("material_id,vendor_id");
        if (error) throw error;
        const map = new Map();
        (data || []).forEach((r) => {
          if (!map.has(r.material_id)) map.set(r.material_id, new Set());
          map.get(r.material_id).add(r.vendor_id);
        });
        setMatVendorMap(map);
      })(),
      { loading: "Refreshing alignments…", success: "Alignments refreshed", error: "Failed to refresh alignments" }
    );

  const loadAlignmentForMaterial = (matId) => {
    setAlignMatId(matId);
    const set = matVendorMap.get(matId) || new Set();
    setAlignChoices(new Set([...set]));
  };

  const applyAlignmentForMaterial = async () =>
    toast.promise(
      (async () => {
        if (!alignMatId) throw new Error("Pick a material");
        const targetVendorIds = [...alignChoices];
        const inserts = targetVendorIds.map((vid) => ({ material_id: alignMatId, vendor_id: vid }));
        if (inserts.length === 0) return;
        const { error } = await supabase
          .from("material_vendors")
          .upsert(inserts, { onConflict: "material_id,vendor_id" });
        if (error) throw error;
        await loadMasters();
      })(),
      { loading: "Saving alignment…", success: "Alignment saved", error: "Failed to save alignment" }
    );

  const alignSelectedVendorToIncluded = async () =>
    toast.promise(
      (async () => {
        if (!vendorId) throw new Error("Select vendor");
        if (includedRows.length === 0) throw new Error("No rows included");
        const inserts = includedRows.map((r) => ({ material_id: r.material_id, vendor_id: vendorId }));
        const { error } = await supabase
          .from("material_vendors")
          .upsert(inserts, { onConflict: "material_id,vendor_id" });
        if (error) throw error;
        await loadMasters();
      })(),
      { loading: "Aligning vendor…", success: "Aligned vendor to all included materials", error: "Failed to align vendor" }
    );

  /* Allowed vendors for current selection (header gating) */
  const hasScope = useMemo(
    () =>
      selected.some((r) => r.product_id && Number(r.qty) > 0) ||
      manualLines.some((x) => x.material_id && Number(x.qty) > 0) ||
      includedRows.length > 0, // 👈 also consider loaded invoice rows
    [selected, manualLines, includedRows]
  );

  const getSelectedMaterialIds = async () => {
    const manualIds = manualLines
      .filter((x) => x.material_id && Number(x.qty) > 0)
      .map((x) => x.material_id);

    // also include from preview (important for edit mode)
    const fromPreview = includedRows.map((r) => r.material_id);

    const picks = selected.filter((r) => r.product_id && Number(r.qty) > 0);
    if (picks.length === 0) return [...new Set([...manualIds, ...fromPreview])];

    const prodIds = picks.map((r) => r.product_id);
    const { data, error } = await supabase
      .from("product_bom")
      .select("material_id,product_id")
      .in("product_id", prodIds);
    if (error) {
      console.error(error);
      return [...new Set([...manualIds, ...fromPreview])];
    }
    const bomIds = (data || []).map((r) => r.material_id);
    return [...new Set([...manualIds, ...fromPreview, ...bomIds])];
  };

  useEffect(() => {
    (async () => {
      try {
        setLoadingAllowed(true);
        const matIds = await getSelectedMaterialIds();
        if (matIds.length === 0) {
          setAllowedVendorIds(new Set());
          if (vendorId) setVendorId("");
          setLoadingAllowed(false);
          return;
        }
        const { data, error } = await supabase
          .from("material_vendors")
          .select("material_id,vendor_id")
          .in("material_id", matIds);
        if (error) throw error;

        const counts = new Map();
        for (const r of data || []) {
          counts.set(r.vendor_id, (counts.get(r.vendor_id) || 0) + 1);
        }
        const allow = new Set(
          [...counts.entries()]
            .filter(([, c]) => c >= matIds.length)
            .map(([vid]) => vid)
        );
        setAllowedVendorIds(allow);
        if (vendorId && !allow.has(vendorId)) setVendorId("");
        if (allow.size === 0 && hasScope) setShowAllVendors(true);
      } catch (e) {
        console.error(e);
        toast.error("Failed to compute aligned vendors");
      } finally {
        setLoadingAllowed(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, manualLines, materials, hasScope, includedRows.length]);

  useEffect(() => {
    if (missingAlignment.length > 0) setShowAlignTool(true);
  }, [missingAlignment.length]);

  /* Per-row editor open/save */
  const openRowEditor = (row) => {
    setEditingRowId(row.material_id);
    const alignedSet = matVendorMap.get(row.material_id) || new Set();
    const alignedCount = alignedSet.size || 0;
    setRowShowAll(alignedCount === 0);
    if (vendorId && alignedSet.has(vendorId)) setRowVendorId(vendorId);
    else if (alignedCount === 1) setRowVendorId([...alignedSet][0]);
    else setRowVendorId("");
  };

  const saveRowAlignment = async ({ setAsInvoiceVendor = false } = {}) =>
    toast.promise(
      (async () => {
        if (!editingRowId) throw new Error("No row in edit");
        if (!rowVendorId) throw new Error("Choose a vendor");
        const payload = { material_id: editingRowId, vendor_id: rowVendorId };
        const { error } = await supabase
          .from("material_vendors")
          .upsert([payload], { onConflict: "material_id,vendor_id" });
        if (error) throw error;
        if (setAsInvoiceVendor) setVendorId(rowVendorId);
        await refreshAlignments();
        setEditingRowId(null);
      })(),
      {
        loading: "Saving…",
        success: setAsInvoiceVendor ? "Aligned & set as invoice vendor" : "Alignment saved",
        error: "Failed to save alignment",
      }
    );

  /* ---------- Save invoice (header + lines) — INR-native ---------- */
  const saveInvoice = async () =>
    toast.promise(
      (async () => {
        if (!vendorId) throw new Error("Select vendor");
        if (includedRows.length === 0) throw new Error("Include at least one material");
        if (missingAlignment.length > 0) throw new Error("Align vendor to all included materials first");

        // Allocate or reuse an invoice number
        let invNo = invoiceNo;
        if (!invNo) {
          const { data, error } = await supabase.rpc("allocate_invoice_no", {
            in_company_code: COMPANY_CODE,
            in_fy_code: FY_CODE,
          });
          if (error) throw error;
          invNo = data;
          setInvoiceNo(data);
        }

        // reliable UID at save-time
        const { data: uNow } = await supabase.auth.getUser();
        const uidNow = uNow?.user?.id || me.id || null;

        // vendor snapshot
        const vend = await supabase
          .from("vendors")
          .select("id,name,email,phone")
          .eq("id", vendorId)
          .maybeSingle();
        if (vend.error) throw vend.error;
        if (!vend.data) throw new Error("Vendor not found");
        const snapshot = {
          id: vend.data.id, name: vend.data.name,
          email: vend.data.email, phone: vend.data.phone,
        };

        let invId = null;

        if (savedInvoiceId) {
          const { data: curRow, error: curErr } = await supabase
            .from("invoices")
            .select("created_by")
            .eq("id", savedInvoiceId)
            .single();
          if (curErr) throw curErr;
          invId = savedInvoiceId;
          const hdrPayload = {
            invoice_no: invNo, company_code: COMPANY_CODE, fy_code: FY_CODE,
            vendor_id: vendorId, vendor_snapshot: snapshot, status: "Verified",
            ...(curRow?.created_by ? {} : { created_by: uidNow }),
          };
          const hdr = await supabase.from("invoices").update(hdrPayload).eq("id", invId);
          if (hdr.error) throw hdr.error;
        } else {
          const existing = await supabase
            .from("invoices")
            .select("id,invoice_no,created_by")
            .eq("invoice_no", invNo)
            .maybeSingle();
          if (existing.error) throw existing.error;

          if (existing.data?.id) {
            invId = existing.data.id;
            const hdrPayload = {
              invoice_no: invNo, company_code: COMPANY_CODE, fy_code: FY_CODE,
              vendor_id: vendorId, vendor_snapshot: snapshot, status: "Verified",
              ...(existing.data.created_by ? {} : { created_by: uidNow }),
            };
            const hdr = await supabase.from("invoices").update(hdrPayload).eq("id", invId);
            if (hdr.error) throw hdr.error;
          } else {
            const ins = await supabase
              .from("invoices")
              .insert([{ invoice_no: invNo, company_code: COMPANY_CODE, fy_code: FY_CODE,
                         vendor_id: vendorId, vendor_snapshot: snapshot, status: "Verified",
                         tax: 0, total: 0, created_by: uidNow }])
              .select("id").single();
            if (ins.error) throw ins.error;
            invId = ins.data.id;
          }
        }

        // lines: delete then insert
        const del = await supabase.from("invoice_lines").delete().eq("invoice_id", invId);
        if (del.error) throw del.error;

        const lines = includedRows.map((r, idx) => ({
          invoice_id: invId,
          line_no: idx + 1,
          material_id: r.material_id,
          description: r.material_name,
          unit: r.unit,
          qty: r.total_qty,
          rate: r.rate, // INR
          amount: r.total_cost, // INR
        }));
        if (lines.length > 0) {
          const insl = await supabase.from("invoice_lines").insert(lines);
          if (insl.error) throw insl.error;
        }

        const upd = await supabase
          .from("invoices")
          .update({ tax: 0, total: previewSubtotal })
          .eq("id", invId);
        if (upd.error) throw upd.error;

        setSavedInvoiceId(invId);
        await loadInvoiceList();
        return invId;
      })(),
      {
        loading: "Saving invoice…",
        success: (id) => `Invoice ${invoiceNo || "(allocated)"} saved`,
        error: (e) => e.message || "Failed to save invoice",
      }
    );

  /* ---------- Edit/Delete/Quick Edit ---------- */
  const editInvoice = async (invoiceId) =>
    toast.promise(
      (async () => {
        if (!isUuid(invoiceId)) throw new Error("Invalid invoice id");
        // header
        const { data: hdr, error: he } = await supabase
          .from("invoices")
          .select("id,invoice_no,vendor_id,vendor_snapshot,status,total,created_at")
          .eq("id", invoiceId)
          .single();
        if (he) throw he;

        // lines
        const { data: lines, error: le } = await supabase
          .from("invoice_lines")
          .select("material_id,description,unit,qty,rate,amount,material:materials(code,name)")
          .eq("invoice_id", invoiceId)
          .order("line_no", { ascending: true });
        if (le) throw le;

        // hydrate into previewRows format
        const rows = (lines || []).map((r) => ({
          material_id: r.material_id,
          material_code: r.material?.code || "",
          material_name: r.description || r.material?.name || "",
          unit: r.unit || "",
          total_qty: Number(r.qty || 0),
          rate: Number(r.rate || 0),
          total_cost: Number(r.amount || 0),
          include: true,
        }));

        // populate editor
        setVendorId(hdr.vendor_id || "");
        setInvoiceNo(hdr.invoice_no || "");
        setSavedInvoiceId(hdr.id);
        setSelected([]); // clear pickers; we're in edit mode with concrete rows
        setManualLines([]);
        setPreviewRows(rows);
        setShowAllVendors(true); // allow switching even if not fully aligned
        setEditorOpen(true); // 🔓 open hidden editor
        return hdr.invoice_no;
      })(),
      { loading: "Loading invoice…", success: (no) => `Loaded ${no}`, error: (e) => e.message || "Failed to load" }
    );

  const deleteInvoice = async (invoiceId, invNo) => {
    const go = confirm(`Delete invoice ${invNo || invoiceId}?`);
    if (!go) return;
    await toast.promise(
      (async () => {
        if (!isUuid(invoiceId)) throw new Error("Invalid invoice id");
        await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);
        const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
        if (error) throw error;
        if (savedInvoiceId === invoiceId) {
          resetEditor();
          setEditorOpen(false);
        }
        await loadInvoiceList();
      })(),
      { loading: "Deleting…", success: "Invoice deleted", error: (e) => e.message || "Delete failed" }
    );
  };

  const resetEditor = () => {
    setVendorId("");
    setInvoiceNo("");
    setSavedInvoiceId(null);
    setSelected([]);
    setManualLines([]);
    setPreviewRows([]);
    setEditingRowId(null);
    setRowVendorId("");
    setShowAllVendors(false);
  };

  /* RPC: Create PO from saved invoice */
  const createPOFromInvoice = async (invoiceId) =>
    toast.promise(
      (async () => {
        if (!isUuid(invoiceId)) throw new Error("Invalid invoice id");
        const { data, error, status } = await supabase.rpc(
          "create_po_from_invoice",
          { inv_id: invoiceId, in_company_code: COMPANY_CODE, in_fy_code: FY_CODE }
        );
        if (error) {
          console.error("RPC create_po_from_invoice failed", { status, code: error.code, message: error.message, details: error.details, hint: error.hint });
          throw new Error(error.details || error.message || "RPC failed");
        }
        const rec = Array.isArray(data) ? data[0] : data;
        if (!rec?.po_id) throw new Error("PO creation failed: no po_id");
        nav(`/procurement/purchase-order/${rec.po_id}`);
        return rec.po_no;
      })(),
      { loading: "Creating PO…", success: (poNo) => `PO ${poNo} created`, error: (e) => e.message || "Failed to create PO" }
    );

  const saveAndCreatePO = async () => {
    const invId = savedInvoiceId || (await saveInvoice());
    if (!invId) return;
    await createPOFromInvoice(invId);
  };

  /* Email vendor (stub) */
  const emailVendor = () => {
    if (!vendorId || includedRows.length === 0) return toast.error("Select vendor & generate preview");
    if (missingAlignment.length > 0) return toast.error("Align vendor to all included materials first");
    toast.success("Invoice draft prepared. (Email wiring pending)");
  };

  /* ------- helpers for UI badges in preview alignment column ------- */
  const RowStatusChip = ({ row }) => {
    if (!vendorId) return <Chip color="gray">No vendor selected</Chip>;
    const aligned = isAlignedMaterialVendor(row.material_id, vendorId);
    if (aligned) return <Chip color="green"><CheckCircle2 className="w-3 h-3" /> Aligned</Chip>;
    return <Chip color="amber"><ShieldAlert className="w-3 h-3" /> Not aligned</Chip>;
  };

  /* ---------- Quick Edit palette actions ---------- */
  const quickGo = async () => {
    const byInv =
      quickInvoice &&
      invList.find((r) => r.invoice_no.toLowerCase() === quickInvoice.toLowerCase());
    if (byInv) {
      setQuickOpen(false);
      await editInvoice(byInv.id);
      return;
    }
    if (quickVendor) {
      const name = quickVendor.toLowerCase();
      const matches = invList.filter((r) => (r.vendor_name || "").toLowerCase() === name);
      const row =
        matches[0] ||
        invList.find((r) => (r.vendor_name || "").toLowerCase().includes(name));
      if (row) {
        setQuickOpen(false);
        await editInvoice(row.id);
        return;
      }
    }
    toast.error("Pick a vendor or invoice from the list");
  };

  const pageVendorNames = useMemo(
    () => [...new Set(invList.map((r) => r.vendor_name).filter(Boolean))],
    [invList]
  );
  const pageInvoiceNos = useMemo(
    () => invList.map((r) => r.invoice_no),
    [invList]
  );

  /* =======================================================
     UI (centered container; tables scroll instead of overflowing)
  ======================================================= */
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-4 md:py-6 space-y-4">
      {/* Branded header */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-blue-900/10">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-4 flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6" />
          <div>
            <h1 className="text-lg md:text-xl font-semibold">Invoice Management</h1>
            <div className="text-xs md:text-sm opacity-90">
              BOM-driven & direct materials · inline editing · find/edit/save
            </div>
          </div>
          <div className="ml-auto text-xs md:text-sm flex items-center gap-3">
            <Chip color="indigo">
              <UserCircle2 className="w-3.5 h-3.5" />
              {me.fullName || "—"}
            </Chip>
            <Chip color="blue">#{invoiceNo || "no number reserved"}</Chip>
            {savedInvoiceId ? <Chip color="green">Saved</Chip> : null}
          </div>
        </div>

        {/* ---------- Find / Edit ---------- */}
        <Card className="p-4 border-0 rounded-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-600" />
              <div className="font-semibold text-blue-900">Find / Edit Invoices</div>
              <Chip color="gray">List</Chip>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuickOpen(true)}
                className="gap-1"
                title="Quick Edit palette"
              >
                <Edit2 className="w-3 h-3 text-blue-600" />
                Quick Edit
              </Button>
              <Button size="sm" onClick={openNewInvoice} className="gap-1">
                <Plus className="w-3 h-3" /> New Invoice
              </Button>
              {editorOpen && (
                <Button size="sm" variant="outline" onClick={closeEditor} className="gap-1">
                  <EyeOff className="w-3 h-3 text-blue-600" /> Close Editor
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
              <Input
                className="pl-9"
                placeholder="Search by invoice number…"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadInvoiceList()}
              />
            </div>

            {/* Datalist filters */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-700" />
              <input
                list="statusList"
                className="border rounded px-9 py-2 w-full bg-white"
                placeholder="Status (datalist)…"
                value={invStatus}
                onChange={(e) => setInvStatus(e.target.value)}
              />
              <datalist id="statusList">
                {["Verified","Draft","Cancelled"].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-700" />
              <input
                list="vendorListAll"
                className="border rounded px-9 py-2 w-full bg-white"
                placeholder="Filter by vendor (datalist)…"
                value={invVendorFilter}
                onChange={(e) => setInvVendorFilter(e.target.value)}
              />
              <datalist id="vendorListAll">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFinder((s) => !s)}
                className="gap-1"
              >
                <EyeOff className="w-4 h-4 text-blue-600" />
                {showFinder ? "Hide" : "Show"}
              </Button>
              <Button
                variant="outline"
                onClick={loadInvoiceList}
                disabled={listLoading}
                className="gap-1"
              >
                <RefreshCw className="w-4 h-4 text-blue-600" /> Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setInvSearch("");
                  setInvStatus("");
                  setInvVendorFilter("");
                  loadInvoiceList();
                }}
                className="gap-1"
              >
                <RefreshCw className="w-4 h-4 text-emerald-700" /> Clear Filters
              </Button>
            </div>
          </div>

          {showFinder && (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-left p-2">Invoice</th>
                    <th className="text-left p-2">Vendor</th>
                    <th className="text-right p-2 w-28">Total (INR)</th>
                    <th className="text-left p-2 w-28">Status</th>
                    <th className="text-left p-2 w-48">Created by</th>
                    <th className="text-left p-2 w-44">When</th>
                    <th className="text-left p-2 w-44">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`s-${i}`}>
                        <td className="p-2"><Skeleton className="h-4 w-36" /></td>
                        <td className="p-2"><Skeleton className="h-4 w-40" /></td>
                        <td className="p-2 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                        <td className="p-2"><Skeleton className="h-5 w-20 rounded-full" /></td>
                        <td className="p-2"><Skeleton className="h-4 w-32" /></td>
                        <td className="p-2"><Skeleton className="h-4 w-36" /></td>
                        <td className="p-2"><Skeleton className="h-8 w-28" /></td>
                      </tr>
                    ))}
                  {!listLoading && invList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center opacity-60">
                        No invoices found
                      </td>
                    </tr>
                  )}
                  {!listLoading &&
                    invList.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-mono">{r.invoice_no}</td>
                        <td className="p-2">{r.vendor_name}</td>
                        <td className="p-2 text-right font-mono">{money3(r.total)}</td>
                        <td className="p-2">
                          <Chip color="blue">{r.status || "Verified"}</Chip>
                        </td>
                        <td className="p-2">{r.created_by_name}</td>
                        <td className="p-2">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editInvoice(r.id)}
                              className="gap-1 inline-flex"
                            >
                              <Edit2 className="w-3 h-3 text-blue-600" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteInvoice(r.id, r.invoice_no)}
                              className="gap-1 inline-flex"
                            >
                              <Trash2 className="w-3 h-3 text-rose-600" /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ---------- Editor Card (hidden until New/Edit) ---------- */}
      {editorOpen && (
        <Card className="p-4 space-y-4">
          {/* Header controls */}
          {loading ? (
            <div className="grid md:grid-cols-3 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Vendor block */}
              <div>
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  Vendor
                </Label>

                {!hasScope ? (
                  <div className="px-3 py-2 border rounded text-sm opacity-70">
                    Select products/materials to proceed
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                      <select
                        className="border rounded px-9 py-2 w-full bg-white"
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                      >
                        <option value="">Select vendor</option>
                        {(allowedVendorIds.size > 0 && !showAllVendors
                          ? vendors.filter((v) => allowedVendorIds.has(v.id))
                          : vendors
                        ).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {allowedVendorIds.size > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setShowAllVendors((s) => !s)}
                        disabled={loadingAllowed}
                        className="whitespace-nowrap"
                      >
                        {showAllVendors ? "Show aligned only" : "Show all vendors"}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      onClick={refreshAlignments}
                      title="Reload links"
                      className="px-3"
                    >
                      <RefreshCw className="w-4 h-4 text-blue-600" />
                    </Button>

                    <Button
                      variant="outline"
                      title="New Vendor"
                      onClick={() => setShowNewVendor(true)}
                      className="px-3"
                    >
                      <UserPlus className="w-4 h-4 text-blue-600" />
                    </Button>
                  </div>
                )}

                {!!vendorId && (
                  <div className="mt-2 text-xs flex items-center gap-2">
                    {missingAlignment.length === 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" /> Aligned for all included materials
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <ShieldAlert className="w-4 h-4" /> Missing for {missingAlignment.length} material(s)
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={alignSelectedVendorToIncluded}
                      className="gap-1"
                    >
                      <LinkIcon className="w-3 h-3 text-blue-600" /> Align to included
                    </Button>
                  </div>
                )}
              </div>

              {/* Company/FY + Currency */}
              <div className="space-y-2">
                <div>
                  <Label className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    Company / FY
                  </Label>
                  <div className="flex gap-2">
                    <Input readOnly value={COMPANY_CODE} />
                    <Input readOnly value={FY_CODE} />
                  </div>
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-violet-600" />
                    Display Currency & As-Of
                  </Label>
                  <div className="flex gap-2">
                    <select
                      className="border rounded px-2 py-2 bg-white"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                    <Button
                      variant="outline"
                      onClick={refreshFx}
                      disabled={fxLoading}
                      className="gap-1"
                      title="Refresh FX"
                    >
                      <RefreshCw className={`w-4 h-4 ${fxLoading ? "animate-spin" : ""} text-violet-700`} />
                      FX
                    </Button>
                  </div>
                  <div className="text-[11px] mt-1 opacity-70">
                    {currency==="INR" ? "Showing INR values (no conversion)." : `1 ${currency} = ${money6(fxRate)} INR`}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => generatePreview({ silent: false })}
                  className="gap-1"
                >
                  <Save className="w-4 h-4 text-blue-600" /> Generate Preview
                </Button>
                <Button
                  variant="outline"
                  onClick={saveInvoice}
                  disabled={!vendorId || previewRows.length === 0}
                  className="gap-1"
                >
                  <Save className="w-4 h-4 text-blue-600" /> Save Invoice
                </Button>
                <Button
                  onClick={saveAndCreatePO}
                  disabled={!vendorId || previewRows.length === 0}
                  className="gap-1 bg-blue-600 hover:bg-blue-700"
                >
                  <ClipboardCheck className="w-4 h-4" /> Create PO (RPC)
                </Button>
              </div>
            </div>
          )}

          {/* Products (BOM) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold flex items-center gap-2">
                <PackageOpen className="w-4 h-4 text-blue-600" /> Products (BOM-based)
              </h2>
              <Button variant="outline" onClick={addProduct} className="gap-1">
                <Plus className="w-4 h-4 text-blue-600" /> Add Product
              </Button>
            </div>
            <Card className="p-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-left p-2">Product</th>
                    <th className="text-right p-2 w-28">Qty</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center opacity-60">No products</td></tr>
                  )}
                  {selected.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">
                        <div className="relative min-w-[260px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                          <select
                            className="border rounded px-8 py-1 w-full bg-white"
                            value={r.product_id || ""}
                            onChange={(e) => onPickProduct(idx, e.target.value)}
                          >
                            <option value="">Select product</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="p-2 w-28 text-right">
                        <Input
                          type="number" min={0} step="0.001"
                          value={r.qty || 0}
                          onChange={(e) => updateProduct(idx, { qty: Number(e.target.value) })}
                          className="text-right"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => removeProduct(idx)} title="Delete">
                          <Trash2 className="w-4 h-4 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Manual lines */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold flex items-center gap-2">
                <PackageOpen className="w-4 h-4 text-blue-600" /> Manual Materials (Direct)
              </h2>
              <Button variant="outline" onClick={addManualLine} className="gap-1">
                <Plus className="w-4 h-4 text-blue-600" /> Add Material
              </Button>
            </div>
            <Card className="p-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-left p-2">Material</th>
                    <th className="text-left p-2 w-24">Unit</th>
                    <th className="text-right p-2 w-28">Qty</th>
                    <th className="text-right p-2 w-32">Rate (INR)</th>
                    <th className="text-right p-2 w-32">Amount (INR)</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {manualLines.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center opacity-60">No manual lines</td></tr>
                  )}
                  {manualLines.map((r, idx) => {
                    const amount = Number(r.qty || 0) * Number(r.rate || 0); // INR
                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          <div className="relative min-w-[260px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                            <select
                              className="border rounded px-8 py-1 w-full bg-white"
                              value={r.material_id || ""}
                              onChange={(e) => onPickManualMaterial(idx, e.target.value)}
                            >
                              <option value="">Select material</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
                              ))}
                            </select>
                          </div>
                          {!!vendorId && r.material_id && (
                            <div className="mt-1 text-xs flex items-center gap-1">
                              {isAlignedMaterialVendor(r.material_id, vendorId)
                                ? <Chip color="green">Aligned to vendor</Chip>
                                : <Chip color="amber"><ShieldAlert className="w-3 h-3" /> Not aligned</Chip>}
                            </div>
                          )}
                        </td>
                        <td className="p-2 w-24">
                          <Input
                            value={r.unit || ""}
                            onChange={(e) => updateManualLine(idx, { unit: e.target.value })}
                          />
                        </td>
                        <td className="p-2 w-28 text-right">
                          <Input
                            type="number" min={0} step="0.001"
                            value={r.qty || 0}
                            onChange={(e) => updateManualLine(idx, { qty: Number(e.target.value) })}
                            className="text-right"
                          />
                        </td>
                        <td className="p-2 w-32 text-right">
                          <Input
                            type="number" min={0} step="0.001"
                            value={r.rate || 0}
                            onChange={(e) => updateManualLine(idx, { rate: Number(e.target.value) })}
                            className="text-right"
                          />
                          {currency!=="INR" && (
                            <div className="text-[11px] opacity-70 mt-1">
                              ≈ {currency} {money3(inDisplay(r.rate))}
                            </div>
                          )}
                        </td>
                        <td className="p-2 w-32 text-right font-mono">
                          {money3(amount)}
                          {currency!=="INR" && (
                            <div className="text-[11px] opacity-70">
                              ≈ {currency} {money3(inDisplay(amount))}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <Button size="icon" variant="ghost" onClick={() => removeManualLine(idx)} title="Delete">
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => generatePreview({ silent: false })} className="gap-1">
              <Save className="w-4 h-4" /> Generate Preview
            </Button>
            <Button
              variant="outline"
              onClick={saveInvoice}
              disabled={!vendorId || previewRows.length === 0}
              className="gap-1"
            >
              <Save className="w-4 h-4 text-blue-600" /> Save Invoice
            </Button>
            <Button
              onClick={saveAndCreatePO}
              disabled={!vendorId || previewRows.length === 0}
              className="gap-1 bg-blue-600 hover:bg-blue-700"
            >
              <ClipboardCheck className="w-4 h-4" /> Create PO (RPC)
            </Button>
            <Button variant="outline" onClick={emailVendor} className="gap-1">
              <Mail className="w-4 h-4 text-blue-600" /> Email Vendor
            </Button>
            <Button variant="outline" onClick={reserveInvoiceNumber} className="gap-1">
              <Save className="w-4 h-4 text-indigo-700" /> Reserve No.
            </Button>
          </div>

          {/* Preview table */}
          <Card className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="p-2 w-10">Use</th>
                  <th className="text-left p-2">Material</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-left p-2 w-20">Unit</th>
                  <th className="text-right p-2 w-28">Qty</th>
                  <th className="text-right p-2 w-32">Rate (INR)</th>
                  <th className="text-right p-2 w-32">Amount (INR)</th>
                  <th className="text-left p-2 w-[360px]">Alignment</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center opacity-60">
                      No preview
                    </td>
                  </tr>
                )}
                {previewRows.map((r) => {
                  const amtDisplay = inDisplay(r.total_cost);
                  return (
                    <tr key={r.material_id} className="border-t align-top">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!r.include}
                          onChange={(e) => setInclude(r.material_id, e.target.checked)}
                        />
                      </td>
                      <td className="p-2 font-mono">{r.material_code}</td>
                      <td className="p-2">{r.material_name}</td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2 w-28 text-right">
                        <Input
                          type="number" min={0} step="0.001"
                          value={r.total_qty}
                          onChange={(e) => updatePreviewQty(r.material_id, e.target.value)}
                          className="text-right"
                        />
                      </td>
                      <td className="p-2 w-32 text-right">
                        <Input
                          type="number" min={0} step="0.001"
                          value={r.rate}
                          onChange={(e) => updatePreviewRate(r.material_id, e.target.value)}
                          className="text-right"
                        />
                        {currency!=="INR" && (
                          <div className="text-[11px] opacity-70 mt-1">
                            ≈ {currency} {money3(inDisplay(r.rate))}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {money3(r.total_cost)}
                        {currency!=="INR" && (
                          <div className="text-[11px] opacity-70">
                            ≈ {currency} {money3(amtDisplay)}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        {editingRowId === r.material_id ? (
                          <div className="space-y-2">
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">Vendor for {r.material_code}</Label>
                                <select
                                  className="border rounded px-2 py-1 w-full bg-white"
                                  value={rowVendorId}
                                  onChange={(e) => setRowVendorId(e.target.value)}
                                >
                                  <option value="">— Select vendor —</option>
                                  {(!rowShowAll
                                    ? vendors.filter((v) =>
                                        (matVendorMap.get(r.material_id) || new Set()).has(v.id)
                                      )
                                    : vendors
                                  ).map((v) => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                  ))}
                                </select>
                                <div className="text-[11px] opacity-70 mt-1">
                                  {(matVendorMap.get(r.material_id) || new Set()).size || 0} aligned vendor(s) ·{" "}
                                  <button className="underline" onClick={() => setRowShowAll((s) => !s)} type="button">
                                    {rowShowAll ? "show aligned only" : "show all vendors"}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveRowAlignment({ setAsInvoiceVendor: false })} className="gap-1">
                                <Save className="w-3 h-3" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => saveRowAlignment({ setAsInvoiceVendor: true })} className="gap-1">
                                <Save className="w-3 h-3 text-blue-600" /> Save & Set Invoice Vendor
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRowId(null)} className="gap-1">
                                <X className="w-3 h-3" /> Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <RowStatusChip row={r} />
                            <Button size="sm" variant="outline" onClick={() => openRowEditor(r)} className="gap-1 inline-flex">
                              <Edit2 className="w-3 h-3 text-blue-600" /> Edit
                            </Button>
                            {!vendorId && <Chip color="gray">Select header vendor to validate</Chip>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5}></td>
                  <td className="p-2 text-right font-semibold">Subtotal</td>
                  <td className="p-2 text-right font-bold">
                    {money3(previewSubtotal)}{" "}
                    {currency!=="INR" && (
                      <span className="text-[11px] opacity-70 ml-1">
                        (≈ {currency} {money3(displaySubtotal)})
                      </span>
                    )}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </Card>
      )}

      {/* Floating Quick Edit palette (hidden by default) */}
      {quickOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQuickOpen(false)} />
          <div className="absolute bottom-6 right-6 w-[320px] bg-white rounded-lg shadow-xl border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Edit2 className="w-4 h-4 text-blue-700" />
              <div className="font-semibold">Quick Edit</div>
              <Chip color="gray">Page vendors</Chip>
              <button className="ml-auto text-sm text-blue-700 inline-flex items-center gap-1" onClick={() => setQuickOpen(false)}>
                Close <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-700" />
                <input
                  list="pageVendors"
                  className="border rounded px-8 py-2 w-full"
                  placeholder="Pick vendor (searchable)…"
                  value={quickVendor}
                  onChange={(e) => setQuickVendor(e.target.value)}
                />
                <datalist id="pageVendors">
                  {pageVendorNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-700" />
                <input
                  list="pageInvoices"
                  className="border rounded px-8 py-2 w-full"
                  placeholder="Or pick invoice no…"
                  value={quickInvoice}
                  onChange={(e) => setQuickInvoice(e.target.value)}
                />
                <datalist id="pageInvoices">
                  {pageInvoiceNos.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <Button className="w-full gap-1" onClick={quickGo}>
                Go <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="text-[11px] opacity-70">Tip: Lists above are populated from the current results table.</div>
            </div>
          </div>
        </div>
      )}

      {/* New Vendor modal (centered) */}
      {showNewVendor && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNewVendor(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] max-w-[94vw] bg-white rounded-xl shadow-xl border p-5">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <div className="font-semibold">Create Vendor</div>
              <button className="ml-auto text-sm text-blue-700 inline-flex items-center gap-1" onClick={() => setShowNewVendor(false)}>
                Close <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label>Name</Label>
                <Input value={newVendor.name} onChange={(e) => setNewVendor((s) => ({...s, name: e.target.value}))} />
              </div>
              <div>
                <Label>Code</Label>
                <Input value={newVendor.code} onChange={(e) => setNewVendor((s) => ({...s, code: e.target.value}))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={newVendor.phone} onChange={(e) => setNewVendor((s) => ({...s, phone: e.target.value}))} />
              </div>
              <div className="md:col-span-2">
                <Label>Email</Label>
                <Input value={newVendor.email} onChange={(e) => setNewVendor((s) => ({...s, email: e.target.value}))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-4">
              <Button onClick={async () => {
                await createVendor();
                setEditorOpen(true);
              }} className="gap-1">
                <UserPlus className="w-4 h-4" /> Create & Select
              </Button>
              <Button variant="outline" onClick={() => setShowNewVendor(false)}>Cancel</Button>
              <Chip color="gray">New vendor will auto-align to included materials (if any).</Chip>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-xs opacity-70 flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Loading masters…
        </div>
      )}
    </div>
  );
};

/* local helper for 6dp FX chip */
const money6 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });

export default InvoiceManagement;
