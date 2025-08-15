// src/components/submodules/hr/PayrollManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

/* ---------- helpers ---------- */
const VIEW = "payroll_ui_ext"; // joined view with currency + defaults
const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
const toMoney = (n) =>
  (Number(n || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [fromDate, setFromDate] = useState(
    isoDate(new Date(Date.now() - 13 * 86400000))
  );
  const [toDate, setToDate] = useState(isoDate());
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState(null);
  const [savingRow, setSavingRow] = useState(false);
  const inflight = useRef(false);

  /* -------- screen/print helper CSS -------- */
  const PrintCSS = () => (
    <style>{`
      @media print {
        .no-print { display: none !important; }
      }
    `}</style>
  );

  /* -------- boot -------- */
  useEffect(() => {
    (async () => {
      // whoami
      try {
        const { data: meRow } = await supabase.rpc("app_whoami").single();
        const roles = normalizeRoles(meRow?.roles || []);
        setMe({ email: meRow?.email || "", roles, loading: false });
      } catch (_) {
        setMe((s) => ({ ...s, loading: false }));
      }
      // server auth check
      try {
        const { data } = await supabase.rpc("app_has_any_role", {
          role_list: ["HR", "Admin", "Super Admin"],
        });
        setServerCanHR(Boolean(data));
      } catch {
        setServerCanHR(null);
      }
      // initial load
      doLoad();
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
      let q = supabase
        .from(VIEW)
        .select("*")
        .order("period_to", { ascending: false })
        .gte("period_from", from)
        .lte("period_to", to);

      if (statusFilter) q = q.eq("status", statusFilter);

      // server-side search against view's search_text
      const s = (search || "").trim().toLowerCase();
      if (applySearch && s) q = q.ilike("search_text", `%${s}%`);

      const { data, error } = await q;
      if (error) throw error;

      setRows(data || []);
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
    setSavingRow(true);
    setBanner(null);
    try {
      const patch = { status: r.status, notes: r.hr_comment ?? null };
      const { error } = await supabase
        .from("payroll")
        .update(patch)
        .eq("id", r.id);
      if (error) throw error;
      setBanner({ kind: "success", text: "Saved!" });
    } catch (e) {
      setBanner({ kind: "error", text: `Save failed: ${e.message}` });
      // soft refresh on error
      doLoad();
    } finally {
      setSavingRow(false);
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
      period_from: r.period_from || "",
      period_to: r.period_to || "",
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
    const csv =
      [hdr.join(",")].concat(
        rowsCsv.map((o) =>
          hdr
            .map((k) => `"${String(o[k] ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
      ).join("\n");
    const name =
      frequency === "monthly"
        ? `payroll_${firstOfMonth(fromMonth)}_${lastOfMonth(toMonth)}.csv`
        : `payroll_${fromDate}_${toDate}.csv`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
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
      currencySet.size === 1
        ? `${[...currencySet][0]} @${
            rows[0]?.fx_rate != null ? String(rows[0].fx_rate) : "1"
          }`
        : "Mixed";
    return { count: rows.length, gross, net, currencyDisplay };
  }, [rows]);

  return (
    <div className="p-3 space-y-4">
      <PrintCSS />
      <Card className="p-4">
        {/* header */}
        <div className="flex items-center justify-between no-print">
          <h2 className="text-lg font-semibold">Payroll Management (Approval)</h2>
          <div className="flex items-center gap-4">
            <a
              href="/hr/paystub-editor"
              className="text-blue-700 underline text-sm"
            >
              Go to Paystub Editor
            </a>
            <div
              className={`text-xs ${
                canHR ? "text-green-700" : "text-gray-600"
              }`}
              title={me.email || ""}
            >
              {canHR ? "HR/Admin access" : "Read-only (need HR/Admin)"} ·{" "}
              {me.email || "—"}
            </div>
          </div>
        </div>

        {/* filters */}
        <div className="mt-4 border rounded p-3 no-print">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs mb-1">Pay frequency</label>
              <select
                className="border rounded p-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </div>

            {frequency === "monthly" ? (
              <>
                <div>
                  <label className="block text-xs mb-1">From (month)</label>
                  <input
                    type="month"
                    className="border rounded p-1 text-sm"
                    value={fromMonth}
                    onChange={(e) => setFromMonth(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">To (month)</label>
                  <input
                    type="month"
                    className="border rounded p-1 text-sm"
                    value={toMonth}
                    onChange={(e) => setToMonth(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs mb-1">From (date)</label>
                  <input
                    type="date"
                    className="border rounded p-1 text-sm"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">To (date)</label>
                  <input
                    type="date"
                    className="border rounded p-1 text-sm"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs mb-1">Status</label>
              <select
                className="border rounded p-2 text-sm"
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

            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs mb-1">
                Search (name/status/period)
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. [EMP1004] paid 2025-08"
              />
            </div>

            <div className="ml-auto flex items-end gap-2">
              <Button variant="outline" onClick={() => doLoad({ applySearch: true })}>
                Apply filters
              </Button>
              <Button variant="outline" onClick={() => doLoad()}>
                Refresh
              </Button>
              <Button variant="outline" onClick={exportCsv}>
                Export CSV
              </Button>
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
              <div className="font-semibold">{summary.currencyDisplay}</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-xs text-gray-500">Tip</div>
              <div className="text-xs">
                Use the “Set defaults” action to fill hourly/OT/Vac for
                highlighted rows.
              </div>
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
                <th className="p-2 border text-left w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <tr>
                    <td className="p-2 border" colSpan={9}>
                      <div className="h-4 bg-gray-200 animate-pulse rounded" />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border" colSpan={9}>
                      <div className="h-4 bg-gray-200 animate-pulse rounded" />
                    </td>
                  </tr>
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-3 text-center text-gray-500">
                    No rows.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const period = `${r.period_from || ""} → ${r.period_to || ""}`;
                  const missingDefaults =
                    !Number(r.hourly_rate) ||
                    r.ot_multiplier == null ||
                    r.vacation_pct == null;
                  return (
                    <tr
                      key={r.id}
                      className={`align-top ${missingDefaults ? "bg-amber-50" : ""}`}
                    >
                      <td className="p-2 border">
                        {r.employee_label || r.employee_uid}
                      </td>
                      <td className="p-2 border">{period}</td>
                      <td className="p-2 border">{toMoney(r.gross)}</td>
                      <td className="p-2 border">{toMoney(r.net)}</td>
                      <td className="p-2 border">
                        {r.currency_code || "—"}{" "}
                        {r.fx_rate != null ? `@${r.fx_rate}` : ""}
                      </td>
                      <td className="p-2 border text-xs">
                        {Number(r.hourly_rate)
                          ? `Rate ${toMoney(r.hourly_rate)} · `
                          : "Rate — · "}
                        {r.ot_multiplier != null
                          ? `OT× ${Number(r.ot_multiplier).toFixed(2)} · `
                          : "OT× — · "}
                        {r.vacation_pct != null
                          ? `Vac ${Number(r.vacation_pct).toFixed(1)}%`
                          : "Vac —"}
                      </td>
                      <td className="p-2 border">
                        {canHR ? (
                          <select
                            className="border rounded p-1 text-sm"
                            value={r.status || "pending"}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, status: e.target.value } : x
                                )
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
                          <span className="capitalize">{r.status}</span>
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
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, hr_comment: e.target.value } : x
                                )
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
                            <Button
                              disabled={savingRow}
                              onClick={() => saveRow(r)}
                            >
                              {savingRow ? "Saving…" : "Save"}
                            </Button>
                            {missingDefaults && (
                              <a
                                href={`/hr/paystub-editor?employee=${encodeURIComponent(
                                  r.employee_uid
                                )}`}
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
  );
};

export default PayrollManagement;
