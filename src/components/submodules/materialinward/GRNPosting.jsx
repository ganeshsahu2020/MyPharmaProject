// src/components/submodules/materialinward/GRNPosting.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

import Button from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/skeleton";

import {
  PackageSearch,
  Search,
  Loader2,
  RefreshCw,
  FileText,
  Eye,
  ArrowLeft,
  Download,
  Printer,
  CheckCircle2,
  ListChecks,
  Truck,
  CalendarDays,
  User2,
  StickyNote,
  Thermometer,
  UserCircle2,
} from "lucide-react";

import { upsertGrnHeader, upsertGrnPostings } from "@/api/grn";
import { fetchWeightForGRN } from "@/api/weightCapture";
import { getUomsByCodes } from "@/api/uoms";

/* -------------------- constants / helpers -------------------- */

const DEBUG_PREFILL = false;

const HEADER_COLS = ["grn_no", "po_no", "invoice_no", "status", "created_by", "created_at"];

const POSTING_COLS = [
  "grn_no","line_no","kind","po_no","po_line_item","invoice_no","invoice_qty",
  "item_code","material_code","vendor_code","vendor_batch_no","uom","net_qty",
  "mfg_date","exp_date","manufacturer","num_containers","transporter_name",
  "lr_no","lr_date","vehicle","prepared_by","remark","inspection_lot_no",
  "sap_batch_no","next_inspection_date","storage_condition","created_at","material_desc",
  "analytica_ref_no",
];

const COMMON_STORAGE =
  "Keep in well closed container and stored at temperature not exceeding 25°C";

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

const todayISO = () =>
  new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

const toYMD = (d) => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ""; }
};

const fmtDate = (d) => {
  try {
    if (!d) return "";
    const x = new Date(d);
    if (isNaN(x)) return d;
    return x.toLocaleDateString();
  } catch { return d || ""; }
};

const csvEscape = (s) =>
  `"${String(s ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;

/** Merge “logistics” style fields from one source into current UI header */
const mergeLogistics = (cur, inc = {}) => ({
  lr_no: inc.lr_no ?? cur.lr_no ?? "",
  lr_date: inc.lr_date ? toYMD(inc.lr_date) : (cur.lr_date || todayISO()),
  vehicle: (inc.vehicle ?? inc.vehicle_no ?? cur.vehicle) || "",
  transporter: (inc.transporter_name ?? inc.transporter ?? cur.transporter) || "",
  driver_name: (inc.driver_name ?? cur.driver_name) || "",
});

/* -------------------- component -------------------- */

const GRNPosting = () => {
  const { session } = useAuth() || {};
  const user = session?.user || null;

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Search / context
  const [poQuery, setPoQuery] = useState("");
  const [poSelected, setPoSelected] = useState("");

  // Invoice handling with toggle
  const [invoiceSelected, setInvoiceSelected] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoiceUseSelect, setInvoiceUseSelect] = useState(false);

  // Header invoice qty (auto from WC; editable)
  const [headerInvoiceQty, setHeaderInvoiceQty] = useState("");

  // Materials (purely from Weight Capture), with local editable fields
  const [materials, setMaterials] = useState([]);

  // UOM mapping: code -> label
  const [uomMap, setUomMap] = useState(new Map());

  // Logistics header fields (UI only)
  const [hdr, setHdr] = useState({
    lr_no: "",
    lr_date: todayISO(),
    vehicle: "",
    transporter: "",
    driver_name: "",
    prepared_by: "",
    remark: "",
  });

  // Storage condition UI
  const [storageMode, setStorageMode] = useState("common"); // common | custom | na
  const [storageText, setStorageText] = useState(COMMON_STORAGE);

  // Prefill info / output
  const [existingGrn, setExistingGrn] = useState(null); // { grn_no?, source? }
  const [showPreview, setShowPreview] = useState(false);
  const [grnResult, setGrnResult] = useState(null);      // { header, rows } — rows include .containers[]
  const previewRef = useRef(null);

  // Posted GRN search/preview
  const [postedBusy, setPostedBusy] = useState(false);
  const [postQ, setPostQ] = useState("");
  const [postFrom, setPostFrom] = useState("");
  const [postTo, setPostTo] = useState("");
  const [postedList, setPostedList] = useState([]);
  const [postedView, setPostedView] = useState({ header: null, rows: [] });

  /* ------------ helpers to support multiple real table names ------------- */

  const trySelect = async (table, selectCols = "*") => {
    try {
      const { error } = await supabase.from(table).select(selectCols).limit(1);
      if (error) throw error;
      return true;
    } catch { return false; }
  };

  const firstExistingTable = useCallback(async (candidates) => {
    for (const t of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await trySelect(t)) return t;
    }
    return null;
  }, []);

  /* ------------ UOM helpers (using src/api/uoms.js) ------------- */

  const fetchUomLabels = useCallback(async (codes) => {
    const want = [...new Set((codes || []).filter(Boolean))];
    if (!want.length) return new Map();
    try {
      const list = await getUomsByCodes(want);
      return new Map(list.map(u => [u.code, u.label || u.name || u.code]));
    } catch (e) {
      console.error("getUomsByCodes failed:", e);
      return new Map();
    }
  }, []);

  const uomLabelFor = useCallback(
    (m) => {
      const codeOrLabel = m?.weight_uom || m?.uom || "";
      if (!codeOrLabel) return "";
      return /^UOM/i.test(codeOrLabel) ? (uomMap.get(codeOrLabel) || codeOrLabel) : codeOrLabel;
    },
    [uomMap]
  );

  const attachUomLabels = useCallback(
    (rows) => rows.map((r) => ({ ...r, _uom_label: uomLabelFor(r) })),
    [uomLabelFor]
  );

  /* ------------ Prefill (logistics) ------------- */

  const enrichFromInboundByLR = async (lrNo) => {
    if (!lrNo) return;
    const table = await firstExistingTable(["inbound_gate_entries", "gate_entry", "gateentry", "gatentry"]);
    if (!table) return;
    try {
      const r = await supabase
        .from(table)
        .select("lr_no, lr_date, vehicle_no, transporter_name, driver_name, created_at")
        .eq("lr_no", lrNo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!r.error && r.data) {
        if (DEBUG_PREFILL) console.info("[prefill] inbound by LR hit", r.data);
        setHdr((h) => mergeLogistics(h, r.data));
      }
    } catch (e) {
      console.error("enrichFromInboundByLR failed", e);
    }
  };

  const findInboundByPOInvoice = async (poNo, invNo) => {
    const table = await firstExistingTable(["inbound_gate_entries", "gate_entry", "gateentry", "gatentry"]);
    if (!table) return null;
    try {
      const { data, error } = await supabase
        .from(table)
        .select("lr_no, lr_date, vehicle_no, transporter_name, driver_name, created_at, po_bundle_json")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      for (const r of rows) {
        const arr = Array.isArray(r.po_bundle_json) ? r.po_bundle_json : [];
        const hit = arr.find((p) => {
          const poMatch = String(p.po_no || "") === String(poNo || "");
          const invMatch =
            String(p.invoice_no || "") === String(invNo || "") ||
            (Array.isArray(p.invoices) && p.invoices.some((iv) => String(iv.invoice_no || "") === String(invNo || "")));
          return poMatch && invMatch;
        });
        if (hit) return r;
      }
    } catch (e) {
      console.error("findInboundByPOInvoice failed", e);
    }
    return null;
  };

  const findVehicleInspection = async (poNo, invNo) => {
    const table = await firstExistingTable(["vehicle_inspections", "vehicleinspection"]);
    if (!table) return null;
    try {
      let q = supabase.from(table).select("lr_no, lr_date, vehicle_no, transporter_name, driver_name, po_no, invoice_no, created_at");
      if (poNo) q = q.eq("po_no", poNo);
      if (invNo) q = q.eq("invoice_no", invNo);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!error && data) return data;
    } catch (e) {
      if (DEBUG_PREFILL) console.error("findVehicleInspection failed", e);
    }
    return null;
  };

  const prefillLogistics = useCallback(async (poNo, invNo) => {
    if (!poNo || !invNo) return;
    try {
      // 1) Preferred consolidated view (if exists)
      let viewHit = null;
      try {
        const v = await supabase
          .from("vw_prefill_logistics_by_po_invoice")
          .select("lr_no, lr_date, vehicle, transporter_name, driver_name, last_grn_no, source")
          .eq("po_no", poNo)
          .eq("invoice_no", invNo)
          .maybeSingle();

        if (!v.error && v.data) viewHit = v.data;
      } catch {
        // view might not exist; fall through
      }

      if (viewHit) {
        if (DEBUG_PREFILL) console.info("[prefill] view hit", viewHit);
        const inc = viewHit;
        setHdr((h) => mergeLogistics(h, inc));
        setExistingGrn(inc.last_grn_no ? { grn_no: inc.last_grn_no, source: inc.source || "prefill_view" } : null);
        return;
      }

      // 2) Last GRN Posting for this PO/Invoice
      const p = await supabase
        .from("grn_postings")
        .select("lr_no, lr_date, vehicle, transporter_name, grn_no, created_at")
        .eq("po_no", poNo)
        .eq("invoice_no", invNo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!p.error && p.data) {
        if (DEBUG_PREFILL) console.info("[prefill] last posting hit", p.data);
        const inc = p.data;
        setHdr((h) => mergeLogistics(h, inc));
        setExistingGrn(inc.grn_no ? { grn_no: inc.grn_no, source: "grn_postings" } : null);

        if (inc.lr_no) await enrichFromInboundByLR(inc.lr_no);
        return;
      }

      // 3) A related Vehicle Inspection row
      const vi = await findVehicleInspection(poNo, invNo);
      if (vi) {
        if (DEBUG_PREFILL) console.info("[prefill] vehicle inspection hit", vi);
        setHdr((h) => mergeLogistics(h, vi));
        return;
      }

      // 4) Inbound Gate Entry containing this PO/Invoice
      const inb = await findInboundByPOInvoice(poNo, invNo);
      if (inb) {
        if (DEBUG_PREFILL) console.info("[prefill] inbound by PO+Invoice hit", inb);
        setHdr((h) => mergeLogistics(h, inb));
        return;
      }
    } catch (e) {
      if (DEBUG_PREFILL) console.error("prefillLogistics failed:", e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hdr.lr_no && !hdr.driver_name) {
      enrichFromInboundByLR(hdr.lr_no);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hdr.lr_no]);

  /* ------------ Direct fetch from Weight Capture ------------- */

  const loadInvoiceOptionsFromWC = useCallback(async (poNo) => {
    try {
      const { data, error } = await supabase
        .from("weight_capture_headers")
        .select("invoice_no, invoice_date")
        .eq("po_no", poNo);

      if (!error && Array.isArray(data)) {
        const uniq = Array.from(
          new Map(
            data
              .filter((x) => x.invoice_no)
              .map((x) => [x.invoice_no, { invoice_no: x.invoice_no, invoice_date: x.invoice_date || "" }])
          ).values()
        );
        return uniq;
      }
    } catch {}

    try {
      const { data } = await supabase
        .from("vw_weight_capture_agg")
        .select("invoice_no, invoice_date")
        .eq("po_no", poNo);
      const uniq = Array.from(
        new Map(
          (data || [])
            .filter((x) => x.invoice_no)
            .map((x) => [x.invoice_no, { invoice_no: x.invoice_no, invoice_date: x.invoice_date || "" }])
        ).values()
      );
      return uniq;
    } catch {
      return [];
    }
  }, []);

  const applyUomLabels = useCallback(async (rows) => {
    const uomCodes = rows.flatMap((m) => [m.weight_uom, m.uom]).filter(Boolean);
    const map = await fetchUomLabels(uomCodes);
    setUomMap(map);
    return attachUomLabels(rows);
  }, [attachUomLabels, fetchUomLabels]);

  const recomputeHeaderInvoiceQty = useCallback(async (poNo, invNo) => {
    try {
      const { headerInvoiceQty } = await fetchWeightForGRN(poNo, invNo);
      setHeaderInvoiceQty(headerInvoiceQty ? String(Number(headerInvoiceQty).toFixed(3)) : "");
    } catch {
      const sum = materials.reduce((a, m) => a + (Number(m.recv_qty || 0) || 0), 0);
      setHeaderInvoiceQty(sum ? String(sum.toFixed(3)) : "");
    }
  }, [materials]);

  /* ------------ Fetch by PO (Weight Capture only) ------------- */

  const fetchByPO = useCallback(
    async (poNo) => {
      const key = (poNo || "").trim();
      if (!key) return toast.error("Enter a PO No.");

      setLoading(true);
      setShowPreview(false);
      setGrnResult(null);
      setExistingGrn(null);

      try {
        setPoSelected(key);

        const invOpts = await loadInvoiceOptionsFromWC(key);
        setInvoiceOptions(invOpts);

        let invoiceNo = (invoiceSelected || "").trim();
        if (invOpts.length === 1) {
          invoiceNo = invOpts[0].invoice_no;
          setInvoiceSelected(invoiceNo);
        } else if (!invoiceNo && invoiceUseSelect && invOpts.length > 0) {
          invoiceNo = invOpts[0].invoice_no;
          setInvoiceSelected(invoiceNo);
        }

        const { data: wcRows, headerInvoiceQty: hdrQty } = await fetchWeightForGRN(key, invoiceNo);

        const mats = await applyUomLabels(
          (wcRows || []).map((m) => ({
            ...m,
            weight_captures: [],
            // NEW fields (editable in UI)
            inspection_lot_no: "",
            analytica_ref_no: "",
          }))
        );

        setMaterials(mats);

        if (invoiceNo) {
          await prefillLogistics(key, invoiceNo);
        }
        setHeaderInvoiceQty(hdrQty ? String(Number(hdrQty).toFixed(3)) : "");

        if (!wcRows || wcRows.length === 0) toast.error("No Weight Capture found for this PO/Invoice");
      } catch (e) {
        console.error(e);
        toast.error("Unable to load PO context from Weight Capture");
        setMaterials([]);
        setExistingGrn(null);
        setInvoiceOptions([]);
        setHeaderInvoiceQty("");
      } finally {
        setLoading(false);
      }
    },
    [
      invoiceSelected,
      invoiceUseSelect,
      loadInvoiceOptionsFromWC,
      prefillLogistics,
      applyUomLabels,
    ]
  );

  useEffect(() => {
    (async () => {
      if (!poSelected) return;
      try {
        const { data: wcRows, headerInvoiceQty: hdrQty } = await fetchWeightForGRN(poSelected, invoiceSelected);
        const mats = await applyUomLabels(
          (wcRows || []).map((m) => ({
            ...m,
            weight_captures: [],
            inspection_lot_no: "",
            analytica_ref_no: "",
          }))
        );
        setMaterials(mats);
        setShowPreview(false);
        setGrnResult(null);
        setExistingGrn(null);

        if (invoiceSelected) {
          prefillLogistics(poSelected, invoiceSelected);
        }
        setHeaderInvoiceQty(hdrQty ? String(Number(hdrQty).toFixed(3)) : "");
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceSelected]);

  /* ---------- item code & numbers ---------- */

  const ensureItemCode = async (material_code) => {
    try {
      const { data, error } = await supabase
        .from("material_item_map")
        .select("item_code, material_code")
        .eq("material_code", material_code)
        .limit(1);
      if (!error && Array.isArray(data) && data[0]) return data[0].item_code;
    } catch {}

    let nextCode = null;
    try {
      const { data } = await supabase.rpc("next_item_code");
      nextCode = data || null;
    } catch {}
    if (!nextCode) {
      nextCode = `ITM${new Date().toISOString().slice(2, 10).replace(/-/g, "")}${Math.floor(Math.random() * 900 + 100)}`;
    }
    try {
      const ins = await supabase.from("material_item_map").insert({ material_code, item_code: nextCode });
      if (!ins.error) return nextCode;
    } catch {}

    return material_code;
  };

  const nextBatchNo = async () => {
    try {
      const { data, error } = await supabase.rpc("next_item_batch_no");
      if (!error && data) return data;
    } catch {}
    return `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const nextInspectionLot = async () => {
    try {
      const { data, error } = await supabase.rpc("next_inspection_lot_no");
      if (!error && data) return data;
    } catch {}
    return `IL-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const nextAnalyticaRefNo = async () => {
    try {
      const { data, error } = await supabase.rpc("next_analytica_ref_no");
      if (!error && data) return data;
    } catch {}
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `AR-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const patchRow = (code, patch) =>
    setMaterials((prev) => prev.map((m) => (m.material_code === code ? { ...m, ...patch } : m)));

  /* ---------- helper: fetch lines + real container splits ---------- */

  const fetchLinesWithContainers = useCallback(async (grnNo) => {
    // summary lines
    const { data: lines, error: linesErr } = await supabase
      .from("grn_postings")
      .select("grn_no,line_no,kind,item_code,material_code,material_desc,uom,net_qty,num_containers,invoice_no,inspection_lot_no,sap_batch_no,analytica_ref_no")
      .eq("grn_no", grnNo)
      .order("line_no", { ascending: true });

    if (linesErr) throw linesErr;

    // per-container splits
    const { data: splits, error: splitsErr } = await supabase
      .from("vw_grn_line_containers")
      .select("grn_no,line_no,kind,container_no,container_index,net_qty,gross_qty,tare_qty,remarks,photo_url")
      .eq("grn_no", grnNo)
      .order("line_no", { ascending: true })
      .order("container_index", { ascending: true });

    if (splitsErr) throw splitsErr;

    // stitch
    const map = new Map();
    (lines || []).forEach(l => map.set(`${l.line_no}|${l.kind}`, { ...l, containers: [] }));
    (splits || []).forEach(c => {
      const k = `${c.line_no}|${c.kind}`;
      if (map.has(k)) map.get(k).containers.push(c);
    });

    const rows = Array.from(map.values()).sort((a, b) => (a.line_no - b.line_no) || a.kind.localeCompare(b.kind));
    return rows;
  }, []);

  /* ---------- build payload for create/post ---------- */

  const buildPayload = async (status = "Draft") => {
    // get a GRN no (only on post/save)
    const nextGRNNo = async () => {
      try {
        const { data, error } = await supabase.rpc("next_grn_no");
        if (!error && data) return data;
      } catch {}
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      return `GRN-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`;
    };

    const grn_no = await nextGRNNo();

    const selectedStorage =
      storageMode === "na"
        ? null
        : (storageMode === "common" ? COMMON_STORAGE : (storageText || "")).trim() || null;

    const header = {
      grn_no,
      po_no: poSelected,
      invoice_no: invoiceSelected,
      status,
      created_by: user?.id || null,
      created_at: new Date().toISOString(),
      _ui: {
        lr_no: hdr.lr_no || null,
        lr_date: hdr.lr_date || null,
        vehicle: hdr.vehicle || null,
        transporter: hdr.transporter || null,
        prepared_by_display: hdr.prepared_by || null,
        remark: hdr.remark || null,
        invoice_qty_header: headerInvoiceQty || null,
      },
    };

    const lines = [];
    let lineCounter = 1;

    for (const m of materials) {
      const goodQty = Number(m.good_qty || 0) || 0;
      const dmgQty = Number(m.damage_qty || 0) || 0;
      const goodCtn = Number(m.good_containers || 0) || 0;
      const dmgCtn = Number(m.damage_containers || 0) || 0;

      const item_code = await ensureItemCode(m.material_code);
      const batchGood = await nextBatchNo();
      const batchDmg = await nextBatchNo();

      // Prefer user's typed values; otherwise auto-generate (per line)
      const manualLot = (m.inspection_lot_no || "").trim() || null;
      const manualAR  = (m.analytica_ref_no || "").trim() || null;

      const lotGood = manualLot || await nextInspectionLot();
      const lotDmg  = manualLot || await nextInspectionLot();

      const arGood  = manualAR  || await nextAnalyticaRefNo();
      const arDmg   = manualAR  || await nextAnalyticaRefNo();

      const uomLabel = m._uom_label || uomLabelFor(m) || null;

      if (goodQty > 0) {
        lines.push({
          grn_no,
          line_no: lineCounter++,
          kind: "GOOD",
          item_code,
          material_code: m.material_code,
          vendor_code: m.vendor_code || null,
          vendor_batch_no: m.vendor_batch_no || m.manufacturer_batch_no || null,
          uom: uomLabel,
          net_qty: goodQty,
          po_no: poSelected,
          po_line_item: m.po_line_item ? Number(m.po_line_item) : null,
          invoice_no: invoiceSelected,
          invoice_qty: headerInvoiceQty ? Number(headerInvoiceQty) : (Number(m.recv_qty || 0) || null),
          mfg_date: m.mfg_date || null,
          exp_date: m.exp_date || null,
          manufacturer: m.manufacturer || null,
          num_containers: goodCtn,
          transporter_name: hdr.transporter || null,
          lr_no: hdr.lr_no || null,
          lr_date: hdr.lr_date || null,
          vehicle: hdr.vehicle || null,
          prepared_by: user?.id || null,
          remark: m.discrepancy_remarks || null,
          inspection_lot_no: lotGood,
          analytica_ref_no: arGood,
          sap_batch_no: batchGood,
          next_inspection_date: m.retest_date || null,
          storage_condition: selectedStorage,
          created_at: new Date().toISOString(),
          material_desc: m.material_desc,
          _qty_per_case: goodCtn ? goodQty / goodCtn : null,
        });
      }

      if (dmgQty > 0) {
        lines.push({
          grn_no,
          line_no: lineCounter++,
          kind: "DAMAGE",
          item_code,
          material_code: m.material_code,
          vendor_code: m.vendor_code || null,
          vendor_batch_no: m.vendor_batch_no || m.manufacturer_batch_no || null,
          uom: uomLabel,
          net_qty: dmgQty,
          po_no: poSelected,
          po_line_item: m.po_line_item ? Number(m.po_line_item) : null,
          invoice_no: invoiceSelected,
          invoice_qty: headerInvoiceQty ? Number(headerInvoiceQty) : (Number(m.recv_qty || 0) || null),
          mfg_date: m.mfg_date || null,
          exp_date: m.exp_date || null,
          manufacturer: m.manufacturer || null,
          num_containers: dmgCtn,
          transporter_name: hdr.transporter || null,
          lr_no: hdr.lr_no || null,
          lr_date: hdr.lr_date || null,
          vehicle: hdr.vehicle || null,
          prepared_by: user?.id || null,
          remark: m.discrepancy_remarks || "DAMAGE",
          inspection_lot_no: lotDmg,
          analytica_ref_no: arDmg,
          sap_batch_no: batchDmg,
          next_inspection_date: m.retest_date || null,
          storage_condition: selectedStorage,
          created_at: new Date().toISOString(),
          material_desc: m.material_desc,
          _qty_per_case: dmgCtn ? dmgQty / dmgCtn : null,
        });
      }
    }

    return { header, lines };
  };

  /* ---------- persist new (create/post) ---------- */

  const saveOrPost = async (finalize = false) => {
    if (!poSelected) return toast.error("Enter a Purchase Order and click Fetch");
    if (!invoiceSelected) return toast.error("Select/enter an Invoice No.");
    if (!materials.length) return toast.error("No materials to post");

    setBusy(true);
    try {
      const { header, lines } = await buildPayload(finalize ? "Posted" : "Draft");
      const headerToSave = pick(header, HEADER_COLS);
      const linesToSave = lines.map((l) => pick(l, POSTING_COLS));

      await toast.promise(
        (async () => {
          const r1 = await upsertGrnHeader(headerToSave);
          if (r1?.error) throw r1.error;
          if (linesToSave.length) {
            const r2 = await upsertGrnPostings(linesToSave);
            if (r2?.error) throw r2.error;
          }
          return true;
        })(),
        {
          loading: finalize ? "Posting GRN…" : "Saving draft…",
          success: finalize ? "GRN posted" : "Draft saved",
          error: (e) => e?.message || "Unable to save/post GRN",
        }
      );

      // Pull from DB with real per-container splits for preview/export
      const rows = await fetchLinesWithContainers(header.grn_no);
      setGrnResult({ header, rows });
      if (finalize) setShowPreview(true);
      await prefillLogistics(header.po_no, header.invoice_no);
    } catch (e) {
      console.error("GRN save/post failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const anyDamage = useMemo(
    () => materials.some((m) => (Number(m.damage_qty || 0) || 0) > 0),
    [materials]
  );

  /* ---------- export / print ---------- */

  const exportCSV = () => {
    if (!grnResult) return;
    const { header, rows } = grnResult;

    // One CSV row per container (when splits exist), else one row per line with average qty/container.
    const csvRows = [
      [
        "GRN No","Kind","Item Code","Material Code","Material","PO","Line","Net Qty (Line)","UOM",
        "#Containers","Qty/Container (if no splits)","Container No","Container Net","Container Gross","Container Tare",
        "Vendor Code","Vendor Batch","Invoice","Inspection Lot","Item Batch","Analytica Ref","Next Insp. Date","Storage Condition",
      ],
      ...rows.flatMap((l) => {
        const base = [
          header.grn_no, l.kind, l.item_code, l.material_code, l.material_desc || "",
          header.po_no, l.line_no, (Number(l.net_qty || 0) || 0).toFixed(3), l.uom || "",
          l.num_containers || 0,
          // show average only when no splits
          (!l.containers || l.containers.length === 0)
            ? ((l.num_containers ? (Number(l.net_qty || 0) / Number(l.num_containers)).toFixed(3) : ""))
            : "",
        ];

        if (l.containers && l.containers.length) {
          return l.containers.map(c => [
            ...base,
            c.container_no ?? "",
            (Number(c.net_qty || 0) || 0).toFixed(3),
            c.gross_qty == null ? "" : Number(c.gross_qty).toFixed(3),
            c.tare_qty == null ? "" : Number(c.tare_qty).toFixed(3),
            l.vendor_code || "", l.vendor_batch_no || "", header.invoice_no,
            l.inspection_lot_no || "", l.sap_batch_no || "", l.analytica_ref_no || "",
            l.next_inspection_date ? fmtDate(l.next_inspection_date) : "", l.storage_condition || "",
          ].map(csvEscape));
        }
        // no splits: one row
        return [[
          ...base, "", "", "", "",
          l.vendor_code || "", l.vendor_batch_no || "", header.invoice_no,
          l.inspection_lot_no || "", l.sap_batch_no || "", l.analytica_ref_no || "",
          l.next_inspection_date ? fmtDate(l.next_inspection_date) : "", l.storage_condition || "",
        ].map(csvEscape)];
      })
    ].map(r => r.join(",")).join("\n");

    const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GRN_${header.grn_no}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printOutput = () => {
    if (!grnResult) return;
    const html = previewRef.current?.innerHTML || "";
    const w = window.open("", "_blank", "width=1024,height=768");
    if (!w) return;

    w.document.write(`
      <html>
        <head>
          <title>GRN ${grnResult.header.grn_no}</title>
          <style>
            body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:16px;}
            table{border-collapse:collapse;width:100%;}
            th,td{border:1px solid #e5e7eb; padding:8px; font-size:12px; vertical-align:top;}
            thead{background:#f8fafc;}
            h2{margin:0 0 12px 0;}
            .subtable th, .subtable td{font-size:11px;}
          </style>
        </head>
        <body>
          <h2>GRN ${grnResult.header.grn_no}</h2>
          <div><b>PO:</b> ${grnResult.header.po_no} &nbsp;&nbsp; <b>Invoice:</b> ${grnResult.header.invoice_no}</div>
          <div style="margin:6px 0 12px 0"><b>Status:</b> ${grnResult.header.status}</div>
          <div>${html}</div>
          <script>window.onload=() => window.print()</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  /* ---------- Posted GRN search ---------- */

  const loadPosted = async () => {
    setPostedBusy(true);
    try {
      let q = supabase
        .from("grn_headers")
        .select("grn_no, po_no, invoice_no, status, created_at")
        .eq("status", "Posted")
        .order("created_at", { ascending: false })
        .limit(200);

      const qq = (postQ || "").trim();
      if (qq) {
        q = q.or(`grn_no.ilike.%${qq}%,po_no.ilike.%${qq}%,invoice_no.ilike.%${qq}%`);
      }
      const from = (postFrom || "").trim();
      const to = (postTo || "").trim();
      if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
      if (to) q = q.lte("created_at", `${to}T23:59:59Z`);

      const { data, error } = await q;
      if (error) throw error;
      setPostedList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to search posted GRNs");
    } finally {
      setPostedBusy(false);
    }
  };

  const previewPosted = async (h) => {
    try {
      const rows = await fetchLinesWithContainers(h.grn_no);
      setPostedView({ header: h, rows });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load GRN lines");
    }
  };

  /* ---------------- render ---------------- */

  const qtyPerContainerAvg = (row) => {
    if (row?.containers && row.containers.length) return null;
    const n = Number(row?.num_containers || 0);
    const q = Number(row?.net_qty || 0);
    if (!n) return null;
    return q / n;
  };

  return (
    <div className="p-3 sm:p-4">
      {/* Title */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <PackageSearch className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">GRN Posting</div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
            <CheckCircle2 className="w-3 h-3" /> Post Good / Damage from Weight Capture
          </span>
        </div>

        {/* Controls */}
        {!showPreview && (
          <div className="bg-white p-3 border-b">
            {/* Row 1: PO + Invoice (input/select) + Invoice Qty + Re-Prefill */}
            <div className="grid grid-cols-12 gap-3 items-end">
              {/* PO + Fetch + Clear */}
              <div className="col-span-12 md:col-span-5 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <PackageSearch className="w-4 h-4 text-blue-700" />
                  Purchase Order
                </Label>
                <div className="flex gap-2">
                  <Input
                    className="h-10 flex-1"
                    placeholder="MFI/25/PO/00068"
                    value={poQuery ?? ""}
                    onChange={(e) => setPoQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchByPO((poQuery || "").trim())}
                  />
                  <Button
                    onClick={() => fetchByPO((poQuery || "").trim())}
                    disabled={loading}
                    className="gap-1 h-10 whitespace-nowrap"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Fetch
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPoQuery("");
                      setPoSelected("");
                      setInvoiceSelected("");
                      setInvoiceOptions([]);
                      setInvoiceUseSelect(false);
                      setHeaderInvoiceQty("");
                      setMaterials([]);
                      setShowPreview(false);
                      setGrnResult(null);
                      setExistingGrn(null);
                      setHdr({
                        lr_no: "",
                        lr_date: todayISO(),
                        vehicle: "",
                        transporter: "",
                        driver_name: "",
                        prepared_by: "",
                        remark: "",
                      });
                      setStorageMode("common");
                      setStorageText(COMMON_STORAGE);
                    }}
                    className="gap-1 h-10 whitespace-nowrap"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear
                  </Button>
                </div>

                {existingGrn ? (
                  <div className="mt-2 text[12px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 flex items-center gap-2">
                    <span className="font-semibold">Latest GRN:</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded bg-white border border-blue-200">
                      <FileText className="w-3 h-3 text-blue-700" />
                      {existingGrn.grn_no}
                    </span>
                    <span className="text-blue-700/80">from {existingGrn.source}</span>
                  </div>
                ) : null}
              </div>

              {/* Invoice No. (toggle input/select) */}
              <div className="col-span-12 md:col-span-3 min-w-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-700" />
                    Invoice No. {invoiceOptions.length > 1 ? `(${invoiceOptions.length} found)` : ""}
                  </Label>
                  <label className="text-[11px] text-slate-600 flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={invoiceUseSelect}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setInvoiceUseSelect(checked);
                        if (checked && invoiceOptions.length && !invoiceSelected) {
                          setInvoiceSelected(invoiceOptions[0].invoice_no);
                        }
                      }}
                    />
                    Use dropdown
                  </label>
                </div>

                {invoiceUseSelect ? (
                  <select
                    className="w-full border rounded-md h-10 px-2"
                    value={invoiceSelected ?? ""}
                    onChange={(e) => setInvoiceSelected(e.target.value)}
                    disabled={!invoiceOptions.length}
                  >
                    {invoiceOptions.length ? (
                      invoiceOptions.map((x) => (
                        <option key={x.invoice_no} value={x.invoice_no}>
                          {x.invoice_no}{x.invoice_date ? ` — ${fmtDate(x.invoice_date)}` : ""}
                        </option>
                      ))
                    ) : (
                      <option value="">—</option>
                    )}
                  </select>
                ) : (
                  <Input
                    className="h-10"
                    placeholder="Enter Invoice No."
                    value={invoiceSelected ?? ""}
                    onChange={(e) => setInvoiceSelected(e.target.value)}
                  />
                )}
              </div>

              {/* Header Invoice Qty (optional) + Re-prefill */}
              <div className="col-span-12 md:col-span-3 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-700" />
                  Invoice Qty. (optional, header)
                </Label>
                <div className="flex gap-2">
                  <Input
                    className="h-10"
                    placeholder="auto-filled from WC"
                    value={headerInvoiceQty ?? ""}
                    onChange={(e) => setHeaderInvoiceQty(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 p-0"
                    title="Re-prefill logistics + refresh header qty"
                    onClick={async () => {
                      if (!poSelected || !invoiceSelected) return;
                      await prefillLogistics(poSelected, invoiceSelected);
                      await recomputeHeaderInvoiceQty(poSelected, invoiceSelected);
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Row 2: LR / Date / Vehicle / Transporter */}
            <div className="grid grid-cols-12 gap-3 mt-3">
              <div className="col-span-12 md:col-span-3 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-700" />
                  LR No.
                </Label>
                <Input
                  className="h-10"
                  placeholder="LR / DC No"
                  value={hdr.lr_no ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, lr_no: e.target.value }))}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-700" />
                  LR Date
                </Label>
                <Input
                  className="h-10"
                  type="date"
                  value={hdr.lr_date ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, lr_date: e.target.value }))}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-700" />
                  Vehicle
                </Label>
                <Input
                  className="h-10"
                  placeholder="Vehicle no."
                  value={hdr.vehicle ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, vehicle: e.target.value }))}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-700" />
                  Transporter
                </Label>
                <Input
                  className="h-10"
                  placeholder="Transporter name"
                  value={hdr.transporter ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, transporter: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 3: Driver / Prepared By / Remark */}
            <div className="grid grid-cols-12 gap-3 mt-3">
              <div className="col-span-12 md:col-span-4 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <UserCircle2 className="w-4 h-4 text-blue-700" />
                  Driver
                </Label>
                <Input
                  className="h-10"
                  placeholder="Driver name"
                  value={hdr.driver_name ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, driver_name: e.target.value }))}
                />
              </div>

              <div className="col-span-12 md:col-span-4 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <User2 className="w-4 h-4 text-blue-700" />
                  GRN Prepared By
                </Label>
                <Input
                  className="h-10"
                  placeholder={user?.email || ""}
                  value={hdr.prepared_by ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, prepared_by: e.target.value }))}
                />
              </div>

              <div className="col-span-12 md:col-span-4 min-w-0">
                <Label className="text-xs flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-blue-700" />
                  Remark
                </Label>
                <Input
                  className="h-10"
                  placeholder="Optional remark"
                  value={hdr.remark ?? ""}
                  onChange={(e) => setHdr((h) => ({ ...h, remark: e.target.value }))}
                />
              </div>
            </div>

            {/* Storage Condition */}
            <div className="mt-4">
              <Label className="text-xs flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-blue-700" />
                Storage Condition (applies to all lines)
              </Label>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-5">
                  <select
                    className="w-full border rounded-md h-10 px-2"
                    value={storageMode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStorageMode(v);
                      if (v === "common") setStorageText(COMMON_STORAGE);
                      if (v === "na") setStorageText("");
                    }}
                  >
                    <option value="common">Use common statement</option>
                    <option value="custom">Custom text</option>
                    <option value="na">NA (leave blank)</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-7">
                  <Input
                    className="h-10"
                    placeholder="Enter storage condition…"
                    value={storageMode === "na" ? "" : (storageText ?? "")}
                    disabled={storageMode !== "custom"}
                    onChange={(e) => setStorageText(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Your selection will be saved in <code>storage_condition</code> for every GRN line.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview / Output */}
      {showPreview && grnResult ? (
        <Card className="overflow-hidden mb-3">
          <div className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold">
              GRN Output • GRN {grnResult.header.grn_no} • PO {grnResult.header.po_no} • Invoice {grnResult.header.invoice_no}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-1" onClick={exportCSV}>
                <Download className="w-4 h-4" /> CSV
              </Button>
              <Button variant="outline" className="gap-1" onClick={printOutput}>
                <Printer className="w-4 h-4" /> Print
              </Button>
              <Button variant="outline" className="gap-1" onClick={() => setShowPreview(false)}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </div>
          </div>
          <div className="p-3 overflow-x-auto" ref={previewRef}>
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Line</th>
                  <th className="p-2 text-left">Kind</th>
                  <th className="p-2 text-left">Item Code</th>
                  <th className="p-2 text-left">Material</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-left">Net Qty</th>
                  <th className="p-2 text-left">#Containers</th>
                  <th className="p-2 text-left">Qty/Container</th>
                  <th className="p-2 text-left">Inspection Lot</th>
                  <th className="p-2 text-left">Item Batch</th>
                  <th className="p-2 text-left">Analytica Ref</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {grnResult.rows.map((l, idx) => {
                  const qpc = qtyPerContainerAvg(l);
                  return (
                    <React.Fragment key={`${l.grn_no}-${l.line_no}-${idx}`}>
                      <tr className="align-top">
                        <td className="p-2 border-b">{l.line_no}</td>
                        <td className="p-2 border-b">
                          <span
                            className={
                              "px-2 py-[2px] rounded border text-xs " +
                              (l.kind === "DAMAGE"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200")
                            }
                          >
                            {l.kind}
                          </span>
                        </td>
                        <td className="p-2 border-b">{l.item_code}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{l.material_code}</div>
                          <div className="text-xs text-slate-600">{l.material_desc}</div>
                        </td>
                        <td className="p-2 border-b">{l.uom || "-"}</td>
                        <td className="p-2 border-b">{(Number(l.net_qty || 0) || 0).toFixed(3)}</td>
                        <td className="p-2 border-b">{l.num_containers || 0}</td>
                        <td className="p-2 border-b">
                          {qpc == null ? "-" : Number(qpc || 0).toFixed(3)}
                        </td>
                        <td className="p-2 border-b">{l.inspection_lot_no || "-"}</td>
                        <td className="p-2 border-b">{l.sap_batch_no || "-"}</td>
                        <td className="p-2 border-b">{l.analytica_ref_no || "-"}</td>
                        <td className="p-2 border-b">
                          <span
                            className={
                              "px-2 py-[2px] rounded border text-xs " +
                              (l.kind === "DAMAGE"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200")
                            }
                          >
                            {l.kind === "DAMAGE" ? "Damage / Released" : "Good / Released"}
                          </span>
                        </td>
                      </tr>

                      {l.containers && l.containers.length > 0 && (
                        <tr>
                          <td className="p-0 border-b" colSpan={12}>
                            <table className="w-full subtable">
                              <thead>
                                <tr>
                                  <th className="p-2 text-left">  #</th>
                                  <th className="p-2 text-left">Container</th>
                                  <th className="p-2 text-left">Net</th>
                                  <th className="p-2 text-left">Gross</th>
                                  <th className="p-2 text-left">Tare</th>
                                  <th className="p-2 text-left">Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {l.containers.map((c, i2) => (
                                  <tr key={`c-${l.line_no}-${i2}`}>
                                    <td className="p-2">  {i2 + 1}</td>
                                    <td className="p-2">{c.container_no ?? c.container_index ?? "-"}</td>
                                    <td className="p-2">{Number(c.net_qty || 0).toFixed(3)}</td>
                                    <td className="p-2">{c.gross_qty == null ? "-" : Number(c.gross_qty).toFixed(3)}</td>
                                    <td className="p-2">{c.tare_qty == null ? "-" : Number(c.tare_qty).toFixed(3)}</td>
                                    <td className="p-2">{c.remarks || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Input grid */}
      {!showPreview && (
        <Card className="overflow-hidden mb-4">
          <div className="px-3 py-2 border-b bg-slate-100 text-sm font-semibold">
            GRN Input • PO {poSelected || "—"} • Invoice {invoiceSelected || "—"}
          </div>
          <div className="p-3 overflow-x-auto">
            {materials.length ? (
              <table className="min-w-[1380px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">Material Code</th>
                    <th className="p-2 text-left">Material Description</th>
                    <th className="p-2 text-left">Manufacturer Batch No.</th>
                    <th className="p-2 text-left">PO Qty</th>
                    <th className="p-2 text-left">UOM</th>
                    <th className="p-2 text-left"># Good Ctn</th>
                    <th className="p-2 text-left">Qty/Good Ctn</th>
                    <th className="p-2 text-left"># Damage Ctn</th>
                    <th className="p-2 text-left">Qty/Damage Ctn</th>
                    <th className="p-2 text-left">Total Received</th>
                    <th className="p-2 text-left">Inspection Lot</th>
                    <th className="p-2 text-left">Analytica Ref No.</th>
                    <th className="p-2 text-left">Discrepancy Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => {
                    const goodPer = m.good_containers ? (Number(m.good_qty || 0) || 0) / m.good_containers : 0;
                    const dmgPer = m.damage_containers ? (Number(m.damage_qty || 0) || 0) / m.damage_containers : 0;
                    return (
                      <tr key={m.material_code} className="align-top">
                        <td className="p-2 border-b">{m.material_code}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{m.material_desc}</div>
                          <div className="text-[11px] text-slate-500">Manufacturer: {m.manufacturer || "-"}</div>
                        </td>
                        <td className="p-2 border-b">{m.manufacturer_batch_no || m.vendor_batch_no || "-"}</td>
                        <td className="p-2 border-b">{Number(m.po_qty || 0).toFixed(3)}</td>
                        <td className="p-2 border-b">{m._uom_label || "-"}</td>
                        <td className="p-2 border-b">{m.good_containers || 0}</td>
                        <td className="p-2 border-b">{m.good_containers ? goodPer.toFixed(3) : "-"}</td>
                        <td className="p-2 border-b">{m.damage_containers || 0}</td>
                        <td className="p-2 border-b">{m.damage_containers ? dmgPer.toFixed(3) : "-"}</td>
                        <td className="p-2 border-b font-semibold">{Number(m.total_qty || 0).toFixed(3)}</td>

                        {/* manual entries (optional) */}
                        <td className="p-2 border-b">
                          <Input
                            className="h-9"
                            value={m.inspection_lot_no ?? ""}
                            onChange={(e) => patchRow(m.material_code, { inspection_lot_no: e.target.value })}
                            placeholder="Auto if blank"
                          />
                        </td>

                        <td className="p-2 border-b">
                          <Input
                            className="h-9"
                            value={m.analytica_ref_no ?? ""}
                            onChange={(e) => patchRow(m.material_code, { analytica_ref_no: e.target.value })}
                            placeholder="Auto if blank"
                          />
                        </td>

                        <td className="p-2 border-b">
                          <Input
                            className="h-9"
                            value={m.discrepancy_remarks ?? ""}
                            onChange={(e) => patchRow(m.material_code, { discrepancy_remarks: e.target.value })}
                            placeholder={m.damage_qty > 0 ? "Damage present…" : "OK"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">
                {loading ? "Loading…" : "Enter a PO and click Fetch to begin. Materials with Weight Capture will appear here."}
              </div>
            )}

            {materials.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => saveOrPost(false)}>
                  Save Draft
                </Button>
                <Button disabled={busy} onClick={() => saveOrPost(true)}>
                  Post GRN
                </Button>
                {grnResult ? (
                  <Button type="button" variant="outline" className="gap-1" onClick={() => setShowPreview(true)}>
                    <Eye className="w-4 h-4" /> View Output
                  </Button>
                ) : null}
                <div className="ml-auto text-xs text-slate-600">
                  {anyDamage ? "Good with Damage" : "Good only"}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {!materials.length && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-10 w-full" />
          ))}
        </div>
      )}

      {/* ---------------- Posted GRNs: Search & Preview ---------------- */}
      <Card className="overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-100 text-sm font-semibold">
          Search Posted GRNs
        </div>
        <div className="p-3">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs">Search (GRN / PO / Invoice)</Label>
              <Input
                className="h-9"
                placeholder="GRN-20250901-1234, PO, or Invoice…"
                value={postQ}
                onChange={(e) => setPostQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPosted()}
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9" value={postFrom} onChange={(e) => setPostFrom(e.target.value)} />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9" value={postTo} onChange={(e) => setPostTo(e.target.value)} />
            </div>
            <div className="col-span-12 md:col-span-1">
              <Button className="w-full h-9" disabled={postedBusy} onClick={loadPosted}>
                {postedBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto border rounded">
            <table className="min-w-[820px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">GRN No</th>
                  <th className="p-2 text-left">PO</th>
                  <th className="p-2 text-left">Invoice</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Created</th>
                  <th className="p-2 text-left">Preview</th>
                </tr>
              </thead>
              <tbody>
                {postedList.length ? (
                  postedList.map((h) => (
                    <tr key={h.grn_no} className="odd:bg-white even:bg-slate-50/50">
                      <td className="p-2 border-b font-medium">{h.grn_no}</td>
                      <td className="p-2 border-b">{h.po_no}</td>
                      <td className="p-2 border-b">{h.invoice_no}</td>
                      <td className="p-2 border-b">
                        <span className="px-2 py-[2px] text-xs rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {h.status}
                        </span>
                      </td>
                      <td className="p-2 border-b">{new Date(h.created_at).toLocaleString()}</td>
                      <td className="p-2 border-b">
                        <Button size="sm" variant="outline" onClick={() => previewPosted(h)} className="gap-1">
                          <Eye className="w-4 h-4" />
                          <span>View</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={6}>
                      {postedBusy ? "Searching…" : "No results"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Posted preview */}
          {postedView.header && (
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">
                GRN {postedView.header.grn_no} • PO {postedView.header.po_no} • Invoice {postedView.header.invoice_no}
              </div>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left">Line</th>
                      <th className="p-2 text-left">Kind</th>
                      <th className="p-2 text-left">Item Code</th>
                      <th className="p-2 text-left">Material</th>
                      <th className="p-2 text-left">UOM</th>
                      <th className="p-2 text-left">Net Qty</th>
                      <th className="p-2 text-left">#Containers</th>
                      <th className="p-2 text-left">Inspection Lot</th>
                      <th className="p-2 text-left">Item Batch</th>
                      <th className="p-2 text-left">Analytica Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postedView.rows.map((l, idx) => (
                      <React.Fragment key={`${l.grn_no}-${l.line_no}-${idx}`}>
                        <tr>
                          <td className="p-2 border-b">{l.line_no}</td>
                          <td className="p-2 border-b">
                            <span
                              className={
                                "px-2 py-[2px] rounded border text-xs " +
                                (l.kind === "DAMAGE"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200")
                              }
                            >
                              {l.kind}
                            </span>
                          </td>
                          <td className="p-2 border-b">{l.item_code}</td>
                          <td className="p-2 border-b">
                            <div className="font-medium">{l.material_code}</div>
                            <div className="text-xs text-slate-600">{l.material_desc}</div>
                          </td>
                          <td className="p-2 border-b">{l.uom || "-"}</td>
                          <td className="p-2 border-b">{(Number(l.net_qty || 0) || 0).toFixed(3)}</td>
                          <td className="p-2 border-b">{l.num_containers || 0}</td>
                          <td className="p-2 border-b">{l.inspection_lot_no || "-"}</td>
                          <td className="p-2 border-b">{l.sap_batch_no || "-"}</td>
                          <td className="p-2 border-b">{l.analytica_ref_no || "-"}</td>
                        </tr>

                        {l.containers && l.containers.length > 0 && (
                          <tr>
                            <td className="p-0 border-b" colSpan={10}>
                              <table className="w-full subtable">
                                <thead>
                                  <tr>
                                    <th className="p-2 text-left">  #</th>
                                    <th className="p-2 text-left">Container</th>
                                    <th className="p-2 text-left">Net</th>
                                    <th className="p-2 text-left">Gross</th>
                                    <th className="p-2 text-left">Tare</th>
                                    <th className="p-2 text-left">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {l.containers.map((c, i2) => (
                                    <tr key={`pc-${l.line_no}-${i2}`}>
                                      <td className="p-2">  {i2 + 1}</td>
                                      <td className="p-2">{c.container_no ?? c.container_index ?? "-"}</td>
                                      <td className="p-2">{Number(c.net_qty || 0).toFixed(3)}</td>
                                      <td className="p-2">{c.gross_qty == null ? "-" : Number(c.gross_qty).toFixed(3)}</td>
                                      <td className="p-2">{c.tare_qty == null ? "-" : Number(c.tare_qty).toFixed(3)}</td>
                                      <td className="p-2">{c.remarks || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {!postedView.rows.length && (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={10}>No lines.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default GRNPosting;
