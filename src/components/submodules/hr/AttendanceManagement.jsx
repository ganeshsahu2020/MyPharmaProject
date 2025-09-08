// src/components/submodules/hr/AttendanceManagement.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from "../../ui/button"; // default import
import Input from "../../ui/Input"; // default import
import { Skeleton } from "../../ui/skeleton";
import toast from "react-hot-toast";

import {
  Users,
  CalendarDays,
  Clock4,
  Search,
  Download as DownloadIcon,
  Settings2,
  FileSpreadsheet,
  ClipboardList,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const STATUSES = ["pending", "approved", "rejected", "cancelled"];

/* ─────────────────────────── tiny helpers ─────────────────────────── */
const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
const toTime = (t) => (t ? t.toString().slice(0, 5) : "");
const fmtDT = (s) => (s ? new Date(s).toLocaleString() : "—");
const parseIntSafe = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
// minutes → hours helpers
const minToHours = (m) => ((Number(m) || 0) / 60).toFixed(2);
const overtimeHoursFromMin = (m, baseMin) =>
  (Math.max(0, (Number(m) || 0) - (Number(baseMin) || 0)) / 60).toFixed(2);

// lightweight CSV
function downloadCsv(name, rows, headers) {
  const hdr = headers.map((h) => `"${h}"`).join(",");
  const lines = rows.map((r) =>
    headers.map((k) => `"${(r[k] ?? "").toString().replace(/"/g, '""')}"`).join(",")
  );
  const csv = [hdr, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// tiny modal
const Modal = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[90vw] max-w-md">
        {children}
      </div>
    </div>
  );
};

// parse roles from various shapes (array, postgres text[], JSON, string)
function normalizeRoles(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    if (v.startsWith("{") && v.endsWith("}"))
      return v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) return j;
    } catch (_) {}
    return [v];
  }
  if (v && typeof v === "object" && Array.isArray(v.roles)) return v.roles;
  return [];
}

/* ─────────────────────────── UI helpers ─────────────────────────── */
const chipClass = (tone = "default") => {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-white";
  switch (tone) {
    case "success":
      return `${base} border-emerald-300 text-emerald-700`;
    case "warning":
      return `${base} border-amber-300 text-amber-700`;
    case "danger":
      return `${base} border-rose-300 text-rose-700`;
    case "info":
      return `${base} border-blue-300 text-blue-700`;
    default:
      return `${base} border-gray-300 text-gray-700`;
  }
};

const leaveTone = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "success";
  if (s.includes("pend")) return "warning";
  if (s.includes("reject")) return "danger";
  if (s.includes("cancel")) return "danger";
  return "info";
};

const attendanceTone = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("present")) return "success";
  if (s.includes("leave") || s.includes("holiday")) return "info";
  if (s.includes("absent")) return "danger";
  return "warning";
};

/* ─────────────────────────── component ─────────────────────────── */
const AttendanceManagement = () => {
  // whoami -> can HR?
  const [me, setMe] = useState({ email: "", roles: [], loading: true });
  const canHR = useMemo(() => {
    const r = me.roles || [];
    return r.includes("Super Admin") || r.includes("Admin") || r.includes("HR");
  }, [me.roles]);

  // overtime base (env -> DB -> fallback)
  const [ovBaseMin, setOvBaseMin] = useState(
    parseIntSafe(import.meta.env?.VITE_OVERTIME_BASE_MIN, 480)
  );

  // employee directory (for labels)
  const [people, setPeople] = useState([]); // [{id, employee_id, first_name, last_name, email}]
  const nameById = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      m.set(
        p.id,
        `${p.employee_id ? `[${p.employee_id}] ` : ""}${p.first_name || ""} ${
          p.last_name || ""
        }`.trim()
      );
    }
    return m;
  }, [people]);

  // attendance browser
  const [range, setRange] = useState({
    start: isoDate(new Date(Date.now() - 7 * 86400000)),
    end: isoDate(),
  });
  const [search, setSearch] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [loadingAtt, setLoadingAtt] = useState(false);

  // HR queues (missed punch)
  const [corrPending, setCorrPending] = useState([]);
  const [loadingCorr, setLoadingCorr] = useState(false);
  const [corrComment, setCorrComment] = useState({}); // {id: text}
  const [deciding, setDeciding] = useState({}); // optimistic spinner per row

  // "create on behalf"
  const [newCorr, setNewCorr] = useState({
    employee_uid: "",
    date: isoDate(),
    in: "",
    out: "",
    reason: "",
  });
  const [creatingCorr, setCreatingCorr] = useState(false);

  // HR Leave panel
  const [leaveRows, setLeaveRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  // OT base modal
  const [showCfg, setShowCfg] = useState(false);
  const [cfgVal, setCfgVal] = useState((ovBaseMin / 60).toFixed(2)); // hours string
  const [savingCfg, setSavingCfg] = useState(false);

  useEffect(() => {
    (async () => {
      // robust whoami
      const {
        data: { user } = {},
      } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const authEmail = user?.email || null;
      let roles = [];
      let who = null;

      try {
        const { data: meRow, error } = await supabase.rpc("app_whoami").single();
        if (!error && meRow) {
          roles = normalizeRoles(meRow.roles);
          who = { email: meRow.email || authEmail, roles };
        }
      } catch (_) {
        /* ignore */
      }

      if ((roles || []).length === 0 && authEmail) {
        try {
          const { data } = await supabase
            .from("vw_user_management_ext")
            .select("email, role")
            .eq("email", authEmail)
            .maybeSingle();
          if (data) {
            roles = normalizeRoles(data.role);
            who = { email: authEmail, roles };
          }
        } catch (_) {}
        if ((roles || []).length === 0) {
          try {
            const { data } = await supabase
              .from("vw_user_management")
              .select("email, role")
              .eq("email", authEmail)
              .maybeSingle();
            if (data) {
              roles = normalizeRoles(data.role);
              who = { email: authEmail, roles };
            }
          } catch (_) {}
        }
        if ((roles || []).length === 0) {
          try {
            const { data } = await supabase
              .from("user_management")
              .select("email, role")
              .eq("email", authEmail)
              .maybeSingle();
            if (data) {
              roles = normalizeRoles(data.role);
              who = { email: authEmail, roles };
            }
          } catch (_) {}
        }
      }

      setMe({ email: who?.email || authEmail || "", roles: roles || [], loading: false });

      // directory preload (best effort)
      await loadDirectory();

      // overtime base from DB (optional)
      try {
        const { data: cfg, error: cfgErr } = await supabase.rpc("app_overtime_base_min");
        if (!cfgErr && Number.isFinite(cfg)) {
          setOvBaseMin(cfg);
          setCfgVal((cfg / 60).toFixed(2));
        }
      } catch (_) {
        /* ignore */
      }

      await Promise.all([loadAttendance(), loadCorrections(), loadLeaves()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh leaves on Status/Search
  useEffect(() => {
    loadLeaves();
    // eslint-disable-next-line
  }, [statusFilter, leaveSearch]);

  // robust directory loader
  async function loadDirectory() {
    try {
      const { data } = await supabase
        .from("vw_user_management_ext")
        .select("id, employee_id, first_name, last_name, email")
        .order("employee_id", { ascending: true });
      if (data && data.length) {
        setPeople(data);
        return;
      }
    } catch (_) {}
    try {
      const { data } = await supabase
        .from("vw_user_management")
        .select("id, employee_id, first_name, last_name, email")
        .order("employee_id", { ascending: true });
      if (data && data.length) {
        setPeople(data);
        return;
      }
    } catch (_) {}
    try {
      const { data } = await supabase
        .from("user_management")
        .select("id, employee_id, first_name, last_name, email")
        .order("employee_id", { ascending: true });
      setPeople(data || []);
    } catch (_) {}
  }

  // ensure directory includes given IDs (fix UUIDs in Employee column)
  async function ensureDirectoryFor(ids) {
    const want = [...new Set(ids)].filter((id) => !people.some((p) => p.id === id));
    if (want.length === 0) return;
    for (const source of ["vw_user_management_ext", "vw_user_management", "user_management"]) {
      try {
        const { data } = await supabase
          .from(source)
          .select("id, employee_id, first_name, last_name, email")
          .in("id", want);
        if (data?.length) {
          setPeople((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const add = data.filter((d) => !seen.has(d.id));
            return [...prev, ...add];
          });
          break;
        }
      } catch (_) {}
    }
  }

  /* ─────────────────────────── loads ─────────────────────────── */
  async function loadAttendance() {
    setLoadingAtt(true);
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date", { ascending: false });
      if (error) console.error(error);
      setAttendance(data || []);
      await ensureDirectoryFor((data || []).map((r) => r.employee_uid));
    } catch (e) {
      console.error(e);
    }
    setLoadingAtt(false);
  }

  async function loadCorrections() {
    setLoadingCorr(true);
    try {
      const { data, error } = await supabase
        .from("attendance_correction_request")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) console.error(error);
      setCorrPending(data || []);
      await ensureDirectoryFor((data || []).map((r) => r.employee_uid));
    } catch (e) {
      console.error(e);
    }
    setLoadingCorr(false);
  }

  async function loadLeaves() {
    setLoadingLeave(true);
    try {
      let q = supabase
        .from("leave_request_ui")
        .select(
          "id, employee_uid, date_from, date_to, leave_type, status, reason, hr_comment, hr_private_note, created_at"
        )
        .order("created_at", { ascending: false });
      if (statusFilter) q = q.eq("status", statusFilter);
      let { data, error } = await q;
      if (error) {
        const alt = supabase
          .from("leave_request")
          .select(
            "id, employee_uid, date_from, date_to, leave_type, status, reason, hr_comment, hr_private_note, created_at"
          )
          .order("created_at", { ascending: false });
        ({ data, error } = await alt);
        if (error) console.error(error);
      }
      let rows = data || [];
      if (leaveSearch.trim()) {
        const s = leaveSearch.toLowerCase();
        rows = rows.filter((r) => {
          const nm = (nameById.get(r.employee_uid) || "").toLowerCase();
          return (
            nm.includes(s) ||
            (r.leave_type || "").toLowerCase().includes(s) ||
            (r.reason || "").toLowerCase().includes(s)
          );
        });
      }
      setLeaveRows(rows);
      await ensureDirectoryFor(rows.map((r) => r.employee_uid));
    } catch (e) {
      console.error(e);
    }
    setLoadingLeave(false);
  }

  /* ─────────────────────────── CSV ─────────────────────────── */
  function exportAttendanceCsv() {
    const rows = (attendance || []).map((r) => ({
      employee: nameById.get(r.employee_uid) || r.employee_uid,
      date: r.date,
      status: r.status || "",
      check_in: r.check_in || "",
      check_out: r.check_out || "",
      work_h: minToHours(r.total_work_minutes || 0),
      break_h: minToHours(r.total_break_minutes || 0),
      overtime_h: overtimeHoursFromMin(r.total_work_minutes || 0, ovBaseMin),
      updated_at: r.updated_at || "",
    }));
    downloadCsv(
      `attendance_${range.start}_${range.end}.csv`,
      rows,
      ["employee", "date", "status", "check_in", "check_out", "work_h", "break_h", "overtime_h", "updated_at"]
    );
  }

  function exportCorrectionsCsv() {
    const rows = (corrPending || []).map((r) => ({
      employee: nameById.get(r.employee_uid) || r.employee_uid,
      request_date: r.request_date,
      proposed_check_in: r.proposed_check_in || "",
      proposed_check_out: r.proposed_check_out || "",
      reason: r.reason || "",
      status: r.status || "",
      hr_comment: r.hr_comment || "",
      created_at: r.created_at || "",
    }));
    downloadCsv(
      `corrections_pending_${range.start}_${range.end}.csv`,
      rows,
      ["employee", "request_date", "proposed_check_in", "proposed_check_out", "reason", "status", "hr_comment", "created_at"]
    );
  }

  /* ─────────────────────────── create (on behalf) ─────────────────────────── */
  async function createCorrectionForEmployee() {
    if (!canHR) return toast.error("Not authorized");
    if (!newCorr.employee_uid || !newCorr.reason.trim())
      return toast.error("Employee & reason required");

    setCreatingCorr(true);
    const tempId = `tmp_${Date.now()}`;
    const optimisticRow = {
      id: tempId,
      employee_uid: newCorr.employee_uid,
      request_date: newCorr.date,
      proposed_check_in: newCorr.in || null,
      proposed_check_out: newCorr.out || null,
      reason: newCorr.reason.trim(),
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setCorrPending((s) => [optimisticRow, ...s]);

    const payload = {
      employee_uid: newCorr.employee_uid,
      request_date: newCorr.date,
      proposed_check_in: newCorr.in || null,
      proposed_check_out: newCorr.out || null,
      reason: newCorr.reason.trim(),
    };

    await toast
      .promise(
        supabase.from("attendance_correction_request").insert([payload]).select().single(),
        {
          loading: "Creating correction…",
          success: "Correction created",
          error: "Create failed",
        }
      )
      .then(async ({ data }) => {
        await ensureDirectoryFor([data.employee_uid]);
        setCorrPending((s) => [data, ...s.filter((x) => x.id !== tempId)]);
        setNewCorr({ employee_uid: "", date: isoDate(), in: "", out: "", reason: "" });
      })
      .catch(() => {
        setCorrPending((s) => s.filter((x) => x.id !== tempId));
      });

    setCreatingCorr(false);
  }

  /* ─────────────────────────── decisions ─────────────────────────── */
  async function decideCorrection(id, decision) {
    if (!canHR) return toast.error("Not authorized");
    const comment = corrComment[id]?.trim() || null;
    setDeciding((s) => ({ ...s, [id]: true }));

    // optimistic remove
    const prev = corrPending;
    setCorrPending((s) => s.filter((x) => x.id !== id));

    await toast
      .promise(
        supabase.rpc("hr_correction_decide", {
          p_id: id,
          p_decision: decision,
          p_hr_comment: comment,
        }),
        {
          loading: `${decision === "approved" ? "Approving" : "Rejecting"}…`,
          success: `Request ${decision}.`,
          error: "Action failed",
        }
      )
      .then(async () => {
        await loadAttendance();
        setCorrComment((s) => ({ ...s, [id]: "" }));
      })
      .catch(() => {
        setCorrPending(prev); // rollback
      });

    setDeciding((s) => ({ ...s, [id]: false }));
  }

  /* ─────────────────────────── leave save ─────────────────────────── */
  async function saveLeaveRow(r) {
    if (!canHR) return toast.error("Not authorized");
    setBusy(true);
    setFlash(null);

    await toast
      .promise(
        supabase.rpc("hr_leave_set_status", {
          p_leave_id: r.id,
          p_status: r.status,
          p_hr_comment: r.hr_comment || null,
          p_hr_private_note: r.hr_private_note || null,
        }),
        {
          loading: "Saving…",
          success: "Saved.",
          error: "Save failed",
        }
      )
      .then(async () => {
        await loadLeaves();
      })
      .catch((e) => {
        setFlash({ kind: "error", text: e?.message || "Save failed" });
      });

    setBusy(false);
  }

  /* ─────────────────────────── filters/summary ─────────────────────────── */
  const filteredAttendance = useMemo(() => {
    if (!search.trim()) return attendance;
    const t = search.toLowerCase();
    return attendance.filter((r) => {
      const nm = (nameById.get(r.employee_uid) || "").toLowerCase();
      const bag = `${nm} ${r.status ?? ""} ${r.date} ${toTime(r.check_in)} ${toTime(
        r.check_out
      )} ${minToHours(r.total_work_minutes)} ${minToHours(r.total_break_minutes)}`.toLowerCase();
      return bag.includes(t);
    });
  }, [attendance, search, nameById]);

  const attSummary = useMemo(() => {
    const rows = filteredAttendance;
    const days = rows.length;
    const workMin = rows.reduce((a, r) => a + (Number(r.total_work_minutes) || 0), 0);
    const breakMin = rows.reduce((a, r) => a + (Number(r.total_break_minutes) || 0), 0);
    const overtimeMin = rows.reduce(
      (a, r) => a + Math.max(0, (Number(r.total_work_minutes) || 0) - ovBaseMin),
      0
    );
    const presentDays = rows.filter((r) => (r.status || "").toLowerCase() === "present").length;
    return {
      days,
      presentDays,
      workH: minToHours(workMin),
      breakH: minToHours(breakMin),
      overtimeH: (overtimeMin / 60).toFixed(2),
      avgH: days ? (workMin / 60 / days).toFixed(2) : "0.00",
    };
  }, [filteredAttendance, ovBaseMin]);

  /* ─────────────────────────── UI ─────────────────────────── */
  const SkelRow = ({ cols = 9 }) => (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-2 border">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );

  const saveOtBase = async () => {
    const hours = parseFloat(cfgVal);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      return toast.error("Enter a valid number of hours between 0 and 24.");
    }
    const newMin = Math.round(hours * 60);
    const old = ovBaseMin;
    setSavingCfg(true);
    setOvBaseMin(newMin); // optimistic

    await toast
      .promise(supabase.rpc("app_set_overtime_base_min", { p_value: newMin }), {
        loading: "Saving overtime base…",
        success: "Overtime base updated",
        error: "Failed to save overtime base",
      })
      .catch(() => setOvBaseMin(old))
      .finally(() => {
        setSavingCfg(false);
        setShowCfg(false);
      });
  };

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="p-3 space-y-4">
      {/* BRANDING-ONLY HEADER */}
      <div className="rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-5 text-white">
          <div className="space-y-0.5">
            <div className="text-xs/5 opacity-90 inline-flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              Workforce
            </div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
              Attendance Management
            </h2>
          </div>
        </div>
      </div>

      {/* CONTROLS (moved out of header) */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-xs text-gray-600 inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-700" />
            Range:&nbsp;
            {new Date(range.start).toLocaleDateString()} —{" "}
            {new Date(range.end).toLocaleDateString()}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <div className="relative">
            <CalendarDays className="h-4 w-4 absolute left-2 top-2.5 text-blue-600/80" />
            <input
              type="date"
              className="border rounded pl-8 pr-2 py-1 text-sm text-blue-900 w-full"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              inputMode="numeric"
            />
          </div>
          <div className="relative">
            <CalendarDays className="h-4 w-4 absolute left-2 top-2.5 text-blue-600/80" />
            <input
              type="date"
              className="border rounded pl-8 pr-2 py-1 text-sm text-blue-900 w-full"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              inputMode="numeric"
            />
          </div>
          <div className="relative md:col-span-2 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-blue-600/80" />
            <Input
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name/status/date/time"
              inputMode="text"
              enterKeyHint="search"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-gray-700 inline-flex items-center gap-1">
              <Clock4 className="h-3.5 w-3.5 text-blue-700" />
              OT base: {(ovBaseMin / 60).toFixed(2)}h
            </div>
            {canHR && (
              <Button
                variant="outline"
                onClick={() => {
                  setCfgVal((ovBaseMin / 60).toFixed(2));
                  setShowCfg(true);
                }}
                className="gap-1"
              >
                <Settings2 className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(loadAttendance(), {
                  loading: "Refreshing attendance…",
                  success: "Attendance updated",
                  error: "Failed to refresh",
                })
              }
            >
              Refresh
            </Button>
            <Button variant="outline" onClick={exportAttendanceCsv}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary tiles */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Days</div>
            <div className="font-semibold text-blue-800">{attSummary.days}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Present Days</div>
            <div className="font-semibold text-blue-800">{attSummary.presentDays}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Work (h)</div>
            <div className="font-semibold text-blue-800">{attSummary.workH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Break (h)</div>
            <div className="font-semibold text-blue-800">{attSummary.breakH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Overtime (h)</div>
            <div className="font-semibold text-blue-800">{attSummary.overtimeH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Avg/Day (h)</div>
            <div className="font-semibold text-blue-800">{attSummary.avgH}</div>
          </Card>
        </div>
      </Card>

      {/* Attendance table */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Attendance (range)
          </div>
          <div className="text-xs text-gray-600">
            {me.roles?.length ? `Role: ${me.roles.join(", ")}` : "Role: —"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">Employee</th>
                <th className="p-2 border text-left">Date</th>
                <th className="p-2 border text-left">Status</th>
                <th className="p-2 border text-left">In</th>
                <th className="p-2 border text-left">Out</th>
                <th className="p-2 border text-left">Work (h)</th>
                <th className="p-2 border text-left">Break (h)</th>
                <th className="p-2 border text-left">Overtime (h)</th>
                <th className="p-2 border text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loadingAtt ? (
                <>
                  <SkelRow />
                  <SkelRow />
                  <SkelRow />
                  <SkelRow />
                  <SkelRow />
                </>
              ) : filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-3 text-center text-gray-500">
                    No records
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((r) => (
                  <tr key={`${r.employee_uid}-${r.date}`}>
                    <td className="p-2 border">{nameById.get(r.employee_uid) || r.employee_uid}</td>
                    <td className="p-2 border">{r.date}</td>
                    <td className="p-2 border">
                      <span className={chipClass(attendanceTone(r.status))}>
                        {(r.status || "").toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2 border">{toTime(r.check_in) || "—"}</td>
                    <td className="p-2 border">{toTime(r.check_out) || "—"}</td>
                    <td className="p-2 border">{minToHours(r.total_work_minutes)}</td>
                    <td className="p-2 border">{minToHours(r.total_break_minutes)}</td>
                    <td className="p-2 border">
                      {overtimeHoursFromMin(r.total_work_minutes, ovBaseMin)}
                    </td>
                    <td className="p-2 border text-xs text-gray-500">{fmtDT(r.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* HR queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Missed Punch / Correction */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-blue-800">Pending Missed Punch Requests</div>
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(loadCorrections(), {
                  loading: "Refreshing…",
                  success: "Updated",
                  error: "Failed to refresh",
                })
              }
            >
              Refresh
            </Button>
          </div>

          {/* HR create on behalf */}
          <div className="mb-3 border rounded p-2">
            <div className="font-semibold text-sm mb-2 flex items-center gap-2 text-blue-800">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              Create Correction (on behalf)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <div className="relative">
                <Users className="h-4 w-4 absolute left-2 top-3 text-blue-600/80" />
                <select
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={newCorr.employee_uid}
                  onChange={(e) => setNewCorr((s) => ({ ...s, employee_uid: e.target.value }))}
                >
                  <option value="">Select employee…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.employee_id ? `[${p.employee_id}] ` : ""}
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <CalendarDays className="h-4 w-4 absolute left-2 top-3 text-blue-600/80" />
                <input
                  type="date"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={newCorr.date}
                  onChange={(e) => setNewCorr((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
              <div className="relative">
                <Clock4 className="h-4 w-4 absolute left-2 top-3 text-blue-600/80" />
                <input
                  type="time"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={newCorr.in}
                  onChange={(e) => setNewCorr((s) => ({ ...s, in: e.target.value }))}
                />
              </div>
              <div className="relative">
                <Clock4 className="h-4 w-4 absolute left-2 top-3 text-blue-600/80" />
                <input
                  type="time"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={newCorr.out}
                  onChange={(e) => setNewCorr((s) => ({ ...s, out: e.target.value }))}
                />
              </div>
              <Input
                type="text"
                className=""
                placeholder="Reason"
                value={newCorr.reason}
                onChange={(e) => setNewCorr((s) => ({ ...s, reason: e.target.value }))}
              />
            </div>
            <div className="mt-2">
              <Button disabled={!canHR || creatingCorr} onClick={createCorrectionForEmployee}>
                {creatingCorr ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border text-left">Employee</th>
                  <th className="p-2 border text-left">Date</th>
                  <th className="p-2 border text-left">Proposed In/Out</th>
                  <th className="p-2 border text-left">Reason</th>
                  <th className="p-2 border text-left">HR Comment</th>
                  <th className="p-2 border text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingCorr ? (
                  <>
                    <SkelRow cols={6} />
                    <SkelRow cols={6} />
                    <SkelRow cols={6} />
                  </>
                ) : corrPending.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-gray-500">
                      None
                    </td>
                  </tr>
                ) : (
                  corrPending.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2 border">{nameById.get(r.employee_uid) || r.employee_uid}</td>
                      <td className="p-2 border">{r.request_date}</td>
                      <td className="p-2 border">
                        {toTime(r.proposed_check_in) || "—"} / {toTime(r.proposed_check_out) || "—"}
                      </td>
                      <td className="p-2 border">{r.reason}</td>
                      <td className="p-2 border">
                        <textarea
                          className="border rounded p-1 text-sm w-full"
                          rows={2}
                          placeholder="Optional"
                          value={corrComment[r.id] || ""}
                          onChange={(e) => setCorrComment((s) => ({ ...s, [r.id]: e.target.value }))}
                        />
                      </td>
                      <td className="p-2 border">
                        <div className="flex gap-2">
                          <Button
                            disabled={!canHR || !!deciding[r.id]}
                            onClick={() => decideCorrection(r.id, "approved")}
                            className="inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {deciding[r.id] ? "Working…" : "Approve"}
                          </Button>
                          <Button
                            disabled={!canHR || !!deciding[r.id]}
                            variant="destructive"
                            onClick={() => decideCorrection(r.id, "rejected")}
                            className="inline-flex items-center gap-1"
                          >
                            <XCircle className="h-4 w-4" />
                            {deciding[r.id] ? "Working…" : "Reject"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* HR Leave panel */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-blue-800">Leave Requests</div>
            <div className="flex items-end gap-2">
              <div className="relative">
                <ClipboardList className="h-4 w-4 absolute left-2 top-3 text-blue-600/80" />
                <select
                  className="border rounded p-2 pl-8 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-blue-600/80" />
                <Input
                  value={leaveSearch}
                  onChange={(e) => setLeaveSearch(e.target.value)}
                  placeholder="Name, EmpID, Type…"
                  className="w-56 pl-8"
                />
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  toast.promise(loadLeaves(), {
                    loading: "Refreshing…",
                    success: "Updated",
                    error: "Failed to refresh",
                  })
                }
              >
                Refresh
              </Button>
            </div>
          </div>

          {flash && (
            <div
              className={`mt-2 text-sm rounded border p-2 ${
                flash.kind === "success"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {flash.text}
            </div>
          )}

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border text-left">Employee</th>
                  <th className="p-2 border text-left">Dates</th>
                  <th className="p-2 border text-left">Type</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">Public comment</th>
                  <th className="p-2 border text-left">Internal note</th>
                  <th className="p-2 border text-left w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeave ? (
                  <>
                    <SkelRow cols={7} />
                    <SkelRow cols={7} />
                    <SkelRow cols={7} />
                  </>
                ) : leaveRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-3 text-center text-gray-500">
                      No rows
                    </td>
                  </tr>
                ) : (
                  leaveRows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="p-2 border">
                        <div className="font-medium">
                          {nameById.get(r.employee_uid) || r.employee_uid}
                        </div>
                      </td>
                      <td className="p-2 border">
                        {r.date_from} → {r.date_to}
                      </td>
                      <td className="p-2 border">{r.leave_type}</td>
                      <td className="p-2 border">
                        <div className="flex items-center gap-2">
                          <span className={chipClass(leaveTone(r.status))}>
                            {(r.status || "").toUpperCase()}
                          </span>
                          <select
                            className="border rounded p-1 text-xs"
                            value={r.status}
                            onChange={(e) =>
                              setLeaveRows((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, status: e.target.value } : x))
                              )
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="p-2 border">
                        <textarea
                          className="border rounded p-2 text-sm w-72"
                          rows={2}
                          value={r.hr_comment || ""}
                          onChange={(e) =>
                            setLeaveRows((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, hr_comment: e.target.value } : x))
                            )
                          }
                          placeholder="Visible to employee"
                        />
                      </td>
                      <td className="p-2 border">
                        <textarea
                          className="border rounded p-2 text-sm w-72"
                          rows={2}
                          value={r.hr_private_note || ""}
                          onChange={(e) =>
                            setLeaveRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, hr_private_note: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Internal (HR only)"
                        />
                      </td>
                      <td className="p-2 border">
                        <Button disabled={busy || !canHR} onClick={() => saveLeaveRow(r)}>
                          {busy ? "Saving…" : "Save"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ---- OT Base Modal ---- */}
      <Modal open={showCfg} onClose={() => setShowCfg(false)}>
        <div className="p-4 space-y-3">
          <div className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-blue-700" />
            Overtime Base
          </div>
          <div className="text-sm text-gray-600">
            Set the base hours per day before overtime starts.
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={cfgVal}
              onChange={(e) => setCfgVal(e.target.value)}
              className="border rounded p-2 w-full"
              inputMode="decimal"
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Current: {(ovBaseMin / 60).toFixed(2)}h · Allowed 0–24h
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCfg(false)} disabled={savingCfg}>
              Cancel
            </Button>
            <Button onClick={saveOtBase} disabled={savingCfg}>
              {savingCfg ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AttendanceManagement;
