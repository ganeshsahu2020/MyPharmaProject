// src/components/submodules/hr/PayrollManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from "../../ui/button"; // default export
import Input from "../../ui/Input";   // default export
import { Skeleton } from "../../ui/skeleton";
import toast from "react-hot-toast";

import {
  Calendar,
  CalendarClock,
  Filter,
  RefreshCcw,
  Search,
  FileSpreadsheet,
  Save,
  BadgeIndianRupee,
  ShieldCheck,
  Trash2,
} from "lucide-react";

/* ---------- helpers ---------- */
const VIEW = "payroll_ui_ext"; // unified view (monthly + legacy biweekly if any)

const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const toMoney = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const firstOfMonth = (ym) => `${ym}-01`;

const lastOfMonth = (ym) => {
  const d = new Date(`${ym}-01T00:00:00`);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return isoDate(end);
};

const monthOf = (dateStr) => (dateStr || "").slice(0, 7);

const normalizeRoles = (v) => {
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
};

const StatusBadge = ({ value }) => {
  const v = String(value || "pending").toLowerCase();
  const map = {
    pending: "bg-amber-50 text-amber-800 border-amber-200",
    paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-800 border-rose-200",
  };
  const cls = map[v] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${cls}`}>
      <ShieldCheck className="h-3.5 w-3.5" />
      {v}
    </span>
  );
};

/* ---------- component ---------- */
const PayrollManagement = () => {
  const PAYROLL_STATUSES = ["pending", "paid", "cancelled"];

  // whoami + server-trusted canHR
  const [me, setMe] = useState({ email: "", roles: [], loading: true });
  const [serverCanHR, setServerCanHR] = useState(null);
  const roleFallbackCanHR = useMemo(() => {
    const r = (me.roles || []).map((x) => String(x).toLowerCase());
    return r.includes("super admin") || r.includes("admin") || r.includes("hr");
  }, [me.roles]);
  const canHR = (serverCanHR ?? roleFallbackCanHR) === true;

  // filters
  const [frequency, setFrequency] = useState("monthly"); // monthly | biweekly
  const [fromMonth, setFromMonth] = useState(monthOf(isoDate()));
  const [toMonth, setToMonth] = useState(monthOf(isoDate()));
  const [fromDate, setFromDate] = useState(isoDate(new Date(Date.now() - 13 * 86400000)));
  const [toDate, setToDate] = useState(isoDate());
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [banner, setBanner] = useState(null);
  const [savingRowId, setSavingRowId] = useState(null);
  const [deletingRowId, setDeletingRowId] = useState(null);
  const inflight = useRef(false);

  /* -------- screen/print helper CSS -------- */
  const PrintCSS = () => (
    <style>{`
      @media print { .no-print { display: none !important; } }
    `}</style>
  );

  /* -------- boot -------- */
  useEffect(() => {
    (async () => {
      try {
        // Robust whoami
        const { data: { user } = {} } = await supabase.auth
          .getUser()
          .catch(() => ({ data: { user: null } }));
        const authEmail = user?.email || null;
        let roles = [];
        let who = null;

        try {
          const { data: meRow } = await supabase.rpc("app_whoami").single();
          if (meRow) {
            roles = normalizeRoles(meRow.roles);
            who = { email: meRow.email || authEmail, roles };
          }
        } catch (_) {}

        if ((roles || []).length === 0 && authEmail) {
          for (const src of ["vw_user_management_ext", "vw_user_management", "user_management"]) {
            try {
              const { data } = await supabase
                .from(src)
                .select("email, role")
                .eq("email", authEmail)
                .maybeSingle();
              if (data) {
                roles = normalizeRoles(data.role);
                break;
              }
            } catch {}
          }
          who = { email: authEmail, roles };
        }

        setMe({ email: who?.email || authEmail || "", roles: roles || [], loading: false });

        // server auth check (best effort)
        try {
          const { data } = await supabase.rpc("app_has_any_role", {
            role_list: ["HR", "Admin", "Super Admin"],
          });
          setServerCanHR(Boolean(data));
        } catch {
          setServerCanHR(null);
        }

        await doLoad();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- loader with server-side search -------- */
  async function doLoad({ applySearch = false } = {}) {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setBanner(null);

    const wantMonthly = frequency === "monthly";
    const from = wantMonthly ? firstOfMonth(fromMonth) : fromDate;
    const to = wantMonthly ? lastOfMonth(toMonth) : toDate;

    try {
      let q = supabase.from(VIEW).select("*");

      // Align with PaystubEditor: monthly is the primary path.
      if (wantMonthly) {
        q = q
          .eq("period_type", "monthly")
          .order("period_month", { ascending: false })
          .gte("period_month", fromMonth)
          .lte("period_month", toMonth);
      } else {
        // legacy / historical biweekly (if your view still exposes it)
        q = q
          .eq("period_type", "biweekly")
          .order("period_to", { ascending: false })
          .gte("period_from", from)
          .lte("period_to", to);
      }

      if (statusFilter) q = q.eq("status", statusFilter);

      // server-side search against view's search_text
      const s = (search || "").trim();
      if (applySearch && s) q = q.ilike("search_text", `%${s}%`);

      const { data, error } = await q;
      if (error) throw error;

      // safety sort consistent with the active mode
      const sorted = (data || []).sort((a, b) => {
        const keyB = wantMonthly ? (b.period_month || "") : (b.period_to || b.period_end || "");
        const keyA = wantMonthly ? (a.period_month || "") : (a.period_to || a.period_end || "");
        return String(keyB).localeCompare(String(keyA));
      });
      setRows(sorted);
    } catch (e) {
      setBanner({ kind: "error", text: `Load failed: ${e.message}` });
      setRows([]);
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }

  /* -------- save a row (status + note) -------- */
  async function saveRow(r) {
    if (!canHR) return;
    setSavingRowId(r.id);
    setBanner(null);

    // Align with PaystubEditor change:
    // New stubs live in "payroll" (key: employee_uid + month).
    // For legacy biweekly rows, try payroll_biweekly fallback.
    try {
      await toast.promise(
        (async () => {
          // try payroll first
          const { data: up1, error: e1 } = await supabase
            .from("payroll")
            .update({ status: r.status, notes: r.hr_comment ?? null })
            .eq("id", r.id)
            .select("id");

          if (e1) throw e1;
          if (Array.isArray(up1) && up1.length > 0) return "ok";

          // fallback to legacy table (if this was truly a biweekly legacy row)
          const { data: up2, error: e2 } = await supabase
            .from("payroll_biweekly")
            .update({ status: r.status, notes: r.hr_comment ?? null })
            .eq("id", r.id)
            .select("id");

          if (e2) throw e2;
          if (!Array.isArray(up2) || up2.length === 0) throw new Error("Row not found");
          return "ok";
        })(),
        { loading: "Saving…", success: "Saved!", error: (e) => e.message || "Save failed" }
      );

      // refresh to reflect view recomputations
      await doLoad();
    } finally {
      setSavingRowId(null);
    }
  }

  /* -------- delete a row -------- */
  async function deleteRow(r) {
    if (!canHR) return;
    const wantMonthly = (r.period_type || "monthly") === "monthly";
    const title =
      wantMonthly
        ? `Delete monthly stub for ${r.period_month || monthOf(r.period_from || "")}`
        : `Delete biweekly stub ${r.period_from || ""} → ${r.period_to || ""}`;
    const ok = window.confirm(
      `${title}\nEmployee: ${r.employee_label || r.employee_uid}\n\nThis action cannot be undone.`
    );
    if (!ok) return;

    setDeletingRowId(r.id);
    try {
      await toast.promise(
        (async () => {
          // try payroll first
          const { data: del1, error: e1 } = await supabase
            .from("payroll")
            .delete()
            .eq("id", r.id)
            .select("id");
          if (e1) throw e1;
          if (Array.isArray(del1) && del1.length > 0) return "ok";

          // fallback to legacy table (if row originated there)
          const { data: del2, error: e2 } = await supabase
            .from("payroll_biweekly")
            .delete()
            .eq("id", r.id)
            .select("id");
          if (e2) throw e2;
          if (!Array.isArray(del2) || del2.length === 0) throw new Error("Row not found");
          return "ok";
        })(),
        { loading: "Deleting…", success: "Row deleted", error: (e) => e.message || "Delete failed" }
      );

      // hard refresh instead of only optimistic remove, so the view recalculates totals/currency
      await doLoad();
    } finally {
      setDeletingRowId(null);
    }
  }

  /* -------- export csv -------- */
  function exportCsv() {
    const hdr = [
      "employee",
      "period_month",
      "period_from",
      "period_to",
      "gross",
      "net",
      "status",
      "public_note",
      "currency_code",
      "fx_rate",
      "hourly_rate",
      "ot_multiplier",
      "vacation_pct",
      "updated_at",
    ];

    const rowsCsv = (rows || []).map((r) => ({
      employee: r.employee_label || r.employee_uid || "",
      period_month: r.period_month || "",
      period_from: r.period_from || r.period_start || "",
      period_to: r.period_to || r.period_end || "",
      gross: r.gross ?? "",
      net: r.net ?? "",
      status: r.status ?? "",
      public_note: r.hr_comment ?? "",
      currency_code: r.currency_code ?? "",
      fx_rate: r.fx_rate ?? "",
      hourly_rate: r.hourly_rate ?? "",
      ot_multiplier: r.ot_multiplier ?? "",
      vacation_pct: r.vacation_pct ?? "",
      updated_at: r.updated_at ?? r.created_at ?? "",
    }));

    const csv = [hdr.join(",")]
      .concat(
        rowsCsv.map((o) => hdr.map((k) => `"${String(o[k] ?? "").replace(/"/g, '""')}"`).join(","))
      )
      .join("\n");

    const name =
      frequency === "monthly"
        ? `payroll_${firstOfMonth(fromMonth)}_${lastOfMonth(toMonth)}.csv`
        : `payroll_${fromDate}_${toDate}.csv`;

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* -------- summary -------- */
  const summary = useMemo(() => {
    const gross = rows.reduce((a, r) => a + Number(r.gross || 0), 0);
    const net = rows.reduce((a, r) => a + Number(r.net || 0), 0);
    const currencySet = new Set(rows.map((r) => r.currency_code || "INR"));
    const currencyDisplay =
      currencySet.size === 1 ? `${[...currencySet][0]} @${rows[0]?.fx_rate ?? "1"}` : "Mixed";
    return { count: rows.length, gross, net, currencyDisplay };
  }, [rows]);

  return (
    <div className="p-0">
      <PrintCSS />
      {/* Branding-only gradient header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold">Payroll Management (Approval)</h2>
          <div className="hidden md:block text-xs">
            {canHR ? (
              <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-white/10">
                HR/Admin access · {me.email || "—"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-white/10">
                Read-only (need HR/Admin) · {me.email || "—"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="w-full px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Card className="p-4">
            {/* filters (moved into body) */}
            <div className="mt-1 border rounded p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs mb-1 text-slate-600">Pay frequency</label>
                  <div className="relative">
                    <Filter className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                    <select
                      className="border rounded p-2 text-sm pl-8"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="biweekly">Biweekly</option>
                    </select>
                  </div>
                </div>

                {frequency === "monthly" ? (
                  <>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">From (month)</label>
                      <div className="relative">
                        <CalendarClock className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <input
                          type="month"
                          className="border rounded p-2 text-sm pl-8"
                          value={fromMonth}
                          onChange={(e) => setFromMonth(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">To (month)</label>
                      <div className="relative">
                        <CalendarClock className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <input
                          type="month"
                          className="border rounded p-2 text-sm pl-8"
                          value={toMonth}
                          onChange={(e) => setToMonth(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">From (date)</label>
                      <div className="relative">
                        <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <input
                          type="date"
                          className="border rounded p-2 text-sm pl-8"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">To (date)</label>
                      <div className="relative">
                        <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <input
                          type="date"
                          className="border rounded p-2 text-sm pl-8"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs mb-1 text-slate-600">Status</label>
                  <div className="relative">
                    <ShieldCheck className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                    <select
                      className="border rounded p-2 text-sm pl-8"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">All</option>
                      {PAYROLL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex-1 min-w-[260px]">
                  <label className="block text-xs mb-1 text-slate-600">Search (name/status/period)</label>
                  <div className="relative">
                    <Search className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                    <Input
                      className="pl-8"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="e.g. [EMP1004] paid 2025-08"
                    />
                  </div>
                </div>

                <div className="ml-auto flex items-end gap-2">
                  <Button variant="outline" onClick={() => doLoad({ applySearch: true })}>
                    <Filter className="h-4 w-4 mr-1" /> Apply filters
                  </Button>
                  <Button variant="outline" onClick={() => doLoad()}>
                    <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                  <Button variant="outline" onClick={exportCsv}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                  <a href="/hr/paystub-editor" className="text-blue-700 underline text-sm ml-2">
                    Go to Paystub Editor
                  </a>
                </div>
              </div>

              {/* summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
                <div className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500">Records</div>
                  <div className="font-semibold">{summary.count}</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500">Gross Total</div>
                  <div className="font-semibold">{toMoney(summary.gross)}</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500">Net Total</div>
                  <div className="font-semibold">{toMoney(summary.net)}</div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500">Currency</div>
                  <div className="font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <BadgeIndianRupee className="h-4 w-4" />
                      {summary.currencyDisplay}
                    </span>
                  </div>
                </div>
                <div className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500">Tip</div>
                  <div className="text-xs">Use “Set defaults” to fill hourly/OT/Vac.</div>
                </div>
              </div>

              {/* legend */}
              <div className="mt-3 text-xs text-amber-700">
                <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-300 mr-2">
                  Amber rows
                </span>
                are missing defaults (rate / OT× / Vac %).
              </div>
            </div>

            {/* table */}
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50 no-print">
                  <tr>
                    <th className="p-2 border text-left">Employee</th>
                    <th className="p-2 border text-left">Period</th>
                    <th className="p-2 border text-left">Gross</th>
                    <th className="p-2 border text-left">Net</th>
                    <th className="p-2 border text-left">Currency</th>
                    <th className="p-2 border text-left">Defaults</th>
                    <th className="p-2 border text-left">Status</th>
                    <th className="p-2 border text-left">Public note</th>
                    <th className="p-2 border text-left w-44">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {booting || loading ? (
                    <>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          <td className="p-2 border" colSpan={9}>
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-3 text-center text-gray-500">
                        No rows.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const period = r.period_type === "monthly"
                        ? `${r.period_month}-01 → ${lastOfMonth(r.period_month || "")}`
                        : `${r.period_from || r.period_start || ""} → ${r.period_to || r.period_end || ""}`;
                      const missingDefaults =
                        !Number(r.hourly_rate) || r.ot_multiplier == null || r.vacation_pct == null;
                      const saving = savingRowId === r.id;
                      const deleting = deletingRowId === r.id;

                      return (
                        <tr key={r.id} className={`align-top ${missingDefaults ? "bg-amber-50" : ""}`}>
                          <td className="p-2 border">{r.employee_label || r.employee_uid}</td>
                          <td className="p-2 border">{period}</td>
                          <td className="p-2 border">{toMoney(r.gross)}</td>
                          <td className="p-2 border">{toMoney(r.net)}</td>
                          <td className="p-2 border">
                            {(r.currency_code || "—")}{r.fx_rate != null ? ` @${r.fx_rate}` : ""}
                          </td>
                          <td className="p-2 border text-xs">
                            {Number(r.hourly_rate) ? `Rate ${toMoney(r.hourly_rate)} · ` : "Rate — · "}
                            {r.ot_multiplier != null ? `OT× ${Number(r.ot_multiplier).toFixed(2)} · ` : "OT× — · "}
                            {r.vacation_pct != null ? `Vac ${Number(r.vacation_pct).toFixed(1)}%` : "Vac —"}
                          </td>
                          <td className="p-2 border">
                            {canHR ? (
                              <select
                                className="border rounded p-1 text-sm"
                                value={r.status || "pending"}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, status: e.target.value } : x))
                                  )
                                }
                              >
                                {PAYROLL_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <StatusBadge value={r.status} />
                            )}
                          </td>
                          <td className="p-2 border">
                            {canHR ? (
                              <textarea
                                className="border rounded p-2 text-sm w-72"
                                rows={2}
                                value={r.hr_comment || ""}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, hr_comment: e.target.value } : x))
                                  )
                                }
                                placeholder="Visible on payslip"
                              />
                            ) : (
                              <span className="text-xs">{r.hr_comment || "—"}</span>
                            )}
                          </td>
                          <td className="p-2 border">
                            {canHR ? (
                              <div className="flex items-center gap-2">
                                <Button disabled={saving} onClick={() => saveRow(r)}>
                                  <Save className="h-4 w-4 mr-1" />
                                  {saving ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  variant="outline"
                                  className="text-rose-700 border-rose-300 hover:bg-rose-50"
                                  disabled={deleting}
                                  onClick={() => deleteRow(r)}
                                  title="Delete row"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  {deleting ? "Deleting…" : "Delete"}
                                </Button>
                                {missingDefaults && (
                                  <a
                                    href={`/hr/paystub-editor?employee=${encodeURIComponent(r.employee_uid)}`}
                                    className="text-xs underline text-amber-700"
                                    title="Set hourly/OT/Vac defaults"
                                  >
                                    Set defaults
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {banner && (
              <div
                className={`mt-3 text-sm rounded border p-2 ${
                  banner.kind === "success"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : banner.kind === "info"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {banner.text}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PayrollManagement;
