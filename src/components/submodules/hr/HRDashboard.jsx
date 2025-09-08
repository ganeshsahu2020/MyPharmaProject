// src/components/submodules/hr/HRDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from "../../ui/button"; // default import
import { Skeleton } from "../../ui/skeleton"; // shadcn skeleton

import {
  Users,
  UserPlus,
  CalendarDays,
  CalendarClock,
  DollarSign,
  Briefcase,
  ClipboardList,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";

/* ─────────────────────────── utils ─────────────────────────── */
const today = new Date();
const startOfMonth = () =>
  new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
const endOfMonth = () =>
  new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : "—");

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
  return "info";
};

const interviewTone = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("complete")) return "success";
  if (s.includes("schedule")) return "info";
  if (s.includes("cancel") || s.includes("no show")) return "danger";
  return "warning";
};

/* ─────────────────────────── component ─────────────────────────── */
export default function HRDashboard() {
  const [range, setRange] = useState({ start: startOfMonth(), end: endOfMonth() });
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);

  const [stats, setStats] = useState({
    total_employees: 0,
    new_hires: 0,
    pending_leaves: 0,
    total_payroll: 0,
    open_jobs: 0,
    new_candidates: 0,
    new_applications: 0,
    interviews_upcoming: 0,
  });

  const [leaves, setLeaves] = useState([]);
  const [interviews, setInterviews] = useState([]);

  const tiles = useMemo(
    () => [
      {
        key: "total_employees",
        label: "Total Employees",
        value: stats.total_employees || 0,
        icon: <Users className="h-4 w-4 text-blue-100/90" />,
        tone: "from-blue-600/80 to-blue-700/80",
      },
      {
        key: "new_hires",
        label: "New Hires",
        value: stats.new_hires || 0,
        icon: <UserPlus className="h-4 w-4 text-emerald-100/90" />,
        tone: "from-emerald-600/80 to-emerald-700/80",
      },
      {
        key: "pending_leaves",
        label: "Pending Leaves",
        value: stats.pending_leaves || 0,
        icon: <CalendarClock className="h-4 w-4 text-amber-100/90" />,
        tone: "from-amber-600/80 to-amber-700/80",
      },
      {
        key: "total_payroll",
        label: "Total Payroll",
        value: Number(stats.total_payroll || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        icon: <DollarSign className="h-4 w-4 text-indigo-100/90" />,
        tone: "from-indigo-600/80 to-indigo-700/80",
      },
      {
        key: "open_jobs",
        label: "Open Jobs",
        value: stats.open_jobs || 0,
        icon: <Briefcase className="h-4 w-4 text-cyan-100/90" />,
        tone: "from-cyan-600/80 to-cyan-700/80",
      },
      {
        key: "new_candidates",
        label: "New Candidates",
        value: stats.new_candidates || 0,
        icon: <Users className="h-4 w-4 text-fuchsia-100/90" />,
        tone: "from-fuchsia-600/80 to-fuchsia-700/80",
      },
      {
        key: "new_applications",
        label: "New Applications",
        value: stats.new_applications || 0,
        icon: <ClipboardList className="h-4 w-4 text-sky-100/90" />,
        tone: "from-sky-600/80 to-sky-700/80",
      },
      {
        key: "interviews_upcoming",
        label: "Interviews (range)",
        value: stats.interviews_upcoming || 0,
        icon: <Clock className="h-4 w-4 text-violet-100/90" />,
        tone: "from-violet-600/80 to-violet-700/80",
      },
    ],
    [stats]
  );

  const pickFirstRow = (data, defaults = {}) => {
    if (!data) return defaults;
    if (Array.isArray(data)) return data[0] || defaults;
    return data || defaults;
  };

  /* ── data loaders ── */
  const loadStats = async (s = range.start, e = range.end) => {
    const { data, error } = await supabase.rpc("hr_dashboard_stats_all", {
      p_start: s,
      p_end: e,
    });
    if (error) console.error(error);
    setStats(pickFirstRow(data, stats));
  };

  const loadLeaves = async (s = range.start, e = range.end) => {
    const { data, error } = await supabase
      .from("vw_leave_requests")
      .select("*")
      .lte("start_date", e)
      .gte("end_date", s)
      .order("start_date", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setLeaves([]);
      return;
    }
    setLeaves(Array.isArray(data) ? data : []);
  };

  const loadInterviews = async (s = range.start, e = range.end) => {
    const { data, error } = await supabase
      .from("vw_recruit_interviews")
      .select("*")
      .gte("scheduled_at", s)
      .lte("scheduled_at", e)
      .order("scheduled_at", { ascending: true })
      .limit(100);

    if (error) {
      console.warn("Interviews load:", error.message);
      setInterviews([]);
      return;
    }
    setInterviews(Array.isArray(data) ? data : []);
  };

  const refreshAll = async () => {
    setLoading(true);
    setLoadingTables(true);
    await toast.promise(
      Promise.all([loadStats(), loadLeaves(), loadInterviews()]),
      {
        loading: "Refreshing dashboard…",
        success: "Dashboard updated",
        error: "Failed to refresh data",
      }
    );
    setLoading(false);
    setLoadingTables(false);
  };

  /* ── effects ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadingTables(true);
      await Promise.all([loadStats(), loadLeaves(), loadInterviews()]);
      setLoading(false);
      setLoadingTables(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadingTables(true);
      await Promise.all([
        loadStats(range.start, range.end),
        loadLeaves(range.start, range.end),
        loadInterviews(range.start, range.end),
      ]);
      setLoading(false);
      setLoadingTables(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="p-4 space-y-4">
      {/* Header with gradient branding */}
      <div className="rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-4 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs/5 opacity-90">HR Insights</div>
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
                HR Dashboard
              </h2>
              <p className="text-xs opacity-90">
                Range:&nbsp;{fmtDate(range.start)} — {fmtDate(range.end)}
              </p>
            </div>

            {/* Date range pickers with icons (no overlap) */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative">
                <CalendarDays className="h-4 w-4 absolute left-2 top-2.5 text-blue-100/90" />
                <input
                  type="date"
                  className="border rounded pl-8 pr-2 py-1 text-sm text-blue-900"
                  value={range.start}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, start: e.target.value }))
                  }
                />
              </div>
              <div className="relative">
                <CalendarDays className="h-4 w-4 absolute left-2 top-2.5 text-blue-100/90" />
                <input
                  type="date"
                  className="border rounded pl-8 pr-2 py-1 text-sm text-blue-900"
                  value={range.end}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, end: e.target.value }))
                  }
                />
              </div>
              <Button onClick={refreshAll} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>
          </div>
        </div>

        {/* Tiles */}
        <div className="bg-white p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Card key={`sk-${i}`} className="p-3">
                  <Skeleton className="h-4 w-1/3 mb-2" />
                  <Skeleton className="h-6 w-2/3" />
                </Card>
              ))
            ) : (
              tiles.map((t) => (
                <Card key={t.key} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">{t.label}</div>
                    <div
                      className={`rounded-md px-1.5 py-1 bg-gradient-to-r ${t.tone}`}
                    >
                      {t.icon}
                    </div>
                  </div>
                  <div className="mt-1 text-2xl font-bold text-blue-800">
                    {t.value}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Leaves overlapping the selected range */}
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2 text-blue-800">
          Recent Leave Requests (overlap in range)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">Employee</th>
                <th className="p-2 border text-left">Leave Type</th>
                <th className="p-2 border text-left">Dates</th>
                <th className="p-2 border text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingTables ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`leave-sk-${i}`}>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : leaves.length > 0 ? (
                leaves.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 border">{`${r.employee_id} — ${
                      r.first_name || ""
                    } ${r.last_name || ""}`}</td>
                    <td className="p-2 border">{r.leave_name || "-"}</td>
                    <td className="p-2 border">
                      {fmtDate(r.start_date)} — {fmtDate(r.end_date)}
                    </td>
                    <td className="p-2 border">
                      <span className={chipClass(leaveTone(r.status))}>
                        {(r.status || "").toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-3 text-center text-gray-500 border" colSpan={4}>
                    No records
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upcoming Interviews */}
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2 text-blue-800">
          Upcoming Interviews (in range)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">When</th>
                <th className="p-2 border text-left">Job</th>
                <th className="p-2 border text-left">Candidate</th>
                <th className="p-2 border text-left">Round</th>
                <th className="p-2 border text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingTables ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`int-sk-${i}`}>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="p-2 border">
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : interviews.length > 0 ? (
                interviews.map((iv) => (
                  <tr key={iv.interview_id || `${iv.scheduled_at}-${iv.candidate_name}`}>
                    <td className="p-2 border">{fmtDateTime(iv.scheduled_at)}</td>
                    <td className="p-2 border">{iv.job_title || "-"}</td>
                    <td className="p-2 border">{iv.candidate_name || "-"}</td>
                    <td className="p-2 border">
                      {iv.round_no != null ? `Round ${iv.round_no}` : "-"}
                    </td>
                    <td className="p-2 border">
                      <span className={chipClass(interviewTone(iv.interview_status))}>
                        {(iv.interview_status || "").toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-3 text-center text-gray-500 border" colSpan={5}>
                    No interviews
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
