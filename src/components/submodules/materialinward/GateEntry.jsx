// src/components/submodules/materialinward/GateEntry.jsx
// Gate Entry with multi-PO dropdown, server-generated Gate Pass No,
// LabelMaster-styled 4×6 label (embedded QR), Review/Edit-before-print modal,
// A4 summary, reprint flow, gradient branding header, skeletal loaders,
// PO Gate Pass coverage (No GP / Partial with balance / Full),
// and a soft-delete/restore overflow menu (any logged-in user).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";
import toast from "react-hot-toast";
import logo from "../../../assets/logo.png";

import Button from "../../ui/button";            // Default export (avoid named import mismatch)
import { Card } from "../../ui/card";
import Input from "../../ui/Input";             // Default export (avoid named import mismatch)
import Label from "../../ui/Label";
import { Skeleton } from "../../ui/skeleton";

import {
  Truck,
  FileText,
  ClipboardList,
  Search,
  Plus,
  Save,
  Trash2,
  Printer,
  Calendar as CalendarIcon,
  UserRound,
  Building2,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  History,
  ArrowLeft,
  ScanQrCode,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";

import { getGateEntry } from "../../../utils/gatepass";

/* ---------------- helpers & theme ---------------- */
const iso = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

const fmtDate = (v) => {
  try {
    return v ? new Date(v).toISOString().slice(0, 10) : "-";
  } catch {
    return v || "-";
  }
};

const COMPANY_NAME = "DigitizerX";
const LABEL_FORMAT_NO = "DG/X/001";
const LABEL_VERSION = "001";
const LABEL_SOP_NO = "SOP/GXT/WH/001";

const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

/* tiny util */
const num = (v) => (typeof v === "number" ? v : parseFloat(v || "0")) || 0;

// ✅ UUID normalizer to strip console suffixes like ":1"
const extractUuid = (s) =>
  (String(s || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]) ||
  null;

/* ---------- simplified permission helper: any logged-in user ---------- */
const canSoftDelete = (user) => !!user;

const GateEntry = () => {
  const nav = useNavigate();
  const { user } = useAuth() || {};
  const a4Ref = useRef(null);

  /* ---------- state ---------- */
  const [qPo, setQPo] = useState("");
  const [poSearchBusy, setPoSearchBusy] = useState(false);
  const [poOptions, setPoOptions] = useState([]); // + coverage
  const [poSelect, setPoSelect] = useState([]);
  const [selectedPos, setSelectedPos] = useState([]);
  const [expandedPo, setExpandedPo] = useState({});
  const [loadingPoItems, setLoadingPoItems] = useState({});

  const [form, setForm] = useState({
    transporter_name: "",
    lr_no: "",
    lr_date: iso(),
    driver_name: "",
    vehicle_no: "",
    delivery_note: "",
  });

  const [verified, setVerified] = useState(false);
  const [gatePassNo, setGatePassNo] = useState("");
  const [gatePassId, setGatePassId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [labelCtx, setLabelCtx] = useState(null);
  const [labelQr, setLabelQr] = useState("");

  // Review/Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState({ ...form });

  // Reprint
  const [gpFilter, setGpFilter] = useState("");
  const [recentGPs, setRecentGPs] = useState([]);
  const [loadingGPs, setLoadingGPs] = useState(false);

  // Overflow / soft delete
  const [showMore, setShowMore] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* ---------- QR helpers ---------- */
  const makeQrDataUrl = async (payload) => {
    try {
      const QR = await import("qrcode");
      return await QR.toDataURL(JSON.stringify(payload), { width: 220, margin: 0 });
    } catch {
      const enc = encodeURIComponent(JSON.stringify(payload));
      return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${enc}`;
    }
  };
  const buildLabelPayload = (ctx) => ({
    type: "inward_gate_entry",
    gate_pass_no: ctx.gate_pass_no,
    po_nos: ctx.po_nos || [],
    po_dates: ctx.po_dates || [],
    transporter: ctx.transporter_name || "",
    invoice_nos: ctx.invoice_nos || [],
    lr_no: ctx.lr_no || "",
    lr_date: ctx.lr_date || "",
    driver: ctx.driver_name || "",
    vehicle: ctx.vehicle_no || "",
    printed_by: ctx.printed_by || "",
    print_date: ctx.print_date || iso(),
  });

  /* ---------- Safe logo URL ---------- */
  const getLogoUrl = () => {
    try {
      const l = String(logo || "");
      if (/^https?:\/\//i.test(l)) return l;
      if (typeof window !== "undefined") {
        if (l.startsWith("/")) return window.location.origin + l;
        return new URL(l, window.location.origin).href;
      }
      return l;
    } catch {
      return String(logo || "");
    }
  };

  /* ---------- Open POs (loader + coverage computation) ---------- */
  const hydrateVendorsAndInvoices = async (rows) => {
    const mapped = (rows || []).map((r) => ({
      id: r.id,
      po_no: r.po_no,
      po_date: r.created_at,
      vendor_id: r.vendor_id,
      vendor: r.vendor_snapshot
        ? {
            name: r.vendor_snapshot.name || "",
            email: r.vendor_snapshot.email || "",
            phone: r.vendor_snapshot.phone || "",
          }
        : null,
      invoice_id: r.invoice_id || null,
      invoice_no: null,
    }));

    // invoice nos
    const invoiceIds = [...new Set(mapped.map((m) => m.invoice_id).filter(Boolean))];
    if (invoiceIds.length) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id,invoice_no")
        .in("id", invoiceIds);
      const imap = new Map((inv || []).map((i) => [i.id, i.invoice_no]));
      mapped.forEach((m) => {
        if (m.invoice_id && imap.has(m.invoice_id)) m.invoice_no = imap.get(m.invoice_id) || null;
      });
    }

    // vendor fallback
    if (mapped.some((m) => !m.vendor && m.vendor_id)) {
      const ids = [
        ...new Set(mapped.filter((m) => !m.vendor && m.vendor_id).map((m) => m.vendor_id)),
      ];
      const { data: vs } = await supabase
        .from("vendors")
        .select("id,name,email,phone")
        .in("id", ids);
      const vmap = new Map((vs || []).map((v) => [v.id, v]));
      mapped.forEach((m) => {
        if (!m.vendor && m.vendor_id && vmap.has(m.vendor_id)) m.vendor = vmap.get(m.vendor_id);
      });
    }
    return mapped;
  };

  // Compute coverage by unique PO line ids across all gate passes
  const computeCoverage = async (options) => {
    if (!options.length) return options;
    const poIds = options.map((o) => o.id).filter(Boolean);

    // 1) Fetch lines
    const { data: lines, error: linesErr } = await supabase
      .from("purchase_order_lines")
      .select("id,po_id,qty,unit")
      .in("po_id", poIds);
    if (linesErr) throw linesErr;

    const totalByPo = new Map(); // po_id -> Set(lineIds)
    const qtyByLine = new Map();
    const uomByLine = new Map();
    for (const l of lines || []) {
      if (!totalByPo.has(l.po_id)) totalByPo.set(l.po_id, new Set());
      totalByPo.get(l.po_id).add(l.id);
      qtyByLine.set(l.id, num(l.qty));
      uomByLine.set(l.id, l.unit || "");
    }

    // 2) Scan inbound_gate_entries for the selected POs
    const { data: entries, error: gpErr } = await supabase
      .from("inbound_gate_entries")
      .select("po_bundle_json,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (gpErr) throw gpErr;

    const coveredByPo = new Map(); // po_id -> Set(line_id)
    for (const e of entries || []) {
      const arr = Array.isArray(e?.po_bundle_json) ? e.po_bundle_json : [];
      for (const b of arr) {
        const pid = b?.po_id;
        if (!pid || !poIds.includes(pid)) continue;
        const mats = Array.isArray(b.materials) ? b.materials : [];
        if (!coveredByPo.has(pid)) coveredByPo.set(pid, new Set());
        const set = coveredByPo.get(pid);
        for (const m of mats) {
          if (m?.id != null) set.add(m.id);
        }
      }
    }

    // 3) Attach summary
    return options.map((o) => {
      const totalSet = totalByPo.get(o.id) || new Set();
      const coveredSet = coveredByPo.get(o.id) || new Set();

      const totalLines = totalSet.size;
      const coveredLines = [...coveredSet].filter((id) => totalSet.has(id)).length;
      const pendingLines = Math.max(0, totalLines - coveredLines);

      // qty summary (based on PO qty; gate entry does not capture received qty)
      let totalQty = 0;
      let coveredQty = 0;
      const pendingUoms = new Set();
      for (const id of totalSet) totalQty += qtyByLine.get(id) || 0;
      for (const id of coveredSet) if (totalSet.has(id)) coveredQty += qtyByLine.get(id) || 0;
      for (const id of totalSet) if (!coveredSet.has(id)) pendingUoms.add(uomByLine.get(id) || "");
      const pendingQty = Math.max(0, totalQty - coveredQty);

      const status =
        totalLines === 0
          ? "No Lines"
          : coveredLines === 0
          ? "No GP"
          : coveredLines >= totalLines
          ? "Full"
          : "Partial";

      return {
        ...o,
        coverage: {
          status,
          coveredLines,
          totalLines,
          pendingLines,
          coveredQty,
          totalQty,
          pendingQty,
          pendingUoms: Array.from(pendingUoms).filter(Boolean),
        },
      };
    });
  };

  const loadOpenPOs = async (term = "") => {
    setPoSearchBusy(true);
    try {
      let q = supabase
        .from("purchase_orders")
        .select("id,po_no,vendor_id,vendor_snapshot,status,created_at,invoice_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (term?.trim()) q = q.ilike("po_no", `%${term.trim()}%`);
      q = q.or("status.is.null,status.eq.Open,status.eq.open,status.eq.OPEN,status.eq.Verified");

      const { data, error } = await q;
      if (error) throw error;

      const base = await hydrateVendorsAndInvoices(data || []);
      const withCov = await computeCoverage(base);
      setPoOptions(withCov);

      if (!withCov.length) toast("No open POs found.");
    } catch (e1) {
      console.error("loadOpenPOs failed:", e1);
      toast.error(`Failed to fetch POs: ${e1?.message || e1?.hint || "Bad request"}`);
      setPoOptions([]);
    } finally {
      setPoSearchBusy(false);
    }
  };

  useEffect(() => {
    loadOpenPOs();
  }, []);

  const filteredPoOptions = useMemo(() => {
    if (!qPo.trim()) return poOptions;
    const t = qPo.trim().toLowerCase();
    return poOptions.filter(
      (o) => o.po_no?.toLowerCase().includes(t) || (o.vendor?.name || "").toLowerCase().includes(t)
    );
  }, [poOptions, qPo]);

  /* ---------- add/remove & materials ---------- */
  const addPO = async (po) => {
    if (selectedPos.some((p) => p.id === po.id)) {
      toast("PO already added.");
      return;
    }
    setLoadingPoItems((s) => ({ ...s, [po.id]: true }));
    try {
      const { data: items, error } = await supabase
        .from("purchase_order_lines")
        .select(
          "id,line_no,material_id,description,unit,qty,materials:materials(code,description)"
        )
        .eq("po_id", po.id)
        .order("line_no", { ascending: true });
      if (error) throw error;

      const mapped = (items || []).map((r) => ({
        id: r.id,
        material_code: r.materials?.code || "",
        material_description: r.description || r.materials?.description || "",
        po_qty: r.qty,
        uom: r.unit,
        selected: true,
      }));

      setSelectedPos((s) => [...s, { ...po, items: mapped, allItems: mapped }]);
      setExpandedPo((s) => ({ ...s, [po.id]: true }));
    } catch (e) {
      console.error("addPO error:", e);
      toast.error(`Failed to load PO lines: ${e?.message || "Bad request"}`);
    } finally {
      setLoadingPoItems((s) => ({ ...s, [po.id]: false }));
    }
  };

  const addSelectedPOs = async () => {
    if (!poSelect.length) {
      toast("Select one or more POs to add.");
      return;
    }
    for (const id of poSelect) {
      const po = poOptions.find((o) => String(o.id) === String(id));
      if (po) {
        // eslint-disable-next-line no-await-in-loop
        await addPO(po);
      }
    }
    setPoSelect([]);
  };

  const removePO = (po_id) => {
    setSelectedPos((s) => s.filter((p) => p.id !== po_id));
    setExpandedPo((s) => {
      const n = { ...s };
      delete n[po_id];
      return n;
    });
  };

  const toggleItem = (po_id, item_id) => {
    setSelectedPos((s) =>
      s.map((p) =>
        p.id === po_id
          ? {
              ...p,
              items: p.items.map((it) =>
                it.id === item_id ? { ...it, selected: !it.selected } : it
              ),
            }
          : p
      )
    );
  };

  const setAllItemsChecked = (po_id, checked) => {
    setSelectedPos((s) =>
      s.map((p) =>
        p.id === po_id ? { ...p, items: p.items.map((it) => ({ ...it, selected: checked })) } : p
      )
    );
  };

  /* ---------- preview bundle ---------- */
  const previewBundle = useMemo(
    () =>
      selectedPos.map((po) => ({
        po_id: po.id,
        po_no: po.po_no,
        po_date: po.po_date,
        invoice_no: po.invoice_no || null,
        vendor: po.vendor
          ? { name: po.vendor.name, email: po.vendor.email, phone: po.vendor.phone }
          : null,
        materials: po.items
          .filter((it) => it.selected)
          .map((it) => ({
            id: it.id,
            material_code: it.material_code,
            material_description: it.material_description,
            po_qty: it.po_qty,
            uom: it.uom,
          })),
      })),
    [selectedPos]
  );

  const poNosArr = useMemo(() => previewBundle.map((b) => b.po_no), [previewBundle]);
  const poDatesArr = useMemo(() => previewBundle.map((b) => fmtDate(b.po_date)), [previewBundle]);
  const invoiceNosArr = useMemo(
    () => previewBundle.map((b) => b.invoice_no).filter(Boolean),
    [previewBundle]
  );

  /* ---------- Save ---------- */
  const onSave = async () => {
    if (!verified) {
      toast.error("Please verify invoice details before saving.");
      return;
    }
    if (previewBundle.length === 0) {
      toast.error("Add at least one Purchase Order.");
      return;
    }

    const payload = {
      created_by: user?.id || null,
      transporter_name: form.transporter_name,
      lr_no: form.lr_no,
      lr_date: form.lr_date || iso(),
      driver_name: form.driver_name,
      vehicle_no: form.vehicle_no,
      delivery_note: form.delivery_note,
      po_bundle_json: previewBundle,
    };

    setSaving(true);
    await toast
      .promise(
        (async () => {
          const { data, error } = await supabase
            .from("inbound_gate_entries")
            .insert(payload)
            .select(
              "id,gate_pass_no,lr_no,lr_date,transporter_name,vehicle_no,driver_name,delivery_note,po_bundle_json,created_at,created_by"
            )
            .single();
          if (error) throw error;
          return data;
        })(),
        {
          loading: "Saving Gate Entry...",
          success: "Gate Entry saved.",
          error: "Failed to save Gate Entry.",
        }
      )
      .then(async (res) => {
        setGatePassId(extractUuid(res?.id) || null);
        setGatePassNo(res?.gate_pass_no || "");
        setIsDeleted(false); // newly created not deleted
        const ctx = {
          gate_pass_no: res?.gate_pass_no || "",
          transporter_name: res.transporter_name || "",
          lr_no: res.lr_no || "",
          lr_date: res.lr_date || "",
          driver_name: res.driver_name || "",
          vehicle_no: res.vehicle_no || "",
          delivery_note: res.delivery_note || "",
          po_nos: (res.po_bundle_json || []).map((b) => b.po_no).filter(Boolean),
          po_dates: (res.po_bundle_json || []).map((b) => fmtDate(b.po_date)).filter(Boolean),
          invoice_nos: (res.po_bundle_json || []).map((b) => b.invoice_no).filter(Boolean),
          printed_by: user?.email || user?.user_metadata?.email || "",
          print_date: iso(),
        };
        setLabelCtx(ctx);
        setLabelQr(await makeQrDataUrl(buildLabelPayload(ctx)));
        loadRecentGatePasses();
        // refresh list so coverage badges update
        loadOpenPOs(qPo);
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  /* ---------- Edit/Update before print ---------- */
  const openEdit = () => {
    if (!labelCtx) {
      toast.error("Save or load a Gate Pass first.");
      return;
    }
    setEdit({
      transporter_name: labelCtx.transporter_name || form.transporter_name || "",
      lr_no: labelCtx.lr_no || form.lr_no || "",
      lr_date: labelCtx.lr_date || form.lr_date || iso(),
      driver_name: labelCtx.driver_name || form.driver_name || "",
      vehicle_no: labelCtx.vehicle_no || form.vehicle_no || "",
      delivery_note: labelCtx.delivery_note || form.delivery_note || "",
    });
    setShowEdit(true);
  };

  // ✅ Clean updater: NO status/printed_at (prevents 400), no .limit() on PATCH, then refetch
  const updateGatePass = async (next) => {
    const updates = {
      transporter_name: next.transporter_name || null,
      lr_no: next.lr_no || null,
      lr_date: next.lr_date || null,
      driver_name: next.driver_name || null,
      vehicle_no: next.vehicle_no || null,
      delivery_note: next.delivery_note || null,
    };

    const safeId = extractUuid(gatePassId);

    const run = async () => {
      let q = supabase.from("inbound_gate_entries").update(updates);
      if (safeId) q = q.eq("id", safeId);
      else q = q.eq("gate_pass_no", gatePassNo);

      const { error } = await q; // no .select(), no .limit()
      if (error) throw error;

      // Re-fetch a clean representation (uses tolerant getGateEntry)
      return await getGateEntry(safeId || gatePassNo);
    };

    return await toast.promise(run(), {
      loading: "Updating…",
      success: "Updated",
      error: (e) => e.message || "Update failed",
    });
  };

  /* ---------- Label print ---------- */
  const printLabel = (ctx, labelImg) => {
    if (!ctx?.gate_pass_no) {
      toast.error("Save or select a Gate Pass first.");
      return;
    }

    const fieldsHtml = `
      <div class="row"><span>Purchase Order No.</span><span class="val">${(ctx.po_nos || []).join(", ") || "-"}</span></div>
      <div class="row"><span>Purchase Order Date</span><span class="val">${(ctx.po_dates || []).join(", ") || "-"}</span></div>
      <div class="row"><span>Transporter Name</span><span class="val">${ctx.transporter_name || "-"}</span></div>
      <div class="row"><span>Invoice No</span><span class="val">${(ctx.invoice_nos || []).join(", ") || "-"}</span></div>
      <div class="row"><span>LRNo.</span><span class="val">${ctx.lr_no || "-"}</span></div>
      <div class="row"><span>LRDate</span><span class="val">${ctx.lr_date || "-"}</span></div>
      <div class="row"><span>Driver Name</span><span class="val">${ctx.driver_name || "-"}</span></div>
      <div class="row"><span>Vehicle No.</span><span class="val">${ctx.vehicle_no || "-"}</span></div>
      <div class="row"><span>Print By</span><span class="val">${ctx.printed_by || "-"}</span></div>
      <div class="row"><span>Print Date</span><span class="val">${ctx.print_date || iso()}</span></div>
    `;

    const w = window.open("", "_blank", "width=420,height=700");
    w.document.open();
    w.document.write(`
      <html>
        <head>
          <title>Gate Pass Label - ${ctx.gate_pass_no}</title>
          <style>
            @page{size:100mm 150mm;margin:4mm;}
            *{box-sizing:border-box;}
            body{margin:0;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#0f172a;}
            .card{width:100mm;height:150mm;border:1px solid #e2e8f0;border-radius:3mm;overflow:hidden;display:flex;flex-direction:column}
            .band{background:#1e3a8a;color:#fff;padding:2.5mm 3mm;font-weight:600;font-size:3.2mm}
            .band small{font-weight:400;opacity:.95}
            .panel{flex:1;padding:3mm 3mm 2mm 3mm;display:flex;flex-direction:column;gap:3mm}
            .grid{display:grid;grid-template-columns:1fr auto;gap:3mm;align-items:start}
            .box{border:1px dashed #cbd5e1;border-radius:2mm;padding:3mm}
            .title{font-weight:700;font-size:3.4mm;color:#0f172a;margin-bottom:2mm}
            .rows .row{display:flex;gap:4mm;justify-content:space-between;padding:.8mm 0;border-bottom:1px dotted #e5e7eb}
            .rows .row:last-child{border-bottom:none}
            .rows .row span{font-size:3.2mm}
            .rows .row span.val{font-weight:600;text-align:right}
            .foot{display:flex;align-items:center;justify-content:space-between;padding:2mm 3mm;border-top:1px solid #e5e7eb;background:#f8fafc}
            .qr{width:16mm;height:16mm;object-fit:contain;border:1px solid #e2e8f0;border-radius:1mm;padding:1mm;background:#fff}
            .logo{height:8mm;object-fit:contain}
            .tiny{font-size:3mm;color:#475569;text-align:center;padding:1.5mm 3mm}
            .idline{font-size:3.2mm;margin-top:1mm}
            .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="band">
              Format No: ${LABEL_FORMAT_NO} &nbsp; Version: ${LABEL_VERSION} &nbsp;
              <small>Ref SOP No.: ${LABEL_SOP_NO} | GATE ENTRY DETAILS</small>
            </div>
            <div class="panel">
              <div class="grid">
                <div class="box">
                  <div class="title">Gate Entry Details</div>
                  <div class="rows">${fieldsHtml}</div>
                  <div class="idline"><b>No:</b> <span class="mono">${ctx.gate_pass_no}</span></div>
                </div>
                <img src="${labelImg || ""}" class="qr" alt="QR"/>
              </div>
            </div>
            <div class="foot">
              <img src="${getLogoUrl()}" class="logo" onerror="this.style.display='none'"/>
              <div class="tiny">The label has been generated electronically and is valid without signature.</div>
            </div>
          </div>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const printA4 = () => {
    if (!gatePassNo) {
      toast.error("Save or load a Gate Pass first.");
      return;
    }
    const html = a4Ref.current?.innerHTML || "";
    const w = window.open("", "_blank", "width=900,height=1200");
    w.document.open();
    w.document.write(`
      <html>
        <head>
          <title>Gate Pass - ${gatePassNo || "(pending)"}</title>
          <style>
            @page{size:A4;margin:16mm;}
            body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#111827;}
            .header{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px;}
            .logo{height:40px;}
            .h1{font-size:20px;font-weight:700;margin:0;}
            .meta{font-size:12px;color:#374151;}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
            .box{border:1px solid #e5e7eb;border-radius:8px;padding:8px;}
            table{width:100%;border-collapse:collapse;}
            th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;vertical-align:top;}
            th{background:#f9fafb;text-align:left;}
            .small{font-size:11px;color:#374151;}
            .muted{color:#6b7280;}
            .qr{height:120px;width:120px;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#fff;}
            .header-right{margin-left:auto;display:flex;align-items:center;gap:12px;}
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

  /* ---------- Reprint flow ---------- */
  const loadRecentGatePasses = async () => {
    setLoadingGPs(true);
    try {
      const { data, error } = await supabase
        .from("inbound_gate_entries")
        .select(
          "id,gate_pass_no,created_at,lr_no,lr_date,transporter_name,vehicle_no,driver_name,delivery_note,po_bundle_json"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setRecentGPs(data || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load gate passes");
    } finally {
      setLoadingGPs(false);
    }
  };
  useEffect(() => {
    loadRecentGatePasses();
  }, []);

  const handleReprintLookup = async () => {
    const raw = (gpFilter || "").trim();
    if (!raw) return;

    await toast.promise(
      (async () => {
        const data = await getGateEntry(raw);

        // ✅ clean id & store
        setGatePassId(extractUuid(data?.id) || null);
        setGatePassNo(String(data?.gate_pass_no || ""));
        setIsDeleted(!!data?.deleted_at);

        const ctx = {
          gate_pass_no: data.gate_pass_no,
          transporter_name: data.transporter_name || "",
          lr_no: data.lr_no || "",
          lr_date: data.lr_date || "",
          driver_name: data.driver_name || "",
          vehicle_no: data.vehicle_no || "",
          delivery_note: data.delivery_note || "",
          po_nos: (data.po_bundle_json || []).map((b) => b.po_no).filter(Boolean),
          po_dates: (data.po_bundle_json || []).map((b) => fmtDate(b.po_date)).filter(Boolean),
          invoice_nos: (data.po_bundle_json || []).map((b) => b.invoice_no).filter(Boolean),
          printed_by: user?.email || user?.user_metadata?.email || "",
          print_date: iso(),
        };
        setLabelCtx(ctx);
        setLabelQr(await makeQrDataUrl(buildLabelPayload(ctx)));
        return true;
      })(),
      { loading: "Loading gate pass…", success: "Loaded", error: (e) => e.message || "Lookup failed" }
    );
  };

  /* ---------- auto-load via route param (:gpNo) ---------- */
  const { gpNo: routeGp } = useParams() || {};
  useEffect(() => {
    (async () => {
      if (!routeGp) return;
      try {
        const data = await getGateEntry(routeGp);

        // ✅ clean id & store
        setGatePassId(extractUuid(data?.id) || null);
        setGatePassNo(String(data?.gate_pass_no || ""));
        setIsDeleted(!!data?.deleted_at);

        const ctx = {
          gate_pass_no: data.gate_pass_no,
          transporter_name: data.transporter_name || "",
          lr_no: data.lr_no || "",
          lr_date: data.lr_date || "",
          driver_name: data.driver_name || "",
          vehicle_no: data.vehicle_no || "",
          delivery_note: data.delivery_note || "",
          po_nos: (data.po_bundle_json || []).map((b) => b.po_no).filter(Boolean),
          po_dates: (data.po_bundle_json || []).map((b) => fmtDate(b.po_date)).filter(Boolean),
          invoice_nos: (data.po_bundle_json || []).map((b) => b.invoice_no).filter(Boolean),
          printed_by: user?.email || user?.user_metadata?.email || "",
          print_date: iso(),
        };
        setLabelCtx(ctx);
        setLabelQr(await makeQrDataUrl(buildLabelPayload(ctx)));
        setForm({
          transporter_name: data.transporter_name || "",
          lr_no: data.lr_no || "",
          lr_date: data.lr_date || iso(),
          driver_name: data.driver_name || "",
          vehicle_no: data.vehicle_no || "",
          delivery_note: data.delivery_note || "",
        });
        setVerified(true);
      } catch (e) {
        console.error(e);
        toast.error(e?.message || "Failed to load Gate Pass");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGp]);

  /* ---------- actions ---------- */
  const resetAll = () => {
    setQPo("");
    setPoOptions([]);
    setPoSelect([]);
    setSelectedPos([]);
    setExpandedPo({});
    setLoadingPoItems({});
    setForm({
      transporter_name: "",
      lr_no: "",
      lr_date: iso(),
      driver_name: "",
      vehicle_no: "",
      delivery_note: "",
    });
    setVerified(false);
    setGatePassNo("");
    setGatePassId(null);
    setLabelCtx(null);
    setLabelQr("");
    setIsDeleted(false);
    loadOpenPOs();
  };

  // Soft delete & restore (any logged-in user)
  const doSoftDelete = async () => {
    if (!gatePassId && !gatePassNo) {
      toast.error("Save or load a Gate Pass first.");
      return;
    }
    if (!canSoftDelete(user)) {
      toast.error("You must be signed in to delete gate passes.");
      return;
    }
    if (
      !window.confirm(
        "Soft delete this Gate Pass? It will be hidden from lists but can be restored."
      )
    ) {
      return;
    }
    const run = async () => {
      const safeId = extractUuid(gatePassId);
      let q = supabase
        .from("inbound_gate_entries")
        // Only set columns we know exist everywhere to avoid 400s
        .update({ deleted_at: new Date().toISOString() })
        .select("id,deleted_at");
      if (safeId) q = q.eq("id", safeId);
      else q = q.eq("gate_pass_no", gatePassNo);
      const { data, error } = await q.single();
      if (error) throw error;
      return data;
    };
    await toast
      .promise(run(), {
        loading: "Soft deleting…",
        success: "Gate Pass moved to archive.",
        error: (e) => e.message || "Delete failed",
      })
      .then(() => setIsDeleted(true))
      .finally(() => setShowMore(false));
  };

  const doRestore = async () => {
    if (!gatePassId && !gatePassNo) {
      toast.error("Load a Gate Pass first.");
      return;
    }
    const run = async () => {
      const safeId = extractUuid(gatePassId);
      let q = supabase
        .from("inbound_gate_entries")
        .update({ deleted_at: null }) // keep minimal to avoid 400s
        .select("id,deleted_at");
      if (safeId) q = q.eq("id", safeId);
      else q = q.eq("gate_pass_no", gatePassNo);
      const { data, error } = await q.single();
      if (error) throw error;
      return data;
    };
    await toast
      .promise(run(), {
        loading: "Restoring…",
        success: "Gate Pass restored.",
        error: (e) => e.message || "Restore failed",
      })
      .then(() => setIsDeleted(false))
      .finally(() => setShowMore(false));
  };

  /* ---------- UI helpers ---------- */
  const renderStatusTag = (cov) => {
    if (!cov) return "🆕 No GP";
    if (cov.status === "Full") return "✅ GP: Full";
    if (cov.status === "No GP") return "🆕 No GP";
    if (cov.status === "No Lines") return "—";
    const showQty = cov.pendingUoms && cov.pendingUoms.length === 1 && cov.pendingUoms[0];
    return showQty
      ? `🟡 GP: Partial • bal ${cov.pendingQty} ${cov.pendingUoms[0]}`
      : `🟡 GP: Partial • ${cov.pendingLines} line(s) pending`;
  };

  const filteredPoList = useMemo(() => filteredPoOptions, [filteredPoOptions]);
  const poNosStr =
    (labelCtx?.po_nos?.join(", ") || previewBundle.map((b) => b.po_no).join(", ")) || "-";
  const poDatesStr =
    (labelCtx?.po_dates?.join(", ") || previewBundle.map((b) => fmtDate(b.po_date)).join(", ")) ||
    "-";

  /* ---------- render ---------- */
  return (
    <div className="p-3 sm:p-4">
      {/* Gradient header */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Material Inward — Gate Entry</div>
          <WhiteChip>Multi-PO</WhiteChip>
          {gatePassNo ? (
            <WhiteChip>
              <ScanQrCode className="w-3 h-3" /> {gatePassNo}
            </WhiteChip>
          ) : (
            <span className="text-xs opacity-80">Gate Pass No. after save</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => nav("/material-inward/gate-entry")}
              className="bg-white/10 hover:bg-white/20 text-white border-white/30"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !verified}
              className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={openEdit}
              disabled={!labelCtx}
              className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
            >
              <Printer className="w-4 h-4" />
              <span>Review &amp; Print</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={printA4}
              disabled={!gatePassNo}
              className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Summary</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={resetAll}
              className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span>New Gate Entry</span>
            </Button>

            {/* Overflow menu (Soft delete / Restore) */}
            <div ref={moreRef} className="relative">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowMore((v) => !v)}
                className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
                title="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>More</span>
              </Button>
              {showMore && (
                <div className="absolute right-0 mt-1 w-56 bg-white text-slate-800 border border-slate-200 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <button
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 ${
                        !gatePassNo ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                      onClick={doSoftDelete}
                      disabled={!gatePassNo}
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      Soft delete gate pass
                    </button>
                    <button
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 ${
                        !isDeleted ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                      onClick={doRestore}
                      disabled={!isDeleted}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore gate pass
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reprint bar */}
        <div className="bg-white p-3 border-b">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Reprint a Gate Pass (paste UUID or number)</Label>
              <div className="relative">
                <History className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
                <Input
                  list="gp-datalist"
                  className="pl-8"
                  placeholder="e.g., 9b0e… or GE-20250826-00001"
                  value={gpFilter}
                  onChange={(e) => setGpFilter(e.target.value)}
                />
              </div>
              <datalist id="gp-datalist">
                {recentGPs.map((g) => (
                  <option
                    key={g.id}
                    value={g.id}
                  >{`${g.gate_pass_no} · ${fmtDate(g.created_at)} · ${g.vehicle_no || ""}`}</option>
                ))}
                {recentGPs.map((g) => (
                  <option key={`${g.id}-no`} value={g.gate_pass_no} />
                ))}
              </datalist>
              <div className="text-[11px] text-slate-500 mt-1">
                Pick from recent or paste the UUID/number; then press <b>Load</b> and{" "}
                <b>Review &amp; Print</b>.
              </div>
            </div>
            <Button onClick={handleReprintLookup} disabled={!gpFilter || loadingGPs} className="gap-1">
              {loadingGPs ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Load</span>
            </Button>
          </div>

          {/* Inline label preview (FULL) */}
          {labelCtx && (
            <div className="mt-3">
              <Label className="text-xs">Label preview (LabelMaster style · 4×6 in)</Label>
              <div className="border rounded p-3 inline-block bg-white">
                <div
                  style={{
                    width: "100mm",
                    height: "150mm",
                    border: "1px solid #e2e8f0",
                    borderRadius: "3mm",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      background: "#1e3a8a",
                      color: "#fff",
                      padding: "2.5mm 3mm",
                      fontWeight: 600,
                      fontSize: "3.2mm",
                    }}
                  >
                    Format No: {LABEL_FORMAT_NO} &nbsp; Version: {LABEL_VERSION} &nbsp;
                    <span style={{ fontWeight: 400, opacity: 0.95 }}>
                      Ref SOP No.: {LABEL_SOP_NO} | GATE ENTRY DETAILS
                    </span>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      padding: "3mm",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3mm",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: "3mm",
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          border: "1px dashed #cbd5e1",
                          borderRadius: "2mm",
                          padding: "3mm",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "3.4mm",
                            marginBottom: "2mm",
                          }}
                        >
                          Gate Entry Details
                        </div>
                        {[
                          ["Purchase Order No.", (labelCtx.po_nos || []).join(", ") || "-"],
                          ["Purchase Order Date", (labelCtx.po_dates || []).join(", ") || "-"],
                          ["Transporter Name", labelCtx.transporter_name || "-"],
                          ["Invoice No", (labelCtx.invoice_nos || []).join(", ") || "-"],
                          ["LRNo.", labelCtx.lr_no || "-"],
                          ["LRDate", labelCtx.lr_date || "-"],
                          ["Driver Name", labelCtx.driver_name || "-"],
                          ["Vehicle No.", labelCtx.vehicle_no || "-"],
                          ["Print By", labelCtx.printed_by || "-"],
                          ["Print Date", labelCtx.print_date || iso()],
                        ].map(([k, v], i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "4mm",
                              padding: "0.8mm 0",
                              borderBottom: i === 9 ? "none" : "1px dotted #e5e7eb",
                            }}
                          >
                            <span style={{ fontSize: "3.2mm" }}>{k}</span>
                            <span
                              style={{
                                fontSize: "3.2mm",
                                fontWeight: 600,
                                textAlign: "right",
                              }}
                            >
                              {v}
                            </span>
                          </div>
                        ))}
                        <div style={{ marginTop: "2mm", fontSize: "3.2mm" }}>
                          <b>No:</b> <span style={{ fontFamily: "monospace" }}>{labelCtx.gate_pass_no}</span>
                        </div>
                      </div>
                      {labelQr && (
                        <img
                          src={labelQr}
                          alt="QR"
                          style={{
                            width: "16mm",
                            height: "16mm",
                            objectFit: "contain",
                            border: "1px solid #e2e8f0",
                            borderRadius: "1mm",
                            padding: "1mm",
                            background: "#fff",
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "2mm 3mm",
                      borderTop: "1px solid #e5e7eb",
                      background: "#f8fafc",
                    }}
                  >
                    <img src={getLogoUrl()} alt="logo" style={{ height: "8mm", objectFit: "contain" }} />
                    <div style={{ fontSize: "3mm", color: "#475569" }}>
                      The label has been generated electronically and is valid without signature.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-PO dropdown */}
      <Card className="p-3 mb-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qpo" className="text-xs">
              Filter Open Purchase Orders
            </Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
              <Input
                id="qpo"
                placeholder="Type to filter by PO No. or Vendor..."
                className="pl-8"
                value={qPo}
                onChange={(e) => setQPo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => loadOpenPOs(qPo)} disabled={poSearchBusy} className="gap-1">
              {poSearchBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Refresh</span>
            </Button>
            <Button variant="secondary" onClick={addSelectedPOs} className="gap-1">
              <Plus className="w-4 h-4" />
              <span>Add selected PO(s)</span>
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {poSearchBusy ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <Label className="text-xs mb-1 block">Open PO list (multi-select)</Label>
              <select
                multiple
                size={Math.min(Math.max(filteredPoList.length, 4), 10)}
                className="w-full border rounded p-2 text-sm"
                value={poSelect}
                onChange={(e) => setPoSelect(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {filteredPoList.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.po_no} • {fmtDate(opt.po_date)}
                    {opt.vendor ? ` • ${opt.vendor.name}` : ""} {opt.invoice_no ? ` • INV ${opt.invoice_no}` : ""} •{" "}
                    {renderStatusTag(opt.coverage)}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-slate-500 mt-1">
                Tip: Hold Ctrl/Cmd to select multiple POs. &nbsp;Legend: 🆕 No GP · 🟡 Partial · ✅ Full
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Selected POs + materials */}
      <div className="space-y-3">
        {selectedPos.map((po) => (
          <Card key={po.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <div className="font-medium">{po.po_no}</div>
                <span className="text-xs text-slate-500">Date: {fmtDate(po.po_date)}</span>
                {po.invoice_no && <span className="text-xs text-slate-500">• INV: {po.invoice_no}</span>}
                {po.vendor && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                    <Building2 className="w-3 h-3" />
                    {po.vendor.name || "—"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExpandedPo((s) => ({ ...s, [po.id]: !s[po.id] }))}
                  className="gap-1"
                >
                  {expandedPo[po.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span>{expandedPo[po.id] ? "Hide" : "Show"} Materials</span>
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removePO(po.id)} className="gap-1">
                  <Trash2 className="w-4 h-4" />
                  <span>Remove</span>
                </Button>
              </div>
            </div>

            {loadingPoItems[po.id] ? (
              <div className="mt-3">
                <Skeleton className="h-24" />
              </div>
            ) : (
              expandedPo[po.id] && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Package className="w-4 h-4 text-indigo-600" />
                      Materials in PO
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setAllItemsChecked(po.id, true)}>
                        Select All
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setAllItemsChecked(po.id, false)}>
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-auto rounded-md border">
                    <table className="min-w-[720px] w-full">
                      <thead>
                        <tr>
                          <th className="text-left text-xs font-semibold bg-slate-50 p-2 w-10">Add</th>
                          <th className="text-left text-xs font-semibold bg-slate-50 p-2">Material Code</th>
                          <th className="text-left text-xs font-semibold bg-slate-50 p-2">Material Description</th>
                          <th className="text-left text-xs font-semibold bg-slate-50 p-2">PO Quantity</th>
                          <th className="text-left text-xs font-semibold bg-slate-50 p-2">UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map((it) => (
                          <tr key={it.id} className="odd:bg-white even:bg-slate-50/50">
                            <td className="p-2">
                              <input type="checkbox" checked={!!it.selected} onChange={() => toggleItem(po.id, it.id)} />
                            </td>
                            <td className="p-2 text-sm font-mono">{it.material_code}</td>
                            <td className="p-2 text-sm">{it.material_description}</td>
                            <td className="p-2 text-sm">{it.po_qty}</td>
                            <td className="p-2 text-sm">{it.uom}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-slate-500 mt-2">
                    Tip: You can add multiple Purchase Orders; a single Gate Pass will reference all of them.
                  </div>
                </div>
              )
            )}
          </Card>
        ))}
      </div>

      {/* Gate details form */}
      <Card className="p-3 mt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Transporter Name</Label>
            <div className="relative">
              <Truck className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
              <Input
                className="pl-8"
                value={form.transporter_name}
                onChange={(e) => onChange("transporter_name", e.target.value)}
                placeholder="e.g., BlueDart Logistics"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">LR No.</Label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-2 top-2.5 text-indigo-700" />
              <Input
                className="pl-8"
                value={form.lr_no}
                onChange={(e) => onChange("lr_no", e.target.value)}
                placeholder="LR/Consignment No."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">LR Date</Label>
            <div className="relative">
              <CalendarIcon className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
              <Input type="date" className="pl-8" value={form.lr_date} onChange={(e) => onChange("lr_date", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Driver Name</Label>
            <div className="relative">
              <UserRound className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
              <Input
                className="pl-8"
                value={form.driver_name}
                onChange={(e) => onChange("driver_name", e.target.value)}
                placeholder="Full name"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Vehicle No.</Label>
            <div className="relative">
              <Truck className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
              <Input
                className="pl-8"
                value={form.vehicle_no}
                onChange={(e) => onChange("vehicle_no", e.target.value)}
                placeholder="e.g., AB12 CD 3456"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Delivery Note</Label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-2 top-2.5 text-indigo-700" />
              <Input
                className="pl-8"
                value={form.delivery_note}
                onChange={(e) => onChange("delivery_note", e.target.value)}
                placeholder="Reference or remarks"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm select-none">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            <span>Verified invoice/receipt details against selected PO(s).</span>
          </label>
          {!verified && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              Required before save
            </span>
          )}
        </div>

        {/* Secondary action bar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={saving || !verified} className="gap-1">
            <Save className="w-4 h-4" />
            Save
          </Button>
          <Button variant="secondary" onClick={openEdit} disabled={!labelCtx} className="gap-1">
            <Printer className="w-4 h-4" />
            Review &amp; Print
          </Button>
          <Button variant="secondary" onClick={printA4} disabled={!gatePassNo} className="gap-1">
            <Printer className="w-4 h-4" />
            Print A4 Summary
          </Button>
          <Button variant="outline" onClick={() => nav("/material-inward/gate-entry")} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Gate Entry
          </Button>
        </div>
      </Card>

      {/* A4 summary card (print surface) */}
      <div className="mt-3">
        <Card ref={a4Ref} className="p-4">
          <div
            className="header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <img src={logo} className="logo" alt="logo" style={{ height: 40 }} />
            <div>
              <div className="h1" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {COMPANY_NAME} — Inbound Gate Pass
              </div>
              <div className="meta" style={{ fontSize: 12, color: "#374151" }}>
                Gate Pass No: {gatePassNo || "(pending)"} • Date: {iso()}
              </div>
            </div>
            {labelQr && (
              <div className="header-right">
                <img
                  src={labelQr}
                  alt="Gate Pass QR"
                  className="qr"
                  style={{
                    height: 120,
                    width: 120,
                    objectFit: "contain",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 4,
                    background: "#fff",
                  }}
                />
              </div>
            )}
          </div>
          <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="box" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
              <div className="font-semibold text-sm mb-2">Gate Details</div>
              <div className="small">
                <b>Transporter:</b> {labelCtx?.transporter_name || form.transporter_name || "-"}
              </div>
              <div className="small">
                <b>LR No.:</b> {labelCtx?.lr_no || form.lr_no || "-"} &nbsp; <b>LR Date:</b>{" "}
                {labelCtx?.lr_date || form.lr_date || "-"}
              </div>
              <div className="small">
                <b>Driver:</b> {labelCtx?.driver_name || form.driver_name || "-"} &nbsp; <b>Vehicle:</b>{" "}
                {labelCtx?.vehicle_no || form.vehicle_no || "-"}
              </div>
              <div className="small">
                <b>Delivery Note:</b> {labelCtx?.delivery_note || form.delivery_note || "-"}
              </div>
            </div>
            <div className="box" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
              <div className="font-semibold text-sm mb-2">PO & Vendor Summary</div>
              <div className="small">
                <b>PO Nos:</b> {poNosStr}
              </div>
              <div className="small">
                <b>PO Dates:</b> {poDatesStr}
              </div>
              <div className="small">
                <b>Invoice No(s):</b> {(labelCtx?.invoice_nos?.join(", ") || invoiceNosArr.join(", ")) || "-"}
              </div>
            </div>
          </div>
          <div className="box" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginTop: 12 }}>
            <div className="font-semibold text-sm mb-2">Materials</div>
            <div className="overflow-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      PO No.
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      Material Code
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      Description
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      PO Qty
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      UOM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewBundle.flatMap((b) =>
                    b.materials.map((m, i) => (
                      <tr key={`${b.po_id}-${m.id}-${i}`}>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>{b.po_no}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                          {m.material_code}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                          {m.material_description}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>{m.po_qty}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>{m.uom}</td>
                      </tr>
                    ))
                  )}
                  {previewBundle.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 8px",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        No materials selected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="small muted" style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            This Gate Pass is generated by {COMPANY_NAME}. Stay Digital. Stay Compliant.
          </div>
        </Card>
      </div>

      {/* -------- Review/Edit Modal -------- */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-700" />
              <div className="font-semibold">Review &amp; Edit before Print</div>
              <div className="ml-auto text-xs text-slate-500">GP: {gatePassNo}</div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Transporter Name</Label>
                <div className="relative">
                  <Truck className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
                  <Input
                    className="pl-8"
                    value={edit.transporter_name}
                    onChange={(e) => setEdit((s) => ({ ...s, transporter_name: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">LR No.</Label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-2 top-2.5 text-indigo-700" />
                  <Input className="pl-8" value={edit.lr_no} onChange={(e) => setEdit((s) => ({ ...s, lr_no: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">LR Date</Label>
                <div className="relative">
                  <CalendarIcon className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
                  <Input
                    type="date"
                    className="pl-8"
                    value={edit.lr_date}
                    onChange={(e) => setEdit((s) => ({ ...s, lr_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Driver Name</Label>
                <div className="relative">
                  <UserRound className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
                  <Input
                    className="pl-8"
                    value={edit.driver_name}
                    onChange={(e) => setEdit((s) => ({ ...s, driver_name: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Vehicle No.</Label>
                <div className="relative">
                  <Truck className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
                  <Input
                    className="pl-8"
                    value={edit.vehicle_no}
                    onChange={(e) => setEdit((s) => ({ ...s, vehicle_no: e.target.value }))}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Delivery Note</Label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-2 top-2.5 text-indigo-700" />
                  <Input
                    className="pl-8"
                    value={edit.delivery_note}
                    onChange={(e) => setEdit((s) => ({ ...s, delivery_note: e.target.value }))}
                  />
                </div>
              </div>
              <div className="sm:col-span-2 text-xs text-slate-500">
                Your edits will be saved to this gate pass and reflected on the label.
              </div>
            </div>
            <div className="px-4 py-3 border-t flex items-center gap-2 justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEdit(false);
                  nav("/material-inward/gate-entry");
                }}
                className="gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Gate Entry
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowEdit(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const rec = await updateGatePass(edit);
                      const ctx = {
                        gate_pass_no: rec.gate_pass_no,
                        transporter_name: rec.transporter_name || "",
                        lr_no: rec.lr_no || "",
                        lr_date: rec.lr_date || "",
                        driver_name: rec.driver_name || "",
                        vehicle_no: rec.vehicle_no || "",
                        delivery_note: rec.delivery_note || "",
                        po_nos: (rec.po_bundle_json || []).map((b) => b.po_no).filter(Boolean),
                        po_dates: (rec.po_bundle_json || []).map((b) => fmtDate(b.po_date)).filter(Boolean),
                        invoice_nos: (rec.po_bundle_json || []).map((b) => b.invoice_no).filter(Boolean),
                        printed_by: user?.email || user?.user_metadata?.email || "",
                        // rec.printed_at may not exist; fallback to today
                        print_date: rec.printed_at ? fmtDate(rec.printed_at) : iso(),
                      };
                      setLabelCtx(ctx);
                      const img = await makeQrDataUrl(buildLabelPayload(ctx));
                      setLabelQr(img);
                      setShowEdit(false);
                      printLabel(ctx, img);
                    } catch {
                      /* toast already shown */
                    }
                  }}
                >
                  Update &amp; Print
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GateEntry;
