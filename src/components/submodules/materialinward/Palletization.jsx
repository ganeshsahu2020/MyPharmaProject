// src/components/submodules/materialinward/Palletization.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";
import toast from "react-hot-toast";

import Button from "../../ui/button";
import { Card } from "../../ui/card";
import Input from "../../ui/Input";
import Label from "../../ui/Label";
import { Skeleton } from "../../ui/skeleton";

import {
  Boxes,
  Building2,
  Factory,
  MapPin,
  PackageSearch,
  QrCode,
  ScanLine,
  ArrowLeftRight,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Info,
  Search,
  X,
  ShieldCheck,
  FlagTriangleRight,
} from "lucide-react";

/* ---------------- utils ---------------- */
const nowISO = () => new Date().toISOString();
const toShort = (s) => (s ?? "").toString().trim();
const uniqBy = (arr, keyFn) =>
  Array.from(new Map((arr || []).map((x) => [keyFn(x), x])).values());
const chunk = (arr, n) =>
  Array.from(
    { length: Math.ceil((arr || []).length / n) },
    (_, i) => (arr || []).slice(i * n, i * n + n)
  );
const normalizeUid = (s) =>
  toShort(s).replace(/^uid:\s*/i, "").replace(/:\d+$/, "");
const normalizeLoc = (s) => toShort(s).replace(/^loc:\s*/i, "");
const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;
const fixed3 = (n) => Number(n || 0).toFixed(3);

/* NEW: label qty formatter that respects uom_decimals from vw_palletize_cards */
const fmtQty = (val, dec = 3) => Number(val ?? 0).toFixed(dec);

/* unified accessor */
const getUid = (r) => r?.label_uid ?? r?.uid ?? "";

/* =================== CHANGE #1: broader normalizer (with UOM fix) =================== */
const normalizeViewRow = (d) => {
  const uid = d?.uid ?? d?.label_uid;

  // UOM normalization:
  // - Many views carry a human/base name alongside an internal code.
  // - Prefer human/base name first; fall back to code.
  const uom_code =
    d?.uom_code ?? d?.uom ?? d?.label_uom ?? d?.uom_id ?? null;           // internal code like "UOM003"
  const uom_name =
    d?.uom_name ?? d?.uom_base ?? d?.uom_desc ?? d?.base_uom ?? null;      // human/base like "KG"
  const uom_display = uom_name || uom_code || null;

  return {
    ...d,
    uid,
    label_uid: uid,

    // expose both for clarity
    uom_code,
    uom_name,
    uom_display,

    // keep legacy `uom` field usable in old renderers (prefer the nice name)
    uom: uom_display ?? uom_code ?? d?.uom ?? null,

    // core identifiers
    line_no: d?.line_no ?? d?.grn_line_no ?? d?.label_line_no ?? null,

    // label numbers
    net_qty:
      d?.net_qty ??
      d?.label_net_qty ??
      d?.label_qty ??
      d?.net_qty_label ??
      null,
    num_containers:
      d?.num_containers ??
      d?.label_containers ??
      d?.num_of_containers ??
      null,
    container_index:
      d?.container_index ??
      d?.label_container_index ??
      d?.container_no ??
      null,

    // batch
    item_batch_no:
      d?.item_batch_no ?? d?.sap_batch_no ?? d?.item_batch_no_alias ?? null,

    // printed meta
    printed_by: d?.printed_by ?? d?.label_printed_by ?? d?.printed_user ?? null,
    printed_at: d?.printed_at ?? d?.label_printed_at ?? null,

    // vendor / shipping / storage
    vendor_code: d?.vendor_code ?? d?.label_vendor_code ?? null,
    vendor_batch_no: d?.vendor_batch_no ?? d?.label_vendor_batch_no ?? null,
    manufacturer: d?.manufacturer ?? d?.label_manufacturer ?? null,
    mfg_date: d?.mfg_date ?? d?.label_mfg_date ?? null,
    exp_date: d?.exp_date ?? d?.label_exp_date ?? null,
    next_inspection_date:
      d?.next_inspection_date ?? d?.label_next_inspection_date ?? null,
    storage_condition:
      d?.storage_condition ?? d?.label_storage_condition ?? null,
    lr_no: d?.lr_no ?? d?.label_lr_no ?? null,
    lr_date: d?.lr_date ?? d?.label_lr_date ?? null,
    transporter_name:
      d?.transporter_name ?? d?.label_transporter_name ?? null,
    vehicle: d?.vehicle ?? d?.label_vehicle ?? null,
    invoice_no: d?.invoice_no ?? d?.label_invoice_no ?? null,
  };
};

/* ---- auth / roles ---- */
const extractRoles = (session) => {
  const r1 = session?.user?.app_metadata?.roles ?? [];
  const r2 = session?.user?.user_metadata?.roles ?? [];
  return Array.from(
    new Set(
      []
        .concat(Array.isArray(r1) ? r1 : [r1].filter(Boolean))
        .concat(Array.isArray(r2) ? r2 : [r2].filter(Boolean))
        .map((x) => String(x).toUpperCase())
    )
  );
};

const pillTone = (status) => {
  switch ((status || "").toUpperCase()) {
    case "QC_RELEASED":
    case "UNRESTRICTED":
      return "emerald";
    case "UNDER_QC":
    case "RESTRICTED":
      return "amber";
    case "PROD_RETURNED":
      return "violet";
    case "REJECTED":
      return "rose";
    case "QUARANTINE":
      return "blue";
    default:
      return "blue";
  }
};

/* Static Tailwind classes to avoid purge issues */
const TONE_CLS = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

/* ---- usage helpers (FULL / PARTIAL / EMPTY) ---- */
const deriveStatus = (row) => {
  const labelQty = Number(row?.net_qty ?? 0);
  const liveQty = Number(row?.qty ?? row?.net_qty ?? 0);
  const labelC = row?.num_containers ?? null;
  const liveC = row?.containers ?? null;

  let usage = "FULL";
  if (row?.status === "OUT" || liveQty === 0 || (liveC !== null && liveC === 0)) {
    usage = "EMPTY";
  } else if (
    liveQty < labelQty ||
    (labelC !== null && liveC !== null && liveC < labelC)
  ) {
    usage = "PARTIAL";
  }

  const consumed = Math.max(0, labelQty - liveQty);
  const pct = labelQty > 0 ? (liveQty / labelQty) * 100 : null;

  return {
    usage,
    labelQty,
    liveQty,
    consumedQty: consumed,
    pctRemaining: pct,
    labelContainers: labelC,
    liveContainers: liveC,
    consumedContainers: (labelC ?? 0) - (liveC ?? 0),
  };
};

const usagePillClass = (t) => {
  const tone = t === "FULL" ? "emerald" : t === "PARTIAL" ? "amber" : "rose";
  return `inline-flex items-center px-2 py-[2px] rounded border text-xs ${TONE_CLS[tone]}`;
};
const qcPillClass = (status) =>
  `inline-flex items-center gap-1 px-2 py-[2px] rounded border text-xs ${TONE_CLS[pillTone(
    status
  )]}`;

/* ---------------- material reasons ---------------- */
// Reasons specific to Put In / Put-Away flows (GRN, returns, etc.)
const PUTIN_REASONS = [
  { value: "GRN_RECEIPT_AGAINST_PO", label: "Material Received Against PO" },
  { value: "PRODUCTION_RETURN_UNUSED", label: "Production Return — Unused" },
  { value: "PRODUCTION_RETURN_LEFTOVER", label: "Production Return — Left Over" },
  { value: "REJECTED_RETURN", label: "Rejected — Return to Store" },
  { value: "REWORK_RETURN", label: "Rework / Rescreen Return" },
  { value: "CMO_RETURN", label: "Return from CMO / Third-Party" },
  { value: "INTERPLANT_TRANSFER_IN", label: "Inter-plant / Warehouse Transfer (IN)" },
  { value: "OTHER_PUTIN", label: "Other (Put In)" },
];

// Existing general movement reasons (kept as-is)
const MOVEMENT_REASONS = [
  { value: "QC_SAMPLING", label: "QC Sampling" },
  { value: "DISPENSING", label: "Dispensing for Production Use" },
  { value: "RETURN_TO_VENDOR", label: "Return to Vendor" },
  { value: "REJECTED", label: "Rejected Material" },
  { value: "DAMAGED", label: "Damaged Material" },
  { value: "EXPIRED_OBSOLETE", label: "Expiry / Obsolete Material" },
  { value: "INTERNAL_TRANSFER", label: "Others — Internal Transfer" },
  { value: "SHIP_TO_CMO", label: "Others — Shipment to Third-Party (CMO)" },
  { value: "DISPOSAL", label: "Others — Destruction / Disposal" },
  { value: "RECALL", label: "Others — Recall" },
  { value: "REWORK", label: "Others — Rework" },
  { value: "STABILITY_ISSUANCE", label: "Others — Issuance to Stability Study" },
  { value: "OTHER", label: "Others — Other" },
];

// Grouped dropdown data
const REASON_GROUPS = [
  { group: "Put In / Put-Away", options: PUTIN_REASONS },
  { group: "General Movement", options: MOVEMENT_REASONS },
];

/* Tiny modal */
const Modal = ({ open, title, onClose, children, footer }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[95%] max-w-4xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="p-1 rounded hover:bg-slate-100" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t bg-slate-50">{footer}</div>}
      </div>
    </div>
  );
};

export default function Palletization() {
  const { session } = useAuth() || {};
  const user = session?.user || null;

  /* ------------ helpers that require a live session (RLS friendly) ------------ */
  const requireAuth = async () => {
    const {
      data: { session: live },
    } = await supabase.auth.getSession();
    if (!live?.user?.id) {
      toast.error("You're signed out. Please log in and try again.");
      throw new Error("No session");
    }
    return live.user.id;
  };

  // Insert helper for location events: stamps event_by and uses returning:'minimal'
  const insertEvents = async (rows) => {
    const uid = await requireAuth();
    const payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      ...r,
      event_by: uid,
    }));
    return supabase.from("material_location_events").insert(payload, {
      returning: "minimal",
    });
  };

  // Insert helper for quality events: stamps changed_by / changed_by_name
  const insertQualityEvent = async (row) => {
    const uid = await requireAuth();
    return supabase
      .from("material_quality_events")
      .insert(
        {
          ...row,
          changed_by: uid,
          changed_by_name: user?.email || user?.id || null,
        },
        { returning: "minimal" }
      );
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) =>
      console.log("has session?", !!session)
    );
  }, []);

  /* ---- testing switch (set false to re-lock) ---- */
  const ALLOW_ANY_QC_RELEASE = false;

  /* ---- auth / roles ---- */
  const roles = useMemo(() => extractRoles(session), [session]);
  const hasRole = (r) => roles.includes(String(r).toUpperCase());
  const canSetQCReleased =
    ALLOW_ANY_QC_RELEASE || hasRole("QA") || hasRole("SUPER ADMIN") || hasRole("ADMIN");

  /* ---------- masters ---------- */
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(true);

  const [plants, setPlants] = useState([]);
  const [subplants, setSubplants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);

  const [plant, setPlant] = useState("");
  const [subplant, setSubplant] = useState("");
  const [department, setDepartment] = useState("");
  const [area, setArea] = useState("");

  const [locationId, setLocationId] = useState("");
  const [locationCode, setLocationCode] = useState("");

  /* ---------- scanning / preview ---------- */
  const [scanLoc, setScanLoc] = useState("");
  const [scanUID, setScanUID] = useState("");
  const scanLocRef = useRef(null);
  const scanUIDRef = useRef(null);

  const [labelLoading, setLabelLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const [putQty, setPutQty] = useState("");
  const [putContainers, setPutContainers] = useState("");
  const [doneBy, setDoneBy] = useState((user?.email || user?.id || "").toString());

  // movement reason (global for preview actions)
  const [moveReason, setMoveReason] = useState("");
  const [moveNote, setMoveNote] = useState("");

  // picking inputs (explicit)
  const [pickQty, setPickQty] = useState("0.000");
  const [pickContainers, setPickContainers] = useState("0");

  /* ---------- current & global ---------- */
  const [policy, setPolicy] = useState("FEFO");
  const [listLoading, setListLoading] = useState(false);
  const [current, setCurrent] = useState([]);
  const [transferTo, setTransferTo] = useState("");

  const [tab, setTab] = useState("location");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalRaw, setGlobalRaw] = useState([]);
  const [globalQuery, setGlobalQuery] = useState("");

  /* ---------- consume modal ---------- */
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeRow, setConsumeRow] = useState(null);
  const [consumeQty, setConsumeQty] = useState("0.000");
  const [consumeContainers, setConsumeContainers] = useState("0");
  const [consumeReason, setConsumeReason] = useState("");
  const [consumeNote, setConsumeNote] = useState("");

  /* ---------- details modal ---------- */
  const [detailRow, setDetailRow] = useState(null);

  /* =================== CHANGE #4: async details enrichment =================== */
  const openDetails = async (row) => {
    const uid = getUid(row);
    setDetailRow(row); // show immediately
    try {
      const [labelMap, qMap] = await Promise.all([
        fetchLatestLabelsByUids([uid]),
        fetchQualityByUids([uid]),
      ]);
      const qrow = qMap.get(uid);
      const merged = normalizeViewRow({
        ...(row || {}),
        ...(labelMap.get(uid) || {}),
        ...(qrow
          ? {
              quality_status: qrow.quality_status,
              quality_changed_at: qrow.quality_changed_at,
              quality_reason: qrow.quality_reason,
            }
          : {}),
      });
      setDetailRow(merged);
    } catch (e) {
      console.warn("detail enrich failed", e);
    }
  };
  const closeDetails = () => setDetailRow(null);
  const fmtDT = (s) => (s ? new Date(s).toLocaleString() : "");
  const fmtNum = (n, dec = 3) => Number(n ?? 0).toFixed(dec);
  const KV = ({ k, v }) => (
    <div className="grid grid-cols-5 gap-2 text-[13px]">
      <div className="col-span-2 text-slate-500">{k}</div>
      <div className="col-span-3 font-medium break-words">{v ?? "-"}</div>
    </div>
  );

  /* ---------- load masters ---------- */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLocLoading(true);
        const [locRes, areaRes, depRes, subRes, plantRes] = await Promise.all([
          supabase
            .from("location_master")
            .select("id,location_id,location_name,area_uid,status")
            .order("location_id", { ascending: true }),
          supabase.from("area_master").select("id,area_name,department_uid,status"),
          supabase
            .from("department_master")
            .select("id,department_name,subplant_uid,status"),
          supabase.from("subplant_master").select("id,subplant_name,plant_uid,status"),
          supabase
            .from("plant_master")
            .select("id,plant_name,plant_code,plant_id,status"),
        ]);
        for (const r of [locRes, areaRes, depRes, subRes, plantRes])
          if (r.error) throw r.error;

        const areasById = new Map((areaRes.data || []).map((x) => [x.id, x]));
        const depsById = new Map((depRes.data || []).map((x) => [x.id, x]));
        const subsById = new Map((subRes.data || []).map((x) => [x.id, x]));
        const plantsById = new Map((plantRes.data || []).map((x) => [x.id, x]));

        const std = (locRes.data || [])
          .filter((l) => !!l.location_id)
          .map((l) => {
            const area = areasById.get(l.area_uid);
            const dep = area ? depsById.get(area.department_uid) : undefined;
            const sub = dep ? subsById.get(dep.subplant_uid) : undefined;
            const pla = sub ? plantsById.get(sub.plant_uid) : undefined;
            const isActive =
              (l.status || "Active") !== "Inactive" &&
              (area?.status || "Active") !== "Inactive" &&
              (dep?.status || "Active") !== "Inactive" &&
              (sub?.status || "Active") !== "Inactive" &&
              (pla?.status || "Active") !== "Inactive";
            return {
              id: l.id,
              code: l.location_id,
              name: l.location_name || l.location_id,
              plant: pla?.plant_name || pla?.plant_code || pla?.plant_id || "",
              subplant: sub?.subplant_name || "",
              department: dep?.department_name || "",
              area: area?.area_name || "",
              is_active: isActive,
            };
          });

        if (!active) return;
        setLocations(std);
        setPlants(uniqBy(std.map((r) => r.plant).filter(Boolean), (x) => x));
        setSubplants([]);
        setDepartments([]);
        setAreas([]);
      } catch (e) {
        console.error(e);
        toast.error(e?.message || "Failed to load locations");
      } finally {
        if (active) setLocLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const scopedLocations = useMemo(
    () =>
      locations.filter(
        (r) =>
          r.is_active !== false &&
          (!plant || r.plant === plant) &&
          (!subplant || r.subplant === subplant) &&
          (!department || r.department === department) &&
          (!area || r.area === area)
      ),
    [locations, plant, subplant, department, area]
  );

  useEffect(() => {
    const subs = uniqBy(
      scopedLocations.map((r) => r.subplant).filter(Boolean),
      (x) => x
    );
    setSubplants(subs);
    setSubplant((v) => (v && subs.includes(v) ? v : ""));
  }, [scopedLocations]);

  useEffect(() => {
    const deps = uniqBy(
      scopedLocations.map((r) => r.department).filter(Boolean),
      (x) => x
    );
    setDepartments(deps);
    setDepartment((v) => (v && deps.includes(v) ? v : ""));
  }, [scopedLocations]);

  useEffect(() => {
    const ars = uniqBy(
      scopedLocations.map((r) => r.area).filter(Boolean),
      (x) => x
    );
    setAreas(ars);
    setArea((v) => (v && ars.includes(v) ? v : ""));
  }, [scopedLocations]);

  const locationOptions = useMemo(
    () =>
      scopedLocations.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.code + (r.name && r.name !== r.code ? ` — ${r.name}` : ""),
      })),
    [scopedLocations]
  );

  useEffect(() => {
    if (!locationId) return;
    if (!locationOptions.some((o) => o.id === locationId)) {
      setLocationId("");
      setLocationCode("");
      setCurrent([]);
    }
  }, [locationOptions, locationId]);

  const findLocById = (id) => locations.find((l) => l.id === id);
  const findLocByCode = (code) => locations.find((l) => l.code === code);

  /* ------- label + QC helpers ------- */
  // Different selects for view vs base-table to avoid column mismatches (item_batch_no vs sap_batch_no)
  const labelSelectView =
    "uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,num_containers,container_index,item_batch_no,invoice_no,vendor_code,vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at";
  const labelSelectBase =
    "uid,grn_no,line_no,item_code,material_code,material_desc,uom,net_qty,num_containers,container_index,sap_batch_no,invoice_no,vendor_code,vendor_batch_no,manufacturer,mfg_date,exp_date,next_inspection_date,storage_condition,lr_no,lr_date,transporter_name,vehicle,printed_by,printed_at";

  const fetchLatestLabelsByUids = async (uids) => {
    if (!uids?.length) return new Map();
    try {
      const { data, error } = await supabase
        .from("vw_label_prints_latest")
        .select(labelSelectView)
        .in("uid", uids);
      if (error) throw error;
      const arr = (data || []).map((r) => normalizeViewRow(r));
      return new Map(arr.map((r) => [r.uid, r]));
    } catch {
      // Fallback: base table
      const { data, error } = await supabase
        .from("label_prints")
        .select(labelSelectBase)
        .in("uid", uids)
        .order("printed_at", { ascending: false });
      if (error) throw error;
      const m = new Map();
      for (const row of data || []) {
        const norm = normalizeViewRow(row);
        if (!m.has(norm.uid)) m.set(norm.uid, norm);
      }
      return m;
    }
  };

  const fetchQualityByUids = async (uids) => {
    if (!uids?.length) return new Map();
    const { data, error } = await supabase
      .from("vw_material_quality_latest")
      .select("label_uid,quality_status,quality_changed_at,quality_reason")
      .in("label_uid", uids);
    if (error) {
      console.warn("quality fetch error", error.message);
      return new Map();
    }
    return new Map((data || []).map((r) => [r.label_uid, r]));
  };

  // 406-safe lookup (view -> table fallback)
  const lookupLabel = async (uidInput) => {
    setLabelLoading(true);
    try {
      const uid = normalizeUid(uidInput);

      const { data: vData, error: vErr } = await supabase
        .from("vw_label_prints_latest")
        .select(labelSelectView)
        .eq("uid", uid)
        .maybeSingle();

      if (!vErr && vData) return normalizeViewRow(vData);

      const { data, error } = await supabase
        .from("label_prints")
        .select(labelSelectBase)
        .eq("uid", uid)
        .order("printed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? normalizeViewRow(data) : null;
    } finally {
      setLabelLoading(false);
    }
  };

  /* ---------- FALLBACK: compute current from events (RLS tolerant) ---------- */
  const computeCurrentFromEvents = async (loc) => {
    const first = await supabase
      .from("material_location_events")
      .select("label_uid")
      .or(`to_location.eq.${loc},from_location.eq.${loc}`)
      .order("event_at", { ascending: false })
      .limit(5000);

    if (first.error) {
      if (first.status === 403 || /permission denied/i.test(first.error.message || "")) {
        console.warn("No SELECT policy on material_location_events; skipping events fallback");
        return [];
      }
      throw first.error;
    }

    const uids = uniqBy(
      (first.data || []).map((r) => r.label_uid).filter(Boolean),
      (x) => x
    ).slice(0, 1200);
    if (!uids.length) return [];

    let allEvents = [];
    for (const part of chunk(uids, 200)) {
      const ev = await supabase
        .from("material_location_events")
        .select(
          "label_uid,event_type,from_location,to_location,qty,container_count,delta_qty,delta_containers,event_at,created_at"
        )
        .in("label_uid", part)
        .order("event_at", { ascending: true });

      if (ev.error) {
        if (ev.status === 403 || /permission denied/i.test(ev.error.message || "")) {
          console.warn("RLS blocked detailed events; aborting fallback");
          return [];
        }
        throw ev.error;
      }
      allEvents = allEvents.concat(ev.data || []);
    }

    const labelMap = await fetchLatestLabelsByUids(uids);
    const qualityMap = await fetchQualityByUids(uids);

    const stateByUid = new Map();
    for (const uid of uids) {
      const label = labelMap.get(uid) || {};
      const q = qualityMap.get(uid) || {};
      const baselineQty = Number(label.net_qty || 0);
      const baselineC = Number(label.num_containers || 0);

      const evts = allEvents.filter((e) => e.label_uid === uid);
      let location = null;
      let status = "OUT";
      let qty = baselineQty;
      let containers = baselineC;
      let placedAt = null;
      let updatedAt = null;

      for (const e of evts) {
        const ts = e.event_at || e.created_at || null;
        updatedAt = ts || updatedAt;

        switch ((e.event_type || "").toUpperCase()) {
          case "PUTAWAY": {
            location = e.to_location || location;
            status = location ? "IN" : "OUT";
            qty = e.qty != null ? Number(e.qty) : qty;
            containers = e.container_count != null ? Number(e.container_count) : containers;
            if (location === loc) placedAt = ts || placedAt;
            break;
          }
          case "TRANSFER": {
            if (e.to_location) {
              location = e.to_location;
              status = "IN";
              if (location === loc) placedAt = ts || placedAt;
            }
            if (e.qty != null) qty = Number(e.qty);
            if (e.container_count != null) containers = Number(e.container_count);
            break;
          }
          case "CONSUME": {
            const dq = Number(e.delta_qty || 0);
            const dc = Number(e.delta_containers || 0);
            qty = Math.max(0, qty - dq);
            containers = Math.max(0, containers - dc);
            break;
          }
          case "EMPTY_OUT": {
            location = null;
            status = "OUT";
            qty = 0;
            containers = 0;
            break;
          }
          default:
            break;
        }
      }

      if (location === loc && status === "IN") {
        stateByUid.set(
          uid,
          normalizeViewRow({
            label_uid: uid,
            location_code: loc,
            status: "IN",
            qty,
            containers,
            placed_at: placedAt,
            updated_at: updatedAt,
            quality_status: q.quality_status || "QUARANTINE",
            ...label,
          })
        );
      }
    }
    return Array.from(stateByUid.values());
  };

  /* ------- loaders (current/global) ------- */
  const loadCurrentAtLocation = async (code = locationCode) => {
    const loc = toShort(code);
    if (!loc) {
      setCurrent([]);
      return;
    }
    setListLoading(true);
    try {
      const q = await supabase.from("vw_mapped_in_full").select("*").eq("location_code", loc);

      /* =================== CHANGE #2: enrich view rows =================== */
      if (!q.error && (q.data || []).length) {
        const baseRows = (q.data || []).map((d) => normalizeViewRow(d));
        const uids = uniqBy(
          baseRows.map((r) => r.uid).filter(Boolean),
          (x) => x
        );
        const [labelMap, qMap] = await Promise.all([
          fetchLatestLabelsByUids(uids),
          fetchQualityByUids(uids),
        ]);
        const rows = baseRows.map((r) => {
          const qrow = qMap.get(r.uid);
          return normalizeViewRow({
            ...r,
            ...(labelMap.get(r.uid) || {}),
            ...(qrow
              ? {
                  quality_status: qrow.quality_status,
                  quality_changed_at: qrow.quality_changed_at,
                  quality_reason: qrow.quality_reason,
                }
              : {}),
          });
        });
        setCurrent(rows);
        return;
      }

      const ml = await supabase
        .from("material_location")
        .select("label_uid,location_code,status,qty,containers,placed_at,updated_at")
        .eq("location_code", loc)
        .eq("status", "IN");
      if (!ml.error && (ml.data || []).length) {
        const uids = (ml.data || []).map((d) => d.label_uid);
        const [labelMap, qMap] = await Promise.all([
          fetchLatestLabelsByUids(uids),
          fetchQualityByUids(uids),
        ]);
        const rows = (ml.data || []).map((d) =>
          normalizeViewRow({
            ...d,
            ...(labelMap.get(d.label_uid) || {}),
            ...(qMap.get(d.label_uid)
              ? { quality_status: qMap.get(d.label_uid).quality_status }
              : {}),
          })
        );
        setCurrent(rows);
        return;
      }
      const derived = await computeCurrentFromEvents(loc);
      setCurrent(derived);
      if (!q.error && !(q.data || []).length) {
        toast("Using events fallback for this location.");
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to load materials in location");
      setCurrent([]);
    } finally {
      setListLoading(false);
    }
  };

  const loadGlobal = async () => {
    setGlobalLoading(true);
    try {
      const tryView = await supabase
        .from("vw_mapped_in_full")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(800);

      /* =================== CHANGE #3: enrich global view rows =================== */
      if (!tryView.error && (tryView.data || []).length) {
        const baseRows = (tryView.data || []).map((d) => normalizeViewRow(d));
        const uids = uniqBy(
          baseRows.map((r) => r.uid).filter(Boolean),
          (x) => x
        );
        const [labelMap, qMap] = await Promise.all([
          fetchLatestLabelsByUids(uids),
          fetchQualityByUids(uids),
        ]);
        const rows = baseRows.map((r) => {
          const qrow = qMap.get(r.uid);
          return normalizeViewRow({
            ...r,
            ...(labelMap.get(r.uid) || {}),
            ...(qrow
              ? {
                  quality_status: qrow.quality_status,
                  quality_changed_at: qrow.quality_changed_at,
                  quality_reason: qrow.quality_reason,
                }
              : {}),
          });
        });
        setGlobalRaw(rows);
        return;
      }

      const base = await supabase
        .from("material_location")
        .select("label_uid,location_code,status,qty,containers,updated_at,placed_at")
        .eq("status", "IN");
      if (!base.error && (base.data || []).length) {
        const uids = uniqBy(
          (base.data || []).map((d) => d.label_uid),
          (x) => x
        );
        const [labelMap, qMap] = await Promise.all([
          fetchLatestLabelsByUids(uids),
          fetchQualityByUids(uids),
        ]);
        const rows = (base.data || []).map((d) =>
          normalizeViewRow({
            ...d,
            ...(labelMap.get(d.label_uid) || {}),
            ...(qMap.get(d.label_uid)
              ? { quality_status: qMap.get(d.label_uid).quality_status }
              : {}),
          })
        );
        setGlobalRaw(rows);
        return;
      }

      // Events fallback (RLS tolerant)
      const cand = await supabase
        .from("material_location_events")
        .select("label_uid")
        .order("event_at", { ascending: false })
        .limit(4000);
      if (cand.error) {
        if (cand.status === 403 || /permission denied/i.test(cand.error.message || "")) {
          console.warn(
            "No SELECT policy on material_location_events; skipping global events fallback"
          );
          setGlobalRaw([]);
          return;
        }
        throw cand.error;
      }
      const uids = uniqBy(
        (cand.data || [])
          .map((r) => r.label_uid)
          .filter(Boolean),
        (x) => x
      ).slice(0, 1200);

      let allRows = [];
      for (const part of chunk(uids, 200)) {
        const labelMap = await fetchLatestLabelsByUids(part);
        const qMap = await fetchQualityByUids(part);

        const evRes = await supabase
          .from("material_location_events")
          .select(
            "label_uid,event_type,from_location,to_location,qty,container_count,delta_qty,delta_containers,event_at,created_at"
          )
          .in("label_uid", part)
          .order("event_at", { ascending: true });
        if (evRes.error) {
          if (
            evRes.status === 403 ||
            /permission denied/i.test(evRes.error.message || "")
          ) {
            console.warn("RLS blocked detailed events; aborting global fallback");
            setGlobalRaw([]);
            return;
          }
          throw evRes.error;
        }

        const byUid = new Map();
        for (const uid of part) {
          const label = labelMap.get(uid) || {};
          let location = null;
          let status = "OUT";
          let qty = Number(label.net_qty || 0);
          let containers = Number(label.num_containers || 0);
          let updatedAt = null;

          const evts = (evRes.data || []).filter((e) => e.label_uid === uid);
          for (const e of evts) {
            const ts = e.event_at || e.created_at || null;
            updatedAt = ts || updatedAt;
            switch ((e.event_type || "").toUpperCase()) {
              case "PUTAWAY":
                location = e.to_location || location;
                status = "IN";
                if (e.qty != null) qty = Number(e.qty);
                if (e.container_count != null) containers = Number(e.container_count);
                break;
              case "TRANSFER":
                if (e.to_location) {
                  location = e.to_location;
                  status = "IN";
                }
                if (e.qty != null) qty = Number(e.qty);
                if (e.container_count != null) containers = Number(e.container_count);
                break;
              case "CONSUME":
                qty = Math.max(0, Number(qty) - Number(e.delta_qty || 0));
                containers = Math.max(
                  0,
                  Number(containers) - Number(e.delta_containers || 0)
                );
                break;
              case "EMPTY_OUT":
                location = null;
                status = "OUT";
                qty = 0;
                containers = 0;
                break;
              default:
                break;
            }
          }
          if (status === "IN" && location) {
            byUid.set(
              uid,
              normalizeViewRow({
                uid,
                location_code: location,
                status,
                qty,
                containers,
                updated_at: updatedAt,
                quality_status: (qMap.get(uid) || {}).quality_status || "QUARANTINE",
                ...label,
              })
            );
          }
        }
        allRows = allRows.concat(Array.from(byUid.values()));
      }
      setGlobalRaw(allRows);
      toast("Using events fallback (global).");
    } catch (e) {
      console.error("Global load error:", e);
      toast.error(e?.message || "Failed to load global view");
      setGlobalRaw([]);
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "global") loadGlobal();
  }, [tab]);

  const filteredGlobal = useMemo(() => {
    const q = toShort(globalQuery).toLowerCase();
    if (!q) return globalRaw;
    return (globalRaw || []).filter((r) => {
      const fields = [
        r.uid || r.label_uid,
        r.location_code,
        r.location_name,
        r.area_name,
        r.department_name,
        r.subplant_name,
        r.plant_name,
        r.material_code,
        r.material_desc,
        r.item_code,
        r.item_batch_no,
        r.grn_no,
        r.vendor_batch_no,
        r.invoice_no,
        r.vendor_code,
        r.manufacturer,
        r.quality_status,
      ].map((x) => String(x || "").toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [globalRaw, globalQuery]);

  /* ------- scan handlers ------- */
  const handleScanLocation = () => {
    const code = normalizeLoc(scanLoc);
    if (!code) return;
    setScanLoc("");

    const hit = findLocByCode(code);
    if (!hit) {
      toast.error("Unknown location code");
      return;
    }

    setPlant(hit.plant || "");
    setSubplant(hit.subplant || "");
    setDepartment(hit.department || "");
    setArea(hit.area || "");

    setLocationId(hit.id || "");
    setLocationCode(hit.code || "");

    loadCurrentAtLocation(hit.code);
    setTimeout(() => scanUIDRef.current?.focus(), 60);
  };

  const handleScanUID = async () => {
    const uid = normalizeUid(scanUID);
    if (!uid) return;
    setScanUID("");

    if (!locationCode) {
      toast.error("Choose/scan a location first");
      setTimeout(() => scanLocRef.current?.focus(), 60);
      return;
    }

    try {
      const label = await toast.promise(lookupLabel(uid), {
        loading: "Looking up label…",
        success: (d) => (d ? "Label found" : "Not found"),
        error: (e) => e?.message || "Lookup failed",
      });
      if (!label) return;

      let exists = null;
      try {
        const v = await supabase
          .from("material_location")
          .select("location_code,status,qty,containers")
          .eq("label_uid", uid)
          .eq("status", "IN")
          .maybeSingle();
        exists = v.data || null;
      } catch {
        exists = null;
      }

      const previewRow = {
        ...label,
        uid,
        label_uid: uid,
        alreadyAt: exists?.location_code || "",
        _existsRow: exists,
      };
      setPreview(previewRow);
      setPutQty(fixed3(label.net_qty));
      setPutContainers(String(label.num_containers ?? ""));
      setPickQty("0.000");
      setPickContainers("0");
      // keep the last selected reason; user can change
    } catch (e) {
      console.error(e);
    }
  };

  /* ------- writes via events (smart put-in/put-away) ------- */
  const smartPutAway = async () => {
    if (!preview?.uid) return toast.error("Scan a material label first");
    if (!locationCode) return toast.error("Choose a location");

    // Require a reason for Put In
    if (!moveReason) {
      toast.error("Select a movement reason before Put In");
      return;
    }

    const qtyVal = putQty !== "" ? round3(putQty) : null;
    const contVal = putContainers !== "" ? Number(putContainers) : null;
    if (qtyVal !== null && !(qtyVal > 0)) return toast.error("Enter a valid quantity");
    if (contVal !== null && !(contVal >= 0))
      return toast.error("Enter a valid container count");

    let exists = null;
    try {
      const q = await supabase
        .from("material_location")
        .select("location_code,status,qty,containers")
        .eq("label_uid", preview.uid)
        .eq("status", "IN")
        .maybeSingle();
      exists = q.data || null;
    } catch {
      exists = null;
    }

    const common = {
      movement_reason: moveReason || null,
      movement_note: moveNote || null,
      event_at: nowISO(),
      done_by: doneBy || user?.email || null,
    };

    const ops = [];

    if (exists && exists.location_code !== locationCode) {
      ops.push({
        label_uid: preview.uid,
        from_location: exists.location_code,
        to_location: locationCode,
        event_type: "TRANSFER",
        ...common,
      });
      if (qtyVal !== null || contVal !== null) {
        ops.push({
          label_uid: preview.uid,
          from_location: null,
          to_location: locationCode,
          event_type: "PUTAWAY",
          qty: qtyVal !== null ? qtyVal : undefined,
          container_count: contVal !== null ? contVal : undefined,
          ...common,
        });
      }
    } else if (exists && exists.location_code === locationCode) {
      ops.push({
        label_uid: preview.uid,
        from_location: null,
        to_location: locationCode,
        event_type: "PUTAWAY",
        qty: qtyVal !== null ? qtyVal : undefined,
        container_count: contVal !== null ? contVal : undefined,
        ...common,
      });
    } else {
      ops.push({
        label_uid: preview.uid,
        from_location: null,
        to_location: locationCode,
        event_type: "PUTAWAY",
        qty: qtyVal !== null ? qtyVal : undefined,
        container_count: contVal !== null ? contVal : undefined,
        ...common,
      });
    }

    await toast.promise(insertEvents(ops), {
      loading: "Recording…",
      success: "Put In recorded",
      error: (e) => e?.message || "Put In failed",
    });

    // ensure QC default exists
    try {
      const chk = await supabase
        .from("vw_material_quality_latest")
        .select("label_uid")
        .eq("label_uid", preview.uid)
        .maybeSingle();
      if (!chk.data) {
        await insertQualityEvent({
          label_uid: preview.uid,
          new_status: "QUARANTINE",
          reason: "Auto: first put-in",
        });
      }
    } catch (_) {}

    const conf = await confirmProjection({ uid: preview.uid, loc: locationCode });
    if (!conf.ok) {
      toast.error("Mapped row not confirmed yet. Using fallback reload.");
    }

    setPutQty("");
    setPutContainers("");
    setPreview(null);
    setMoveReason("");
    setMoveNote("");
    await loadCurrentAtLocation();
    setTimeout(() => scanUIDRef.current?.focus(), 80);
  };

  // safer confirmProjection: base-table first; view without hard-coded columns; client-side match
  const confirmProjection = async (
    { uid, loc },
    { attempts = 3, delay = 250 } = {}
  ) => {
    const sleepLocal = (ms) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < attempts; i++) {
      const base = await supabase
        .from("material_location")
        .select("label_uid,location_code,status,qty,containers")
        .eq("label_uid", uid)
        .eq("location_code", loc)
        .eq("status", "IN")
        .maybeSingle();

      if (!base.error && base.data) return { ok: true, data: base.data };

      const view = await supabase
        .from("vw_mapped_in_full")
        .select("*")
        .eq("location_code", loc)
        .limit(500);
      if (!view.error && Array.isArray(view.data)) {
        const row = view.data.find(
          (r) =>
            String(r.label_uid ?? r.uid ?? "").trim() === uid &&
            String(r.status ?? "").toUpperCase() === "IN"
        );
        if (row) return { ok: true, data: row };
      }

      await sleepLocal(delay * (i + 1));
    }
    return { ok: false };
  };

  // explicit “Picking” from preview (consumption)
  const pickFromPreview = async () => {
    if (!preview?.uid) return toast.error("Scan a material label first");
    if (!locationCode) return toast.error("Choose a location");
    if (!moveReason) return toast.error("Select a movement reason before Picking");
    const exists = preview._existsRow;
    if (!exists || exists.location_code !== locationCode) {
      return toast.error("Label is not IN this location. Cannot pick.");
    }

    const dq = round3(pickQty || "0");
    const dc = Number(pickContainers || "0");
    if (!(dq >= 0) || !(dc >= 0)) return toast.error("Enter valid non-negative numbers.");
    if (dq === 0 && dc === 0) return;

    await toast.promise(
      insertEvents({
        label_uid: preview.uid,
        from_location: locationCode,
        to_location: null,
        event_type: "CONSUME",
        delta_qty: dq,
        delta_containers: dc,
        movement_reason: moveReason || null,
        movement_note: moveNote || null,
        event_at: nowISO(),
        done_by: doneBy || user?.email || null,
      }),
      {
        loading: "Recording pick…",
        success: "Pick recorded",
        error: (e) => e?.message || "Pick failed",
      }
    );

    setMoveReason("");
    setMoveNote("");
    await loadCurrentAtLocation();
  };

  // explicit “Putaway (OUT)” from preview (empty out from location)
  const putawayOutFromPreview = async () => {
    if (!preview?.uid) return toast.error("Scan a material label first");
    if (!moveReason) return toast.error("Select a movement reason before moving OUT");
    const exists = preview._existsRow;
    if (!exists) {
      return toast.error("Label is not IN any location.");
    }
    await toast.promise(
      insertEvents({
        label_uid: preview.uid,
        from_location: exists.location_code,
        to_location: null,
        event_type: "EMPTY_OUT",
        qty: 0,
        container_count: 0,
        movement_reason: moveReason || null,
        movement_note: moveNote || null,
        event_at: nowISO(),
        done_by: doneBy || user?.email || null,
      }),
      {
        loading: "Moving OUT…",
        success: "Moved OUT",
        error: (e) => e?.message || "Failed to move OUT",
      }
    );
    setMoveReason("");
    setMoveNote("");
    await loadCurrentAtLocation();
  };

  const transfer = async (row) => {
    const destCode = normalizeLoc(transferTo);
    if (!destCode) return toast.error("Enter/scan destination location code");
    const dest = findLocByCode(destCode);
    if (!dest) return toast.error("Unknown destination location");

    const labelUid = getUid(row);

    let exists = null;
    try {
      const q = await supabase
        .from("material_location")
        .select("location_code,status,qty,containers")
        .eq("label_uid", labelUid)
        .eq("status", "IN")
        .maybeSingle();
      exists = q.data || null;
    } catch {
      exists = { location_code: row.location_code, status: "IN" };
    }
    if (!exists) return toast.error("Label is not IN anywhere. Put In first.");

    await toast.promise(
      insertEvents({
        label_uid: labelUid,
        from_location: exists.location_code || row.location_code || null,
        to_location: dest.code,
        event_type: "TRANSFER",
        movement_reason: moveReason || null,
        movement_note: moveNote || null,
        event_at: nowISO(),
        done_by: doneBy || user?.email || null,
      }),
      {
        loading: "Transferring…",
        success: "Transferred",
        error: (e) => e?.message || "Transfer failed",
      }
    );

    await confirmProjection({ uid: labelUid, loc: dest.code });
    setTransferTo("");
    await loadCurrentAtLocation();
  };

  const removeRow = async (row) => {
    const labelUid = getUid(row);
    await toast.promise(
      insertEvents({
        label_uid: labelUid,
        from_location: row.location_code || locationCode || null,
        to_location: null,
        event_type: "EMPTY_OUT",
        qty: 0,
        container_count: 0,
        movement_reason: moveReason || null,
        movement_note: moveNote || null,
        event_at: nowISO(),
        done_by: doneBy || user?.email || null,
      }),
      { loading: "Removing…", success: "Removed (OUT)", error: (e) => e?.message || "Remove failed" }
    );
    await loadCurrentAtLocation();
  };

  const emptyOutLocation = async () => {
    if (!locationCode) return;
    if (!confirm(`Remove all IN materials at ${locationCode}?`)) return;
    const rows = current || [];
    if (!rows.length) return;

    await toast.promise(
      insertEvents(
        rows.map((r) => ({
          label_uid: getUid(r),
          from_location: r.location_code,
          to_location: null,
          event_type: "EMPTY_OUT",
          qty: 0,
          container_count: 0,
          movement_reason: moveReason || null,
          movement_note: moveNote || null,
          event_at: nowISO(),
          done_by: doneBy || user?.email || null,
        }))
      ),
      {
        loading: "Emptying location…",
        success: "Location emptied",
        error: (e) => e?.message || "Failed to empty location",
      }
    );

    await loadCurrentAtLocation();
  };

  const openConsume = (row) => {
    setConsumeRow(row);
    setConsumeQty("0.000");
    setConsumeContainers("0");
    setConsumeReason("");
    setConsumeNote("");
    setConsumeOpen(true);
  };

  const submitConsume = async () => {
    if (!consumeRow) return;
    if (!consumeReason) return toast.error("Select a movement reason for this consumption");
    const dq = round3(consumeQty || "0");
    const dc = Number(consumeContainers || "0");
    if (!(dq >= 0) || !(dc >= 0)) return toast.error("Enter valid non-negative numbers.");
    if (dq === 0 && dc === 0) return;

    await toast.promise(
      insertEvents({
        label_uid: getUid(consumeRow),
        from_location: consumeRow.location_code,
        to_location: null,
        event_type: "CONSUME",
        delta_qty: dq,
        delta_containers: dc,
        movement_reason: consumeReason || null,
        movement_note: consumeNote || null,
        event_at: nowISO(),
        done_by: doneBy || user?.email || null,
      }),
      {
        loading: "Recording consumption…",
        success: "Consumption recorded",
        error: (e) => e?.message || "Failed to record",
      }
    );

    setConsumeOpen(false);
    setConsumeRow(null);
    await loadCurrentAtLocation();
  };

  /* ---------- QC: change status ---------- */
  const [qcModal, setQcModal] = useState({
    open: false,
    row: null,
    newStatus: "UNDER_QC",
    reason: "",
  });
  const openQC = (row) => setQcModal({ open: true, row, newStatus: "UNDER_QC", reason: "" });
  const closeQC = () => setQcModal({ open: false, row: null, newStatus: "UNDER_QC", reason: "" });

  const submitQC = async () => {
    const row = qcModal.row;
    const labelUid = getUid(row);
    if (!labelUid) return;

    if (qcModal.newStatus === "QC_RELEASED" && !canSetQCReleased) {
      toast.error("Only QA can set QC Released");
      return;
    }

    await toast.promise(
      insertQualityEvent({
        label_uid: labelUid,
        new_status: qcModal.newStatus,
        reason: qcModal.reason || null,
      }),
      {
        loading: "Updating QC status…",
        success: "QC status updated",
        error: (e) => e?.message || "QC update failed",
      }
    );

    closeQC();
    await loadCurrentAtLocation();
    if (tab === "global") await loadGlobal();
  };

  /* auto-load current on location change */
  const [selected, setSelected] = useState(new Set());
  useEffect(() => {
    if (locationCode) {
      setSelected(new Set()); // clear selection when location changes
      loadCurrentAtLocation(locationCode);
    } else {
      setCurrent([]);
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationCode]);

  /* ---------- sorting by policy ---------- */
  const sortByPolicy = (rows) => {
    const arr = [...(rows || [])];
    if (policy === "FIFO") {
      arr.sort((a, b) => {
        const ra = a.fifo_rank ?? 999999;
        const rb = b.fifo_rank ?? 999999;
        if (ra !== rb) return ra - rb;
        return (
          new Date(a.printed_at || a.placed_at || 0) -
          new Date(b.printed_at || b.placed_at || 0)
        );
      });
    } else if (policy === "FEFO") {
      arr.sort((a, b) => {
        const fa = a.fefo_rank ?? 999999;
        const fb = b.fefo_rank ?? 999999;
        if (fa !== fb) return fa - fb;
        const ea = a.exp_date ? new Date(a.exp_date).getTime() : Number.MAX_SAFE_INTEGER;
        const eb = b.exp_date ? new Date(b.exp_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (ea !== eb) return ea - eb;
        return (
          new Date(a.printed_at || a.placed_at || 0) -
          new Date(b.printed_at || b.placed_at || 0)
        );
      });
    }
    return arr;
  };

  const sortedCurrent = useMemo(() => sortByPolicy(current), [current, policy]);
  const sortedGlobal = useMemo(() => sortByPolicy(filteredGlobal), [filteredGlobal, policy]);

  // selection helpers that depend on sortedCurrent
  const allSelected = useMemo(
    () => sortedCurrent.length > 0 && selected.size === sortedCurrent.length,
    [sortedCurrent, selected]
  );
  const toggleSelect = (uid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const toggleSelectAll = () => {
    if (allSelected) return clearSelection();
    setSelected(new Set(sortedCurrent.map((r) => getUid(r))));
  };

  const emptySelected = async () => {
    if (!locationCode) return;
    const rows = (sortedCurrent || []).filter((r) => selected.has(getUid(r)));
    if (!rows.length) return toast.error("Select at least one material.");
    if (!confirm(`Remove ${rows.length} selected material(s) from ${locationCode}?`)) return;

    await toast.promise(
      insertEvents(
        rows.map((r) => ({
          label_uid: getUid(r),
          from_location: r.location_code || locationCode || null,
          to_location: null,
          event_type: "EMPTY_OUT",
          qty: 0,
          container_count: 0,
          movement_reason: moveReason || null,
          movement_note: moveNote || null,
          event_at: nowISO(),
          done_by: doneBy || user?.email || null,
        }))
      ),
      {
        loading: "Removing selected…",
        success: "Selected removed",
        error: (e) => e?.message || "Failed to remove selected",
      }
    );

    clearSelection();
    await loadCurrentAtLocation();
  };

  /* ===================== NEW: Pallet cards (vw_palletize_cards) ===================== */
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  const fetchCardsForLocation = async (locCode) => {
    if (!locCode) return [];
    const { data, error } = await supabase
      .from("vw_palletize_cards")
      .select(`
        uid, location_code, status,
        grn_no, line_no, kind,
        material_code, material_desc, item_code,
        uom, uom_name, uom_decimals,
        label_net_qty, label_containers, container_index,
        item_batch_no, invoice_no,
        vendor_code, lr_no, vehicle, pack_size,
        printed_by, printed_at
      `)
      .eq("location_code", locCode)
      .order("printed_at", { ascending: false });

    if (error) {
      console.warn("palletize load error:", error);
      return [];
    }
    return data || [];
  };

  // Load cards whenever location changes
  useEffect(() => {
    let active = true;
    (async () => {
      if (!locationCode) {
        setCards([]);
        return;
      }
      setCardsLoading(true);
      try {
        const rows = await fetchCardsForLocation(locationCode);
        if (active) setCards(rows);
      } finally {
        if (active) setCardsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [locationCode]);

  /* ---------- render ---------- */
  return (
    <div className="p-3 sm:p-4">
      {/* Header */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <Boxes className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Palletization / Put-Away</div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
            <CheckCircle2 className="w-3 h-3" /> Scan Location → Scan Material
          </span>
        </div>

        {/* Filters + selector */}
        <div className="bg-white p-3 border-b">
          {locLoading ? (
            <div className="grid grid-cols-12 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  className="h-9 w-full col-span-12 md:col-span-6 xl:col-span-3"
                  key={`sk-loc-${i}`}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-6 xl:col-span-3">
                <Label className="text-xs flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-700" /> Plant
                </Label>
                <select
                  className="w-full border rounded-md h-10 px-2"
                  value={plant}
                  onChange={(e) => setPlant(e.target.value)}
                >
                  <option value="">All</option>
                  {plants.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 md:col-span-6 xl:col-span-3">
                <Label className="text-xs flex items-center gap-2">
                  <Factory className="w-4 h-4 text-blue-700" /> Sub-plant
                </Label>
                <select
                  className="w-full border rounded-md h-10 px-2"
                  value={subplant}
                  onChange={(e) => setSubplant(e.target.value)}
                >
                  <option value="">All</option>
                  {subplants.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 md:col-span-6 xl:col-span-3">
                <Label className="text-xs flex items-center gap-2">
                  <PackageSearch className="w-4 h-4 text-blue-700" /> Department
                </Label>
                <select
                  className="w-full border rounded-md h-10 px-2"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="">All</option>
                  {departments.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 md:col-span-6 xl:col-span-3">
                <Label className="text-xs flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-700" /> Area
                </Label>
                <select
                  className="w-full border rounded-md h-10 px-2"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
                  <option value="">All</option>
                  {areas.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12">
                <Label className="text-xs flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-700" /> Location
                </Label>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    className="w-[320px] border rounded-md h-10 px-2"
                    value={locationId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const hit = findLocById(id);
                      setLocationId(id);
                      setLocationCode(hit?.code || "");
                      if (hit?.code) loadCurrentAtLocation(hit.code);
                    }}
                  >
                    <option value="">— Select —</option>
                    {locationOptions.map((o) => (
                      <option key={o.id || o.code} value={o.id || ""}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  {/* Policy selector */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Policy</Label>
                    <select
                      className="border rounded-md h-10 px-2"
                      value={policy}
                      onChange={(e) => setPolicy(e.target.value)}
                    >
                      <option value="FEFO">FEFO (Expiry)</option>
                      <option value="FIFO">FIFO (Arrival)</option>
                      <option value="MANUAL">Manual</option>
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    className="h-10 gap-1"
                    onClick={() => {
                      setPlant("");
                      setSubplant("");
                      setDepartment("");
                      setArea("");
                      setLocationId("");
                      setLocationCode("");
                      setCurrent([]);
                      setCards([]);
                      setPreview(null);
                      setScanLoc("");
                      setScanUID("");
                      setSelected(new Set());
                      setMoveReason("");
                      setMoveNote("");
                    }}
                  >
                    <RefreshCw className="w-4 h-4" /> Clear
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant={tab === "location" ? "default" : "outline"}
          onClick={() => setTab("location")}
        >
          Location Mode
        </Button>
        <Button
          variant={tab === "global" ? "default" : "outline"}
          onClick={() => setTab("global")}
        >
          Global View
        </Button>
      </div>

      {/* Location Mode */}
      {tab === "location" && (
        <>
          <Card className="overflow-hidden mb-3">
            <div className="px-3 py-2 border-b bg-slate-100 text-sm font-semibold">Scan</div>
            <div className="p-3 grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-700" /> Scan Location
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={scanLocRef}
                    className="h-10"
                    placeholder="Scan/enter location code"
                    value={scanLoc}
                    onChange={(e) => setScanLoc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScanLocation()}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <Button className="h-10 gap-1" onClick={handleScanLocation}>
                    <ScanLine className="w-4 h-4" /> Set
                  </Button>
                </div>
              </div>

              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-blue-700" /> Scan Material Label (UID)
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={scanUIDRef}
                    className="h-10"
                    placeholder="Scan/enter label UID"
                    value={scanUID}
                    onChange={(e) => setScanUID(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScanUID()}
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <Button className="h-10 gap-1" onClick={handleScanUID}>
                    {labelLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ScanLine className="w-4 h-4" />
                    )}
                    Lookup
                  </Button>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Duplicate scans are handled (smart transfer/adjust).
                </div>
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="px-3 pb-3">
                <div className="rounded border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                    <code className="px-1.5 py-[2px] rounded bg-slate-50 border text-xs">
                      {preview.uid}
                    </code>
                    {"alreadyAt" in preview && preview.alreadyAt ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-[2px] rounded border text-xs ${TONE_CLS.rose}`}
                      >
                        Currently at {preview.alreadyAt}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-[2px] rounded border text-xs ${TONE_CLS.blue}`}
                      >
                        Location → {locationCode || "-"}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-sm">
                    <div className="col-span-12 md:col-span-6">
                      <div className="font-medium">
                        {preview.material_code} • {preview.material_desc}
                      </div>
                      <div className="text-[12px] text-slate-600">
                        Item: {preview.item_code || "-"} • UOM: {preview.uom_display || preview.uom || "-"}
                      </div>
                      <div className="text-[12px] text-slate-600">
                        GRN: {preview.grn_no} • Line: {preview.line_no}
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <div className="text-[12px]">
                        Qty (label): <b>{fixed3(preview.net_qty)}</b>
                      </div>
                      <div className="text-[12px]">
                        Container: <b>{preview.container_index || "-"}</b> of{" "}
                        <b>{preview.num_containers || "-"}</b>
                      </div>
                      <div className="text-[12px]">
                        Item Batch No.: <b>{preview.item_batch_no || "-"}</b>
                      </div>
                    </div>
                  </div>

                  {/* Movement Reason (applies to Put In / Pick / OUT / Transfer if used) */}
                  <div className="mt-3 grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-xs">Movement Reason</Label>
                      <select
                        className="w-full border rounded-md h-9 px-2"
                        value={moveReason}
                        onChange={(e) => setMoveReason(e.target.value)}
                      >
                        <option value="">— Select reason —</option>
                        {REASON_GROUPS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-8">
                      <Label className="text-xs">Reason Note / Reference</Label>
                      <Input
                        className="h-9"
                        placeholder="e.g. MFG-ORD-1234 / DEV-42 / note"
                        value={moveNote}
                        onChange={(e) => setMoveNote(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Put-In inputs */}
                  <div className="mt-3 grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Put-In Quantity (abs)</Label>
                      <Input
                        value={putQty}
                        onChange={(e) => setPutQty(e.target.value)}
                        placeholder="e.g. 1.000"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Put-In Containers (abs)</Label>
                      <Input
                        value={putContainers}
                        onChange={(e) => setPutContainers(e.target.value)}
                        placeholder="e.g. 1"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-xs">Done by</Label>
                      <Input
                        value={doneBy}
                        onChange={(e) => setDoneBy(e.target.value)}
                        placeholder="operator name / id"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Picking inputs */}
                  <div className="mt-3 grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Pick Qty (consume)</Label>
                      <Input
                        value={pickQty}
                        onChange={(e) => setPickQty(e.target.value)}
                        placeholder="e.g. 0.250"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Pick Containers</Label>
                      <Input
                        value={pickContainers}
                        onChange={(e) => setPickContainers(e.target.value)}
                        placeholder="e.g. 1"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button onClick={smartPutAway}>Put In</Button>
                    <Button
                      variant="outline"
                      onClick={pickFromPreview}
                      title="Consume from this location"
                    >
                      Picking
                    </Button>
                    <Button
                      variant="outline"
                      onClick={putawayOutFromPreview}
                      title="Set OUT from its current location"
                    >
                      Putaway (OUT)
                    </Button>
                    <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Defaults to <b>QUARANTINE</b> after first
                      put-in.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Current at Location */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between">
              <div className="text-sm font-semibold">
                Current at Location • {locationCode || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-60"
                  placeholder="Transfer → location (code)"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  autoCapitalize="characters"
                />
                <Button variant="outline" className="gap-1" onClick={() => loadCurrentAtLocation()}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </Button>
                <Button
                  variant="outline"
                  className="gap-1"
                  onClick={emptySelected}
                  disabled={!selected.size}
                  title="Remove only the ticked rows"
                >
                  <Trash2 className="w-4 h-4" /> Empty Selected
                </Button>
                <Button
                  variant="outline"
                  className="gap-1"
                  onClick={emptyOutLocation}
                  disabled={!locationCode}
                >
                  <Trash2 className="w-4 h-4" /> Empty Location
                </Button>
              </div>
            </div>

            <div className="p-3 overflow-x-auto">
              {listLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={`sk-list-${i}`} className="h-16 w-full" />
                  ))}
                </div>
              ) : sortedCurrent.length ? (
                <table className="min-w-[1550px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left w-[44px]">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                      </th>
                      <th className="p-2 text-left">UID</th>
                      <th className="p-2 text-left">Material</th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left">Qty (current)</th>
                      <th className="p-2 text-left">Containers</th>
                      <th className="p-2 text-left">Item Batch No.</th>
                      <th className="p-2 text-left">Expiry</th>
                      <th className="p-2 text-left">QC</th>
                      <th className="p-2 text-left">Policy Rank</th>
                      <th className="p-2 text-left w-[520px]">Actions</th>
                      <th className="p-2 text-left w-[120px]">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCurrent.map((r) => (
                      <tr key={getUid(r)}>
                        <td className="p-2 border-b">
                          <input
                            type="checkbox"
                            checked={selected.has(getUid(r))}
                            onChange={() => toggleSelect(getUid(r))}
                          />
                        </td>
                        <td className="p-2 border-b font-mono text-xs">{getUid(r)}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{r.material_code}</div>
                          <div className="text-xs text-slate-600">{r.material_desc}</div>
                        </td>
                        <td className="p-2 border-b">{r.item_code || "-"}</td>
                        <td className="p-2 border-b">
                          {fixed3(r.qty ?? r.net_qty ?? 0)} {r.uom_display || r.uom || ""}
                        </td>
                        <td className="p-2 border-b">{r.containers ?? "-"}</td>
                        <td className="p-2 border-b">{r.item_batch_no || "-"}</td>
                        <td className="p-2 border-b">{r.exp_date || "-"}</td>
                        <td className="p-2 border-b">
                          <span className={qcPillClass(r.quality_status)}>
                            <ShieldCheck className="w-3 h-3" />
                            {r.quality_status || "QUARANTINE"}
                          </span>
                        </td>
                        <td className="p-2 border-b">
                          {policy === "FEFO"
                            ? r.fefo_rank ?? "-"
                            : policy === "FIFO"
                            ? r.fifo_rank ?? "-"
                            : "-"}
                        </td>
                        <td className="p-2 border-b">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              className="gap-1"
                              onClick={() => transfer(r)}
                              title="Transfer to destination"
                            >
                              <ArrowLeftRight className="w-4 h-4" /> Transfer
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-1"
                              onClick={() => openConsume(r)}
                              title="Use / Consume"
                            >
                              <ScanLine className="w-4 h-4" /> Consume
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-1"
                              onClick={() => removeRow(r)}
                              title="Remove (set OUT)"
                            >
                              <Trash2 className="w-4 h-4" /> Remove
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-1"
                              onClick={() => openQC(r)}
                              title="Change QC status"
                            >
                              <FlagTriangleRight className="w-4 h-4" /> Change QC
                            </Button>
                          </div>
                        </td>
                        <td className="p-2 border-b">
                          <Button
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => openDetails(r)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-slate-500">
                  {locationCode
                    ? "No materials mapped yet."
                    : "Choose/scan a location to see mapped materials."}
                </div>
              )}
            </div>
          </Card>

          {/* NEW: Cards in this Location (from vw_palletize_cards) */}
          <Card className="overflow-hidden mt-3">
            <div className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between">
              <div className="text-sm font-semibold">
                Cards in this location (from labels) • {locationCode || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    if (!locationCode) return;
                    setCardsLoading(true);
                    try {
                      const rows = await fetchCardsForLocation(locationCode);
                      setCards(rows);
                    } finally {
                      setCardsLoading(false);
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </Button>
              </div>
            </div>

            <div className="p-3 overflow-x-auto">
              {cardsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={`sk-cards-${i}`} className="h-16 w-full" />
                  ))}
                </div>
              ) : (cards || []).length ? (
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left">UID</th>
                      <th className="p-2 text-left">Material</th>
                      <th className="p-2 text-left">Kind</th>
                      <th className="p-2 text-left">UOM</th>
                      <th className="p-2 text-left">Label Qty</th>
                      <th className="p-2 text-left">#Cntrs</th>
                      <th className="p-2 text-left">Invoice</th>
                      <th className="p-2 text-left">Vendor</th>
                      <th className="p-2 text-left">LR No.</th>
                      <th className="p-2 text-left">Vehicle</th>
                      <th className="p-2 text-left">Batch</th>
                      <th className="p-2 text-left">Printed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((r) => (
                      <tr key={r.uid} className="align-top">
                        <td className="p-2 border-b">{r.uid}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{r.material_code}</div>
                          <div className="text-xs text-slate-600">{r.material_desc || "-"}</div>
                        </td>
                        <td className="p-2 border-b">{r.kind || "-"}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{r.uom || "-"}</div>
                          <div className="text-[11px] text-slate-500">{r.uom_name || ""}</div>
                        </td>
                        <td className="p-2 border-b">{fmtQty(r.label_net_qty, r.uom_decimals ?? 3)}</td>
                        <td className="p-2 border-b">{r.label_containers ?? "-"}</td>
                        <td className="p-2 border-b">{r.invoice_no ?? "-"}</td>
                        <td className="p-2 border-b">{r.vendor_code ?? "-"}</td>
                        <td className="p-2 border-b">{r.lr_no ?? "-"}</td>
                        <td className="p-2 border-b">{r.vehicle ?? "-"}</td>
                        <td className="p-2 border-b">{r.item_batch_no ?? "-"}</td>
                        <td className="p-2 border-b">
                          {r.printed_at ? new Date(r.printed_at).toLocaleString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-slate-500">
                  {locationCode ? "No label cards found for this location." : "Choose a location."}
                </div>
              )}
            </div>
          </Card>

          {/* Status at Location */}
          <Card className="overflow-hidden mt-3">
            <div className="px-3 py-2 border-b bg-slate-100 text-sm font-semibold">
              Status at Location • {locationCode || "—"}
            </div>
            <div className="p-3 overflow-x-auto">
              {listLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={`sk-status-${i}`} className="h-16 w-full" />
                  ))}
                </div>
              ) : sortedCurrent.length ? (
                <table className="min-w-[1500px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left">UID</th>
                      <th className="p-2 text-left">Material</th>
                      <th className="p-2 text-left">Label Qty</th>
                      <th className="p-2 text-left">Live Qty</th>
                      <th className="p-2 text-left">Consumed</th>
                      <th className="p-2 text-left">% Rem</th>
                      <th className="p-2 text-left">Containers (live/label)</th>
                      <th className="p-2 text-left">Usage</th>
                      <th className="p-2 text-left">QC</th>
                      <th className="p-2 text-left w-[120px]">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCurrent.map((r) => {
                      const s = deriveStatus(r);
                      return (
                        <tr key={`status-${getUid(r)}`}>
                          <td className="p-2 border-b font-mono text-xs">{getUid(r)}</td>
                          <td className="p-2 border-b">
                            <div className="font-medium">{r.material_code}</div>
                            <div className="text-xs text-slate-600">{r.material_desc}</div>
                          </td>
                          <td className="p-2 border-b">
                            {fixed3(s.labelQty)} {r.uom || ""}
                          </td>
                          <td className="p-2 border-b">
                            {fixed3(s.liveQty)} {r.uom || ""}
                          </td>
                          <td className="p-2 border-b">
                            {fixed3(s.consumedQty)} {r.uom || ""}
                          </td>
                          <td className="p-2 border-b">
                            {s.pctRemaining == null ? "-" : `${s.pctRemaining.toFixed(1)}%`}
                          </td>
                          <td className="p-2 border-b">
                            {(s.liveContainers ?? "-")} / {(s.labelContainers ?? "-")}
                          </td>
                          <td className="p-2 border-b">
                            <span className={usagePillClass(s.usage)}>{s.usage}</span>
                          </td>
                          <td className="p-2 border-b">
                            <span className={qcPillClass(r.quality_status)}>
                              <ShieldCheck className="w-3 h-3" />
                              {r.quality_status || "QUARANTINE"}
                            </span>
                          </td>
                          <td className="p-2 border-b">
                            <Button
                              variant="outline"
                              className="h-8 px-2"
                              onClick={() => openDetails(r)}
                            >
                              Details
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-slate-500">No materials mapped yet.</div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Global View */}
      {tab === "global" && (
        <Card className="overflow-hidden">
          <div className="px-3 py-2 border-b bg-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold">Global View • Mapped Materials (IN)</div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  className="h-9 pl-8 w-[520px]"
                  placeholder="Search UID / material / item / batch / vendor / invoice / location / GRN / plant / QC"
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                />
              </div>
              <Label className="text-xs">Policy</Label>
              <select
                className="border rounded-md h-9 px-2"
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="FEFO">FEFO</option>
                <option value="FIFO">FIFO</option>
                <option value="MANUAL">MANUAL</option>
              </select>
              <Button variant="outline" className="gap-1" onClick={loadGlobal}>
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
            </div>
          </div>

          <div className="p-3 overflow-x-auto">
            {globalLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={`sk-gl-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : (sortedGlobal || []).length ? (
              <table className="min-w-[1550px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">UID</th>
                    <th className="p-2 text-left">Location</th>
                    <th className="p-2 text-left">Material</th>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-left">Qty (current)</th>
                    <th className="p-2 text-left">Containers</th>
                    <th className="p-2 text-left">Item Batch No.</th>
                    <th className="p-2 text-left">Expiry</th>
                    <th className="p-2 text-left">QC</th>
                    <th className="p-2 text-left">Updated</th>
                    <th className="p-2 text-left w-[120px]">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(sortedGlobal || []).map((r) => {
                    const key = `${getUid(r)}:${r.location_code}`;
                    return (
                      <tr key={key}>
                        <td className="p-2 border-b font-mono text-xs">{getUid(r)}</td>
                        <td className="p-2 border-b">{r.location_code}</td>
                        <td className="p-2 border-b">
                          <div className="font-medium">{r.material_code}</div>
                          <div className="text-xs text-slate-600">{r.material_desc}</div>
                        </td>
                        <td className="p-2 border-b">{r.item_code || "-"}</td>
                        <td className="p-2 border-b">
                          {fixed3((r.qty ?? r.net_qty) || 0)} {r.uom_display || r.uom || ""}
                        </td>
                        <td className="p-2 border-b">{r.containers ?? "-"}</td>
                        <td className="p-2 border-b">{r.item_batch_no || "-"}</td>
                        <td className="p-2 border-b">{r.exp_date || "-"}</td>
                        <td className="p-2 border-b">
                          <span className={qcPillClass(r.quality_status)}>
                            <ShieldCheck className="w-3 h-3" />
                            {r.quality_status || "QUARANTINE"}
                          </span>
                        </td>
                        <td className="p-2 border-b">
                          {new Date(r.updated_at || r.printed_at || Date.now()).toLocaleString()}
                        </td>
                        <td className="p-2 border-b">
                          <Button
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => openDetails(r)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">No IN materials found.</div>
            )}
          </div>
        </Card>
      )}

      {/* Consume Modal */}
      <Modal
        open={consumeOpen}
        onClose={() => setConsumeOpen(false)}
        title={`Consume • ${getUid(consumeRow) || ""} @ ${consumeRow?.location_code || ""}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setConsumeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitConsume}>Record Consumption</Button>
          </div>
        }
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Quantity to consume</Label>
            <Input
              value={consumeQty}
              onChange={(e) => setConsumeQty(e.target.value)}
              placeholder="e.g. 0.250"
              className="h-9"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Containers to consume</Label>
            <Input
              value={consumeContainers}
              onChange={(e) => setConsumeContainers(e.target.value)}
              placeholder="e.g. 1"
              className="h-9"
            />
          </div>

          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Movement Reason</Label>
            <select
              className="w-full border rounded-md h-9 px-2"
              value={consumeReason}
              onChange={(e) => setConsumeReason(e.target.value)}
            >
              <option value="">— Select reason —</option>
              {REASON_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Reason Note / Reference</Label>
            <Input
              className="h-9"
              placeholder="e.g. MFG-ORD-1234 / DEV-42 / note"
              value={consumeNote}
              onChange={(e) => setConsumeNote(e.target.value)}
            />
          </div>
        </div>
        <div className="text-[12px] text-slate-600 mt-2">
          Tip: if either value empties the balance, the label flips to <b>OUT</b>.
        </div>
      </Modal>

      {/* QC Status Modal */}
      <Modal
        open={qcModal.open}
        onClose={closeQC}
        title={`Change QC • ${getUid(qcModal.row) || ""}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={closeQC}>
              Cancel
            </Button>
            <Button onClick={submitQC}>Update Status</Button>
          </div>
        }
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">New QC Status</Label>
            <select
              className="w-full border rounded-md h-10 px-2"
              value={qcModal.newStatus}
              onChange={(e) => setQcModal((s) => ({ ...s, newStatus: e.target.value }))}
            >
              <option value="UNDER_QC">Under QC Testing</option>
              <option value="QC_RELEASED" disabled={!canSetQCReleased}>
                QC Released {canSetQCReleased ? "" : "(QA only)"}
              </option>
              <option value="RESTRICTED">Restricted</option>
              <option value="UNRESTRICTED">Unrestricted</option>
              <option value="PROD_RETURNED">Production Returned Material</option>
              <option value="REJECTED">Rejected</option>
              <option value="QUARANTINE">Quarantine</option>
            </select>
            {!ALLOW_ANY_QC_RELEASE && (
              <div className="text-[12px] text-slate-600 mt-1">
                Note: <b>QC Released</b> can be set by QA only.
              </div>
            )}
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Reason / Reference</Label>
            <Input
              className="h-10"
              placeholder="eg. QC-TRN-0042 / deviation / note"
              value={qcModal.reason}
              onChange={(e) => setQcModal((s) => ({ ...s, reason: e.target.value }))}
            />
          </div>
        </div>
        <div className="text-[12px] text-slate-600 mt-2">
          A row is appended to <code>material_quality_events</code> for full audit.
        </div>
      </Modal>

      {/* Details Modal */}
      {detailRow && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <div className="text-sm font-semibold">Material Details</div>
                <span className="ml-auto text-xs text-slate-500">UID:</span>
                <code className="text-xs bg-slate-50 border px-1.5 py-[2px] rounded">
                  {detailRow.uid || detailRow.label_uid}
                </code>
                <Button variant="outline" className="ml-2 h-8 px-2" onClick={closeDetails}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
                {/* Location & live */}
                <div>
                  <div className="text-[12px] font-semibold mb-2">Location & Live</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <KV k="Location Code" v={detailRow.location_code} />
                    <KV k="Status" v={detailRow.status} />
                    <KV
                      k="Live Qty"
                      v={detailRow.qty != null ? fmtNum(detailRow.qty) : "-"}
                    />
                    <KV
                      k="Live Containers"
                      v={detailRow.containers != null ? detailRow.containers : "-"}
                    />
                    <KV k="Placed At" v={fmtDT(detailRow.placed_at)} />
                    <KV k="Updated At" v={fmtDT(detailRow.updated_at)} />
                    {"location_name" in detailRow && (
                      <KV k="Location Name" v={detailRow.location_name} />
                    )}
                    {"area_name" in detailRow && <KV k="Area" v={detailRow.area_name} />}
                    {"department_name" in detailRow && (
                      <KV k="Department" v={detailRow.department_name} />
                    )}
                    {"subplant_name" in detailRow && (
                      <KV k="Sub-plant" v={detailRow.subplant_name} />
                    )}
                    {"plant_name" in detailRow && <KV k="Plant" v={detailRow.plant_name} />}
                  </div>
                </div>

               {/* Label & GRN */}
<div>
  <div className="text-[12px] font-semibold mb-2">Label & GRN</div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <KV k="GRN No" v={detailRow.grn_no} />
    <KV k="Line No" v={detailRow.line_no} />
    <KV k="Item Code" v={detailRow.item_code} />
    <KV k="Material Code" v={detailRow.material_code} />
    <KV k="Material Desc" v={detailRow.material_desc} />

    <KV
      k="UOM"
      v={
        (detailRow.uom_display || detailRow.uom || "-") +
        (detailRow.uom_code &&
         detailRow.uom_code !== (detailRow.uom_display || detailRow.uom)
          ? ` (${detailRow.uom_code})`
          : "")
      }
    />

    <KV
      k="Label Net Qty"
      v={detailRow.net_qty != null ? fmtNum(detailRow.net_qty) : "-"}
    />
    <KV k="Label Containers" v={detailRow.num_containers} />
    <KV k="Container Index" v={detailRow.container_index} />
    <KV k="Item Batch No." v={detailRow.item_batch_no} />
    <KV k="Invoice No" v={detailRow.invoice_no} />
    <KV k="Printed By" v={detailRow.printed_by} />
    <KV k="Printed At" v={fmtDT(detailRow.printed_at)} />
  </div>
</div>


                {/* Vendor • Shipping • Storage */}
                <div>
                  <div className="text-[12px] font-semibold mb-2">
                    Vendor • Shipping • Storage
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <KV k="Vendor Code" v={detailRow.vendor_code} />
                    <KV k="Vendor Batch" v={detailRow.vendor_batch_no} />
                    <KV k="Manufacturer" v={detailRow.manufacturer} />
                    <KV k="Mfg Date" v={detailRow.mfg_date} />
                    <KV k="Exp Date" v={detailRow.exp_date} />
                    <KV k="Next Inspection" v={detailRow.next_inspection_date} />
                    <KV k="LR No" v={detailRow.lr_no} />
                    <KV k="LR Date" v={detailRow.lr_date} />
                    <KV k="Transporter" v={detailRow.transporter_name} />
                    <KV k="Vehicle" v={detailRow.vehicle} />
                    <KV k="Storage Condition" v={detailRow.storage_condition} />
                  </div>
                </div>

                {/* QC */}
                <div>
                  <div className="text-[12px] font-semibold mb-2">Quality / QC</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <KV k="QC Status" v={detailRow.quality_status || "QUARANTINE"} />
                    <KV k="QC Updated" v={fmtDT(detailRow.quality_changed_at)} />
                    <KV k="QC Reason" v={detailRow.quality_reason} />
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-8 px-3"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(detailRow, null, 2));
                    toast.success("Copied details");
                  }}
                >
                  Copy JSON
                </Button>
                <div className="ml-auto" />
                <Button className="h-8 px-3" onClick={closeDetails}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
