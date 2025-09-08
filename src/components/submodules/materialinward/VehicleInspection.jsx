// Vehicle Inspection: scan/type Gate Pass, show details (POs/Invoices), checklist entry,
// Auto-release when Accepted (no QA), QA required only for Hold/Rejected/Quarantine.
// Branded header (blue gradient), shadcn Skeleton loaders, toast.promise UX, color-coded badges,
// and A4 Print/Preview. Adds PO/Invoice → logistics prefill via vw_prefill_logistics_by_po_invoice,
// with fallback to vw_vehicle_inspections_enriched.

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";
import toast from "react-hot-toast";

import Button from "../../ui/button";
import { Card } from "../../ui/card";
import Input from "../../ui/Input";
import Label from "../../ui/Label";
import { Skeleton } from "../../ui/skeleton";

import {
  QrCode,
  Truck,
  ClipboardList,
  Search,
  Loader2,
  PackageSearch,
  ListChecks,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PauseCircle,
  Send,
  ShieldCheck,
  RefreshCw,
  Printer,
  Eye,
} from "lucide-react";
import logo from "../../../assets/logo.png";

// Central helpers for gate pass fetching
import { getGateEntry, getGateEntryLines } from "../../../utils/gatepass";

/* ---------- theme ---------- */
const COMPANY_NAME = "DigitizerX";
const cls = (...a) => a.filter(Boolean).join(" ");
const badgeColor = (s) => {
  const k = (s || "").toLowerCase();
  if (["accepted", "qaapproved", "qa approved", "approved"].includes(k))
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (["rejected", "qa rejected"].includes(k))
    return "bg-rose-100 text-rose-700 border-rose-200";
  if (["quarantine"].includes(k))
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (["on hold", "hold", "held"].includes(k))
    return "bg-slate-100 text-slate-700 border-slate-200";
  if (["submitted"].includes(k)) return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
};
const statusPillClass = (ok) => {
  if (ok === true) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (ok === false) return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
};
const prettyDate = (s) => {
  try {
    return s ? new Date(s).toLocaleDateString() : "";
  } catch {
    return s || "";
  }
};

/* ---------- small chips ---------- */
const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

/* ---------- robust role helpers ---------- */
const normRoles = (r) => (Array.isArray(r) ? r : r ? [r] : []);
const roleStr = (x) =>
  typeof x === "string" ? x : x?.name || x?.role || x?.title || "";
const hasRole = (r, needle) =>
  normRoles(r).some(
    (x) => roleStr(x).toLowerCase() === String(needle || "").toLowerCase()
  );
const isQA = (r) =>
  hasRole(r, "qa") ||
  hasRole(r, "quality") ||
  hasRole(r, "super admin") ||
  hasRole(r, "qa user");

/* ---------- tiny supabase helper: find first existing table/view ---------- */
const firstExistingTable = async (candidates) => {
  for (const name of candidates) {
    try {
      // HEAD-like probe (no rows, just see if it errors)
      const { error } = await supabase
        .from(name)
        .select("*", { head: true, count: "exact" })
        .limit(1);
      if (!error) return name;
    } catch {
      /* ignore and continue */
    }
  }
  return null;
};

/* ---------- finder by PO/Invoice from your snippet (kept as-is) ---------- */
const findVehicleInspection = async (poNo, invNo) => {
  const table = await firstExistingTable([
    "vw_vehicle_inspections_enriched",
    "vehicle_inspections",
    "vehicleinspection",
  ]);
  if (!table) return null;

  try {
    const { data, error } = await supabase
      .from(table)
      .select(
        "lr_no, lr_date, vehicle_no, transporter_name, driver_name, po_bundle_json, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    for (const r of data || []) {
      const arr = Array.isArray(r.po_bundle_json)
        ? r.po_bundle_json
        : typeof r.po_bundle_json === "string"
        ? JSON.parse(r.po_bundle_json)
        : [];

      const hit = arr.some(
        (x) =>
          String(x.po_no || "") === String(poNo || "") &&
          String(x.invoice_no || "") === String(invNo || "")
      );

      if (hit) return r;
    }
  } catch (e) {
    console.error("findVehicleInspection failed", e);
  }
  return null;
};

/* ---------- component ---------- */
const VehicleInspection = () => {
  const { user, role } = useAuth() || {};
  const { gpNo: routeGp } = useParams() || {};

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // gate pass bundle
  const [gp, setGp] = useState(null);
  const [poList, setPoList] = useState([]);
  const [invList, setInvList] = useState([]);
  const [matCount, setMatCount] = useState(null); // optional: from vw lines

  // checklist
  const [items, setItems] = useState([]); // [{id,label,ok,remarks}]
  const [overallStatus, setOverallStatus] = useState("Accepted"); // Accepted|Rejected|Quarantine
  const [overallRemarks, setOverallRemarks] = useState("");

  // inspection record (persisted)
  const [inspection, setInspection] = useState(null);
  const [flowStatus, setFlowStatus] = useState("Draft"); // Draft|On Hold|Submitted|QA Approved|QA Rejected
  const [holdNote, setHoldNote] = useState("");

  const gpInputRef = useRef(null);
  const a4Ref = useRef(null);
  useEffect(() => {
    gpInputRef.current?.focus();
  }, []);

  /* ---------- fetchers ---------- */
  // read from compat view vw_checklist_master
  const fetchChecklist = useCallback(async () => {
    const { data, error } = await supabase
      .from("vw_checklist_master")
      .select("id,label,seq,category")
      .eq("category", "Vehicle Inspection")
      .order("seq", { ascending: true });

    if (!error && Array.isArray(data) && data.length) {
      setItems(
        data.map((r) => ({ id: r.id, label: r.label, ok: null, remarks: "" }))
      );
      return;
    }
    // Fallback seeds
    setItems([
      {
        id: "vi-01",
        label: "Vehicle body clean & free from damage/leaks",
        ok: null,
        remarks: "",
      },
      {
        id: "vi-02",
        label: "Container/Truck sealed & intact (no tampering)",
        ok: null,
        remarks: "",
      },
      {
        id: "vi-03",
        label: "Pest control compliance (no infestation evidence)",
        ok: null,
        remarks: "",
      },
      {
        id: "vi-04",
        label: "No smell/odor or contamination risk",
        ok: null,
        remarks: "",
      },
      {
        id: "vi-05",
        label: "Floor dry, pallets/lining in good condition",
        ok: null,
        remarks: "",
      },
    ]);
  }, []);

  const parseBundleFromGE = (row) => {
    const arr = Array.isArray(row?.po_bundle_json)
      ? row.po_bundle_json
      : typeof row?.po_bundle_json === "string"
      ? JSON.parse(row.po_bundle_json)
      : [];
    const pos = [...new Set(arr.map((b) => b.po_no).filter(Boolean))];
    const invoices = [
      ...new Map(
        arr
          .map((b) => ({
            po_no: b.po_no,
            invoice_no: b.invoice_no,
            invoice_date: b.po_date, // keep your field name from sample
          }))
          .filter((x) => x.invoice_no)
          .map((x) => [`${x.po_no}#${x.invoice_no}`, x])
      ).values(),
    ];
    return { pos, invoices };
  };

  const fetchGatePassBundle = useCallback(async (gpNoOrId) => {
    const ge = await getGateEntry(gpNoOrId); // throws if not found
    const { pos, invoices } = parseBundleFromGE(ge);
    setGp({
      gate_pass_no: ge.gate_pass_no,
      transporter_name: ge.transporter_name,
      lr_no: ge.lr_no,
      lr_date: ge.lr_date,
      driver_name: ge.driver_name,
      vehicle_no: ge.vehicle_no,
    });
    setPoList(pos);
    setInvList(invoices);

    // optional: lines from view (if present)
    try {
      const lines = await getGateEntryLines(gpNoOrId);
      setMatCount(Array.isArray(lines) ? lines.length : null);
    } catch {
      setMatCount(null);
    }
  }, []);

  const fetchExistingInspection = useCallback(async (gpNo) => {
    const { data, error } = await supabase
      .from("vehicle_inspections")
      .select("*")
      .eq("gate_pass_no", gpNo)
      .maybeSingle();
    if (!error && data) {
      setInspection(data);
      setFlowStatus(data.status || "Draft");
      setOverallStatus(data.overall_status || "Accepted");
      setOverallRemarks(data.overall_remarks || "");
      setHoldNote(data.hold_note || "");
      if (Array.isArray(data.items) && data.items.length) {
        setItems((prev) => {
          if (!prev.length) return data.items;
          const map = new Map(prev.map((i) => [i.id || i.label, i]));
          data.items.forEach((i) => {
            const key = i.id || i.label;
            if (map.has(key)) map.set(key, { ...map.get(key), ...i });
            else map.set(key, i);
          });
          return Array.from(map.values());
        });
      }
    }
  }, []);

  /* ---------- orchestrator ---------- */
  const loadAll = useCallback(
    async (gpNo) => {
      setLoading(true);
      try {
        await fetchChecklist();
        await fetchGatePassBundle(gpNo);
        await fetchExistingInspection(gpNo);
        toast.success("Gate Pass loaded");
      } catch (err) {
        console.error(err);
        setGp(null);
        setPoList([]);
        setInvList([]);
        toast.error(err?.message || "Unable to load Gate Pass");
      } finally {
        setLoading(false);
      }
    },
    [fetchChecklist, fetchGatePassBundle, fetchExistingInspection]
  );

  /* ---------- route param auto-load ---------- */
  useEffect(() => {
    (async () => {
      if (!routeGp) return;
      setQuery(routeGp);
      await loadAll(routeGp);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGp]);

  /* ---------- actions ---------- */
  const updateItem = (idx, patch) =>
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  const canEdit = useMemo(
    () =>
      isQA(role) || !["Submitted", "QA Approved", "QA Rejected"].includes(flowStatus),
    [role, flowStatus]
  );

  const handleFetch = useCallback(() => {
    const val = (query || "").trim();
    if (!val) {
      toast.error("Enter/scan a Gate Pass No.");
      gpInputRef.current?.focus();
      return;
    }
    loadAll(val);
  }, [query, loadAll]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleFetch();
    }
  };

  const assemblePayload = (nextStatus) => ({
    gate_pass_no: gp?.gate_pass_no || query.trim(),
    items: items.map((i) => ({
      id: i.id || null,
      label: i.label,
      ok: i.ok,
      remarks: i.remarks || "",
    })),
    overall_status: overallStatus,
    overall_remarks: overallRemarks || "",
    hold_note: nextStatus === "On Hold" ? holdNote : holdNote || "",
    status: nextStatus,
    updated_by: user?.id || null,
    updated_by_email: user?.email || null,
    updated_at: new Date().toISOString(),
  });

  const persistStrict = async (payload) => {
    const { data, error } = await supabase
      .from("vehicle_inspections")
      .upsert(payload, { onConflict: "gate_pass_no" })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const saveDraft = async () => {
    if (!gp && !query.trim()) {
      toast.error("Scan or enter a Gate Pass first");
      return;
    }
    setSaving(true);
    const p = assemblePayload("Draft");
    await toast.promise(persistStrict(p), {
      loading: "Saving draft...",
      success: "Draft saved",
      error: "Save failed",
    });
    setFlowStatus("Draft");
    setSaving(false);
  };

  // Submit logic: if Accepted → auto-release (QA Approved) without QA; else submit for QA
  const submit = async () => {
    if (!gp && !query.trim()) {
      toast.error("Scan or enter a Gate Pass first");
      return;
    }
    const missing = items.filter((i) => i.ok === null).length;
    if (missing > 0) {
      toast.error("Complete all checklist items (OK/Not OK)");
      return;
    }
    if (!overallStatus) {
      toast.error("Select Overall Inspection Status");
      return;
    }
    setSaving(true);
    if (String(overallStatus).toLowerCase() === "accepted") {
      const auto = {
        ...assemblePayload("QA Approved"),
        qa_user_id: user?.id || null,
        qa_user_email: user?.email || user?.user_metadata?.email || null,
        qa_decided_at: new Date().toISOString(),
      };
      try {
        await toast.promise(persistStrict(auto), {
          loading: "Releasing (no QA required)...",
          success: "Accepted & Released — proceeding to next steps",
          error: "Auto-release blocked; submitting to QA instead",
        });
        setFlowStatus("QA Approved");
      } catch {
        const p = assemblePayload("Submitted");
        await toast.promise(persistStrict(p), {
          loading: "Submitting...",
          success: "Submitted to QA",
          error: "Submit failed",
        });
        setFlowStatus("Submitted");
      } finally {
        setSaving(false);
      }
    } else {
      const p = assemblePayload("Submitted");
      await toast.promise(persistStrict(p), {
        loading: "Submitting for QA...",
        success: "Submitted to QA",
        error: "Submit failed",
      });
      setFlowStatus("Submitted");
      setSaving(false);
    }
  };

  const holdVehicle = async () => {
    if (!holdNote.trim()) {
      toast.error("Add a Hold note/reason");
      return;
    }
    setSaving(true);
    const p = assemblePayload("On Hold");
    await toast.promise(persistStrict(p), {
      loading: "Placing vehicle on Hold...",
      success: "Vehicle put On Hold (QA required)",
      error: "Hold failed",
    });
    setFlowStatus("On Hold");
    setSaving(false);
  };

  const qaDecision = async (approve) => {
    if (!isQA(role)) {
      toast.error("QA role required");
      return;
    }
    if (!gp && !query.trim()) {
      toast.error("Load a Gate Pass first");
      return;
    }
    if (!overallStatus) {
      toast.error("Select Overall Inspection Status");
      return;
    }
    if (!overallRemarks.trim()) {
      toast.error("QA must enter remarks");
      return;
    }
    setSaving(true);
    const next = approve ? "QA Approved" : "QA Rejected";
    const p = {
      ...assemblePayload(next),
      qa_user_id: user?.id || null,
      qa_user_email: user?.email || user?.user_metadata?.email || null,
      qa_decided_at: new Date().toISOString(),
    };
    await toast.promise(persistStrict(p), {
      loading: approve ? "Approving..." : "Rejecting...",
      success: approve
        ? "Approved — proceed to next step"
        : "Rejected — vehicle to be returned",
      error: "QA decision failed",
    });
    setFlowStatus(next);
    setSaving(false);
  };

  const resetForm = () => {
    setGp(null);
    setPoList([]);
    setInvList([]);
    setMatCount(null);
    setItems((arr) => arr.map((i) => ({ ...i, ok: null, remarks: "" })));
    setOverallStatus("Accepted");
    setOverallRemarks("");
    setHoldNote("");
    setInspection(null);
    setFlowStatus("Draft");
    setQuery("");
    gpInputRef.current?.focus();
  };

  const submitLabel = useMemo(
    () =>
      String(overallStatus).toLowerCase() === "accepted"
        ? "Submit & Release"
        : "Submit for QA",
    [overallStatus]
  );

  const qaNeeded = useMemo(() => {
    if (!gp) return false;
    const o = String(overallStatus).toLowerCase();
    if (flowStatus === "On Hold") return true;
    if (["rejected", "quarantine"].includes(o)) return true;
    if (flowStatus === "Submitted") return true;
    return false;
  }, [gp, flowStatus, overallStatus]);

  /* ---------- PO/Invoice → Logistics Prefill ---------- */
  const prefillFromPair = useCallback(
    async (poNo, invNo) => {
      const doSet = (src, row) => {
        setGp((g) => {
          const base = g || {
            gate_pass_no: query?.trim() || routeGp || "",
          };
          return {
            ...base,
            transporter_name: row.transporter_name || base.transporter_name || "",
            lr_no: row.lr_no || base.lr_no || "",
            lr_date: row.lr_date || base.lr_date || null,
            driver_name: row.driver_name || base.driver_name || "",
            vehicle_no: row.vehicle || row.vehicle_no || base.vehicle_no || "",
          };
        });
        toast.success(
          `Prefilled logistics from ${src === "grn_postings" ? "last GRN" : src
            .replace(/_/g, " ")
            .trim()}`
        );
      };

      // 1) Try your consolidated view
      const view = await firstExistingTable([
        "vw_prefill_logistics_by_po_invoice",
      ]);
      if (view) {
        try {
          const { data, error } = await supabase
            .from(view)
            .select(
              "lr_no, lr_date, vehicle, transporter_name, driver_name, last_grn_no, source"
            )
            .eq("po_no", poNo)
            .eq("invoice_no", invNo)
            .maybeSingle();
          if (!error && data) {
            doSet(data.source || "bundle", data);
            return;
          }
        } catch {
          /* swallow and fallback */
        }
      }

      // 2) Fallback: search latest vehicle inspection containing this PO/Invoice
      const vi = await findVehicleInspection(poNo, invNo);
      if (vi) {
        doSet("vehicle_inspection", vi);
        return;
      }

      toast.error("No logistics found to prefill for that PO/Invoice");
    },
    [query, routeGp]
  );

  /* ---------- printing ---------- */
  const printA4 = () => {
    if (!gp) {
      toast.error("Load a Gate Pass first");
      return;
    }
    const html = a4Ref.current?.innerHTML || "";
    const w = window.open("", "_blank", "width=900,height=1200");
    w.document.open();
    w.document.write(`
      <html>
        <head>
          <title>${COMPANY_NAME} — Vehicle Inspection (${gp.gate_pass_no || ""})</title>
          <style>
            @page{size:A4;margin:16mm;}
            body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#111827;}
            .header{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px;}
            .logo{height:40px;}
            .h1{font-size:20px;font-weight:700;margin:0;}
            .meta{font-size:12px;color:#374151;}
            table{width:100%;border-collapse:collapse;table-layout:fixed;}
            th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;vertical-align:middle;}
            th{background:#f9fafb;text-align:left;}
            .badge{display:inline-block;border:1px solid #d1d5db;border-radius:9999px;padding:2px 8px;font-size:11px;}
            .ok{background:#d1fae5;border-color:#a7f3d0;color:#065f46;}
            .nok{background:#fee2e2;border-color:#fecaca;color:#991b1b;}
            .pending{background:#f1f5f9;border-color:#e2e8f0;color:#334155;}
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

  /* ---------- UI helpers ---------- */
  const StatusPill = ({ label }) => (
    <span
      className={cls(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        badgeColor(label)
      )}
    >
      <ListChecks className="h-3.5 w-3.5" />
      {label || "Draft"}
    </span>
  );

  /* ---------- render ---------- */
  return (
    <div className="p-3 sm:p-4">
      {/* Gradient header */}
      <div className="rounded-xl overflow-hidden mb-3">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">
            Material Inward — Vehicle Inspection
          </div>
          <WhiteChip>Auto-release on Accepted</WhiteChip>
          {gp?.gate_pass_no ? (
            <WhiteChip>
              <QrCode className="w-3 h-3" />
              {gp.gate_pass_no}
            </WhiteChip>
          ) : (
            <span className="text-xs opacity-80">Scan/enter Gate Pass</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={printA4}
              disabled={!gp}
              className="gap-1 bg-white text-blue-800 hover:bg-blue-50"
            >
              <Printer className="w-4 h-4" />
              <span>Preview & Print</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Search / Scan */}
      <Card className="p-4 mb-3">
        <div className="grid md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <Label htmlFor="gpno" className="flex items-center gap-2 text-blue-800">
              <QrCode className="h-4 w-4" />
              Gate Pass No.
            </Label>
            <div className="relative">
              <QrCode className="absolute left-2 top-2.5 h-4 w-4 text-blue-700" />
              <Input
                id="gpno"
                ref={gpInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="pl-8"
                placeholder="Scan or type Gate Pass No."
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Hardware scanners work here; press Enter after scan.
            </p>
          </div>
          <Button onClick={handleFetch} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? "Loading..." : "Fetch"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              gpInputRef.current?.focus();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Clear
          </Button>
          <div className="justify-self-end">
            <StatusPill label={overallStatus || "Accepted"} />
          </div>
        </div>
      </Card>

      {/* Gate Pass Details */}
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="h-5 w-5 text-blue-700" />
          <h2 className="font-medium">Gate Pass Details</h2>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : gp ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <InfoRow label="Gate Pass No." value={gp.gate_pass_no} />
              <InfoRow label="Transporter" value={gp.transporter_name} />
              <InfoRow label="LR No." value={gp.lr_no} />
              <InfoRow label="LR Date" value={prettyDate(gp.lr_date)} />
              <InfoRow label="Driver Name" value={gp.driver_name} />
              <InfoRow label="Vehicle No." value={gp.vehicle_no} />
              {matCount != null && (
                <InfoRow label="Material Lines" value={String(matCount)} />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                  <PackageSearch className="h-4 w-4 text-blue-700" />
                  PO Numbers
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(poList || []).length ? (
                    poList.map((p) => (
                      <span
                        key={p}
                        className="text-xs border rounded px-2 py-1 bg-slate-50"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No POs linked</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-blue-700" />
                  Invoices by PO
                </h3>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 border-b">PO No.</th>
                        <th className="text-left p-2 border-b">Invoice No.</th>
                        <th className="text-left p-2 border-b">Invoice Date</th>
                        <th className="text-left p-2 border-b">Prefill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invList || []).length ? (
                        invList.map((r, idx) => (
                          <tr
                            key={`${r.po_no}#${r.invoice_no}#${idx}`}
                            className="odd:bg-white even:bg-slate-50/50"
                          >
                            <td className="p-2 border-b align-middle">
                              {r.po_no}
                            </td>
                            <td className="p-2 border-b align-middle">
                              {r.invoice_no}
                            </td>
                            <td className="p-2 border-b align-middle">
                              {prettyDate(r.invoice_date)}
                            </td>
                            <td className="p-2 border-b align-middle">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() =>
                                  prefillFromPair(r.po_no, r.invoice_no)
                                }
                                title="Prefill LR/Vehicle/Driver/Transporter"
                              >
                                <Eye className="w-4 h-4" />
                                <span>Prefill</span>
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-2 text-slate-500" colSpan={4}>
                            No invoices linked
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">
            Scan or enter a Gate Pass to view details.
          </div>
        )}
      </Card>

      {/* Checklist (aesthetic, even rows) */}
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-5 w-5 text-blue-700" />
          <h2 className="font-medium">Vehicle Inspection Checklist</h2>
          <span className="ml-auto text-xs text-slate-500">
            Accepted → Submit auto-releases • Others → QA
          </span>
        </div>

        {!items.length ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ width: "44%" }} />
                <col style={{ width: 220 }} />
                <col style={{ width: "auto" }} />
              </colgroup>
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 border-b">#</th>
                  <th className="text-left p-2 border-b">Check</th>
                  <th className="text-center p-2 border-b">Result</th>
                  <th className="text-left p-2 border-b">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id || idx} className="odd:bg-white even:bg-slate-50/50">
                    <td className="p-2 border-b align-middle">{idx + 1}</td>
                    <td className="p-2 border-b align-middle">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-blue-700 shrink-0" />
                        <div
                          className="leading-tight"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                          title={it.label}
                        >
                          {it.label}
                        </div>
                        <span
                          className={cls(
                            "ml-auto inline-block border rounded-full px-2 py-[2px] text-[11px] shrink-0",
                            statusPillClass(it.ok)
                          )}
                        >
                          {it.ok === true
                            ? "OK"
                            : it.ok === false
                            ? "Not OK"
                            : "Pending"}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 border-b align-middle">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant={it.ok === true ? "" : "outline"}
                          className="h-8 px-3 gap-1"
                          onClick={() => updateItem(idx, { ok: true })}
                          disabled={!canEdit}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          OK
                        </Button>
                        <Button
                          variant={it.ok === false ? "" : "outline"}
                          className="h-8 px-3 gap-1"
                          onClick={() => updateItem(idx, { ok: false })}
                          disabled={!canEdit}
                        >
                          <XCircle className="h-4 w-4" />
                          Not OK
                        </Button>
                      </div>
                    </td>
                    <td className="p-2 border-b align-middle">
                      <div className="relative">
                        <AlertTriangle className="absolute left-2 top-2.5 h-4 w-4 text-blue-700" />
                        <Input
                          value={it.remarks || ""}
                          onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                          placeholder="Observation / note"
                          className="pl-8 h-9"
                          disabled={!canEdit}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Overall decision */}
      <Card className="p-4 mb-3">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2 text-blue-800">
              <ListChecks className="h-4 w-4" />
              Overall Inspection Status
            </Label>
            <div className="relative mt-1">
              <ListChecks className="absolute left-2 top-2.5 h-4 w-4 text-blue-700" />
              <select
                className="w-full border rounded px-3 py-2 bg-white pl-8"
                value={overallStatus}
                onChange={(e) => setOverallStatus(e.target.value)}
                disabled={!canEdit}
              >
                <option>Accepted</option>
                <option>Rejected</option>
                <option>Quarantine</option>
              </select>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Accepted auto-releases to next step (no QA). Others need QA decision.
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-2 text-blue-800">
              <AlertTriangle className="h-4 w-4" />
              Remarks
            </Label>
            <div className="relative mt-1">
              <AlertTriangle className="absolute left-2 top-2.5 h-4 w-4 text-blue-700" />
              <textarea
                className="w-full border rounded px-3 py-2 min-h-12 pl-8"
                value={overallRemarks}
                onChange={(e) => setOverallRemarks(e.target.value)}
                placeholder="Overall remarks / discrepancies"
                disabled={!canEdit && !isQA(role)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={saveDraft} disabled={saving || loading} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardList className="h-4 w-4" />
          )}
          Save Draft
        </Button>
        <Button onClick={submit} disabled={saving || loading || !gp} className="gap-2">
          <Send className="h-4 w-4" />
          {submitLabel}
        </Button>

        <div className="ml-auto flex flex-wrap gap-2 items-center">
          <div className="relative">
            <PauseCircle className="absolute left-2 top-2.5 h-4 w-4 text-blue-700" />
            <Input
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="Hold note (reason)"
              className="w-56 pl-8"
              disabled={!canEdit}
            />
          </div>
          <Button
            variant="outline"
            onClick={holdVehicle}
            disabled={saving || loading || !gp}
            className="gap-2"
          >
            <PauseCircle className="h-4 w-4" />
            Hold Vehicle
          </Button>
          <Button variant="outline" onClick={resetForm} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* QA panel (only when required) */}
      {qaNeeded ? (
        <Card className="p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            <h2 className="font-medium">QA Final Approval</h2>
            <span className="text-xs text-slate-500 ml-auto">
              Hold/Rejected/Quarantine or Submitted state requires QA decision
            </span>
          </div>
          {isQA(role) ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => qaDecision(true)}
                disabled={saving || loading || flowStatus === "QA Approved"}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve & Release
              </Button>
              <Button
                variant="destructive"
                onClick={() => qaDecision(false)}
                disabled={saving || loading || flowStatus === "QA Rejected"}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                Reject & Return
              </Button>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Waiting for QA action…</div>
          )}
        </Card>
      ) : null}

      {/* A4 Preview surface (hidden; used by print) */}
      <div ref={a4Ref} className="hidden">
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
              {COMPANY_NAME} — Vehicle Inspection
            </div>
            <div className="meta" style={{ fontSize: 12, color: "#374151" }}>
              Gate Pass: {gp?.gate_pass_no || "-"} • Date:{" "}
              {new Date().toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              Gate Details
            </div>
            <div style={{ fontSize: 12 }}>
              <b>Transporter:</b> {gp?.transporter_name || "-"}
            </div>
            <div style={{ fontSize: 12 }}>
              <b>LR No.:</b> {gp?.lr_no || "-"} &nbsp; <b>LR Date:</b>{" "}
              {prettyDate(gp?.lr_date) || "-"}
            </div>
            <div style={{ fontSize: 12 }}>
              <b>Driver:</b> {gp?.driver_name || "-"} &nbsp; <b>Vehicle:</b>{" "}
              {gp?.vehicle_no || "-"}
            </div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              PO & Invoice
            </div>
            <div style={{ fontSize: 12 }}>
              <b>PO Nos:</b> {(poList || []).join(", ") || "-"}
            </div>
            <div style={{ marginTop: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
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
                      Invoice No.
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        background: "#f9fafb",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      Invoice Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(invList || []).length ? (
                    (invList || []).map((r, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                          {r.po_no}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                          {r.invoice_no}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                          {prettyDate(r.invoice_date)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 8px",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        No invoices linked
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            Checklist — Results
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
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
                  #
                </th>
                <th
                  style={{
                    textAlign: "left",
                    background: "#f9fafb",
                    padding: "6px 8px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  Check
                </th>
                <th
                  style={{
                    textAlign: "left",
                    background: "#f9fafb",
                    padding: "6px 8px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  Result
                </th>
                <th
                  style={{
                    textAlign: "left",
                    background: "#f9fafb",
                    padding: "6px 8px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((it, idx) => (
                <tr key={it.id || idx}>
                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                    {idx + 1}
                  </td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                    {it.label}
                  </td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                    <span
                      className={
                        "badge " + (it.ok === true ? "ok" : it.ok === false ? "nok" : "pending")
                      }
                      style={{
                        display: "inline-block",
                        border: "1px solid #d1d5db",
                        borderRadius: "9999px",
                        padding: "2px 8px",
                        fontSize: 11,
                      }}
                    >
                      {it.ok === true ? "OK" : it.ok === false ? "Not OK" : "Pending"}
                    </span>
                  </td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontSize: 12 }}>
                    {it.remarks || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, color: "#374151", marginTop: 8 }}>
          <b>Overall:</b> {overallStatus} • <b>Remarks:</b> {overallRemarks || "-"} •{" "}
          <b>Status:</b> {flowStatus}
        </div>
      </div>
    </div>
  );
};

/* ---------- tiny subcomponents ---------- */
const InfoRow = ({ label, value }) => (
  <div className="text-sm">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="font-medium">{value || "-"}</div>
  </div>
);

export default VehicleInspection;
