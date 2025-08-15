// src/components/submodules/hr/PaystubEditor.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import logo from "../../../assets/logo.png";

/* --------------- helpers --------------- */
const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
const toMoney = (n) =>
  (Number(n || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const parseFloatSafe = (v, def = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};
const firstOfMonth = (ym) => `${ym}-01`;
const monthOf = (dateStr) => (dateStr || "").slice(0, 7);
const lastOfMonth = (ym) => {
  const d = new Date(`${ym}-01T00:00:00`);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return isoDate(end);
};
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

/* --------------- component --------------- */
const PaystubEditor = () => {
  // whoami + server-trusted canHR
  const [me, setMe] = useState({ email: "", roles: [], loading: true });
  const [serverCanHR, setServerCanHR] = useState(null);
  const roleFallbackCanHR = useMemo(() => {
    const r = (me.roles || []).map((x) => String(x).toLowerCase());
    return r.includes("super admin") || r.includes("admin") || r.includes("hr");
  }, [me.roles]);
  const canHR = (serverCanHR ?? roleFallbackCanHR) === true;

  // directory
  const [people, setPeople] = useState([]);
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

  // payroll_rate defaults per employee
  const [defaults, setDefaults] = useState(new Map());
  const getDefaults = (uid) => defaults.get(uid) || null;

  // editor form
  const [form, setForm] = useState({
    employee_uid: "",
    frequency: "biweekly", // biweekly | monthly
    start: isoDate(new Date(Date.now() - 13 * 86400000)),
    end: isoDate(),
    month: monthOf(isoDate()),

    hourly_rate: 0,
    ot_multiplier: 1.5,
    vacation_pct: 0,

    regular_hours: 80,
    overtime_hours: 0,

    allowances: 0,
    deductions: 0,
    note: "",
    status: "pending",

    // currency fields stored on public.payroll
    currency_code: "INR",
    fx_rate: 1,
  });

  // deep-link (?employee=...)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const emp = searchParams.get("employee");
    if (emp && !form.employee_uid) {
      setForm((s) => ({ ...s, employee_uid: emp }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // per-day rows from attendance
  const [days, setDays] = useState([]);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);

  // totals
  const calc = useMemo(() => {
    const rate = parseFloatSafe(form.hourly_rate, 0);
    const regH = parseFloatSafe(form.regular_hours, 0);
    const otH = parseFloatSafe(form.overtime_hours, 0);
    const mult = parseFloatSafe(form.ot_multiplier, 1.5);
    const vac = parseFloatSafe(form.vacation_pct, 0);
    const allow = parseFloatSafe(form.allowances, 0);
    const ded = parseFloatSafe(form.deductions, 0);

    const base = regH * rate;
    const ot = otH * rate * mult;
    const vacPay = (vac / 100) * base;
    const gross = base + ot + vacPay + allow;
    const net = gross - ded;
    return { base, ot, vacPay, gross, net };
  }, [form]);

  // defaults missing?
  const currentDefaults = getDefaults(form.employee_uid);
  const missingDefaults =
    !currentDefaults ||
    currentDefaults.hourly_rate == null ||
    Number(currentDefaults.hourly_rate) <= 0 ||
    currentDefaults.ot_multiplier == null ||
    currentDefaults.vacation_pct == null;

  // pretty period & employee (for print header)
  const periodLabel = useMemo(() => {
    if (form.frequency === "monthly") {
      return `${firstOfMonth(form.month)} → ${lastOfMonth(form.month)}`;
    }
    return `${form.start} → ${form.end}`;
  }, [form.frequency, form.month, form.start, form.end]);
  const employeeLabel = form.employee_uid
    ? nameById.get(form.employee_uid) || form.employee_uid
    : "—";

  /* ------------ boot: whoami + canHR + directory + defaults ------------ */
  useEffect(() => {
    (async () => {
      try {
        const { data: meRow } = await supabase.rpc("app_whoami").single();
        const roles = normalizeRoles(meRow?.roles || []);
        setMe({ email: meRow?.email || "", roles, loading: false });
      } catch (_) {
        setMe((s) => ({ ...s, loading: false }));
      }

      try {
        const { data } = await supabase.rpc("app_has_any_role", {
          role_list: ["HR", "Admin", "Super Admin"],
        });
        setServerCanHR(Boolean(data));
      } catch (_) {
        setServerCanHR(null);
      }

      // directory
      for (const src of [
        "vw_user_management_ext",
        "vw_user_management",
        "user_management",
      ]) {
        try {
          const { data } = await supabase
            .from(src)
            .select("id, employee_id, first_name, last_name, email")
            .order("employee_id", { ascending: true });
          if (data?.length) {
            setPeople(data);
            break;
          }
        } catch (_) {}
      }

      // defaults table
      try {
        const { data } = await supabase
          .from("payroll_rate")
          .select("employee_uid, hourly_rate, ot_multiplier, vacation_pct");
        if (data?.length) {
          const m = new Map();
          for (const r of data) {
            m.set(r.employee_uid, {
              hourly_rate: Number(r.hourly_rate ?? 0),
              ot_multiplier: Number(r.ot_multiplier ?? 1.5),
              vacation_pct: Number(r.vacation_pct ?? 0),
            });
          }
          setDefaults(m);
        }
      } catch (_) {}
    })();
  }, []);

  // when employee changes, auto-fill from saved defaults
  useEffect(() => {
    if (!form.employee_uid) return;
    const d = getDefaults(form.employee_uid);
    if (!d) return;
    setForm((s) => ({
      ...s,
      hourly_rate: d.hourly_rate ?? s.hourly_rate,
      ot_multiplier: d.ot_multiplier ?? s.ot_multiplier,
      vacation_pct: d.vacation_pct ?? s.vacation_pct,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.employee_uid, defaults]);

  /* ------------ actions ------------ */
  async function saveDefaultsForEmployee() {
    if (!canHR) return setBanner({ kind: "error", text: "Not authorized" });
    if (!form.employee_uid)
      return setBanner({ kind: "error", text: "Select an employee first" });
    setBusy(true);
    setBanner(null);
    try {
      const next = {
        hourly_rate: parseFloatSafe(form.hourly_rate, 0),
        ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
        vacation_pct: parseFloatSafe(form.vacation_pct, 0),
      };
      const { error } = await supabase
        .from("payroll_rate")
        .upsert([{ employee_uid: form.employee_uid, ...next }], {
          onConflict: "employee_uid",
        });
      if (error) throw error;
      setDefaults((m) => new Map(m.set(form.employee_uid, next)));
      setBanner({
        kind: "success",
        text: "Saved defaults (rate, OT ×, Vacation %).",
      });
    } catch (e) {
      setBanner({ kind: "error", text: `Save defaults failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  function useSavedDefaults() {
    if (!form.employee_uid)
      return setBanner({
        kind: "error",
        text: "Select an employee first",
      });
    const d = getDefaults(form.employee_uid);
    if (!d)
      return setBanner({
        kind: "error",
        text: "No saved defaults for this employee.",
      });
    setForm((s) => ({
      ...s,
      hourly_rate: d.hourly_rate ?? s.hourly_rate,
      ot_multiplier: d.ot_multiplier ?? s.ot_multiplier,
      vacation_pct: d.vacation_pct ?? s.vacation_pct,
    }));
    setBanner({ kind: "info", text: "Loaded saved defaults into the form." });
  }

  async function prefillFromAttendance() {
    if (!canHR) return setBanner({ kind: "error", text: "Not authorized" });
    if (!form.employee_uid)
      return setBanner({ kind: "error", text: "Select an employee" });

    const isMonthly = form.frequency === "monthly";
    const p_start = isMonthly ? firstOfMonth(form.month) : form.start;
    const p_end = isMonthly ? lastOfMonth(form.month) : form.end;

    setBusy(true);
    setBanner({ kind: "info", text: "Prefilling from attendance…" });
    try {
      const { data, error } = await supabase.rpc(
        "app_paystub_from_attendance",
        {
          p_employee_uid: form.employee_uid,
          p_start,
          p_end,
          p_hourly_rate: parseFloatSafe(form.hourly_rate, 0),
          p_ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
          p_vacation_pct: parseFloatSafe(form.vacation_pct, 0),
        }
      );
      if (error) throw error;

      if (data && typeof data === "object") {
        const next = { ...form };
        if (data.regular_hours != null) next.regular_hours = data.regular_hours;
        if (data.overtime_hours != null)
          next.overtime_hours = data.overtime_hours;
        if (data.recommended_allowances != null)
          next.allowances = data.recommended_allowances;
        if (data.recommended_deductions != null)
          next.deductions = data.recommended_deductions;
        if (data.hourly_rate != null) next.hourly_rate = data.hourly_rate;
        if (data.ot_multiplier != null)
          next.ot_multiplier = data.ot_multiplier;
        if (data.vacation_pct != null) next.vacation_pct = data.vacation_pct;
        setForm(next);
      }

      try {
        const { data: rows, error: e2 } = await supabase.rpc("app_paystub_days", {
          p_employee_uid: form.employee_uid,
          p_start,
          p_end,
        });
        if (!e2 && Array.isArray(rows)) setDays(rows);
      } catch (_) {}

      setBanner({ kind: "success", text: "Attendance prefill complete." });
    } catch (e) {
      setBanner({ kind: "error", text: `Prefill failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function saveToPayroll() {
    if (!canHR) return setBanner({ kind: "error", text: "Not authorized" });
    if (!form.employee_uid)
      return setBanner({ kind: "error", text: "Select an employee" });

    const isMonthly = form.frequency === "monthly";
    const p_start = isMonthly ? firstOfMonth(form.month) : form.start;
    const p_end = isMonthly ? lastOfMonth(form.month) : form.end;

    const currency_code = String(form.currency_code || "INR").toUpperCase();
    const fx_rate = parseFloatSafe(form.fx_rate, 1);

    setBusy(true);
    setBanner({ kind: "info", text: "Saving paystub…" });
    try {
      let saved = false;
      let newId = null;

      // Try RPC with currency params first (if supported)
      try {
        const { data, error } = await supabase.rpc(
          "hr_create_paystub_from_attendance",
          {
            p_employee_uid: form.employee_uid,
            p_start,
            p_end,
            p_hourly_rate: parseFloatSafe(form.hourly_rate, 0),
            p_ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
            p_vacation_pct: parseFloatSafe(form.vacation_pct, 0),
            p_status: form.status,
            p_note: form.note || null,
            p_currency_code: currency_code,
            p_fx_rate: fx_rate,
          }
        );
        if (error) throw error;
        newId =
          (typeof data === "string" && data) ||
          data?.id ||
          (Array.isArray(data) ? data[0]?.id : null) ||
          null;
        if (newId) saved = true;
      } catch (_) {
        // Try RPC without currency params
        try {
          const { data, error } = await supabase.rpc(
            "hr_create_paystub_from_attendance",
            {
              p_employee_uid: form.employee_uid,
              p_start,
              p_end,
              p_hourly_rate: parseFloatSafe(form.hourly_rate, 0),
              p_ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
              p_vacation_pct: parseFloatSafe(form.vacation_pct, 0),
              p_status: form.status,
              p_note: form.note || null,
            }
          );
          if (error) throw error;
          newId =
            (typeof data === "string" && data) ||
            data?.id ||
            (Array.isArray(data) ? data[0]?.id : null) ||
            null;
          if (newId) {
            await supabase
              .from("payroll")
              .update({ currency_code, fx_rate })
              .eq("id", newId);
            saved = true;
          }
        } catch {
          // fall through to simple upsert
        }
      }

      if (!saved) {
        const month = isMonthly ? form.month : monthOf(p_start);
        const base_salary = calc.base;
        const allowances = calc.ot + calc.vacPay + parseFloatSafe(form.allowances, 0);
        const deductions = parseFloatSafe(form.deductions, 0);

        const { error: upErr } = await supabase.from("payroll").upsert(
          [
            {
              employee_uid: form.employee_uid,
              month,
              basic_salary: base_salary,
              allowances,
              deductions,
              status: form.status,
              notes:
                (isMonthly
                  ? `Monthly ${month}`
                  : `Biweekly ${p_start} → ${p_end}`) +
                (form.note ? ` · ${form.note}` : ""),
              currency_code,
              fx_rate,
            },
          ],
          { onConflict: "employee_uid,month" }
        );
        if (upErr) throw upErr;
      }

      setBanner({ kind: "success", text: "Saved! Paystub written to payroll." });
    } catch (e) {
      setBanner({ kind: "error", text: `Save failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  function exportDaysCsv() {
    if (!days?.length) return;
    const hdr = ["date", "regular_hours", "overtime_hours", "note"];
    const rows = days.map((d) => ({
      date: d.work_date || d.date || "",
      regular_hours: (Number(d.regular_minutes || 0) / 60).toFixed(2),
      overtime_hours: (Number(d.overtime_minutes || 0) / 60).toFixed(2),
      note: d.note || "",
    }));
    const csv = [hdr.join(",")].concat(
      rows.map((o) =>
        hdr.map((k) => `"${String(o[k] ?? "").replace(/"/g, '""')}"`).join(",")
      )
    ).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `paystub_days_${form.employee_uid}_${
      form.frequency === "monthly" ? form.month : `${form.start}_${form.end}`
    }.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ------------ render ------------ */
  return (
    <div className="p-3 space-y-4">
      {/* A4 print CSS */}
      <style>{`
        @media screen {
          .print-sheet { max-width: 210mm; margin-left:auto; margin-right:auto; }
        }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body, html { -webkit-print-color-adjust: exact; print-color-adjust: exact; background:#fff!important; }
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { margin: 0 auto; width: 100%; }
          .print-area .p-4 { padding: 10px !important; }
          .print-area .grid { gap: 6px !important; }
          .print-area table, .print-area tr, .print-area td, .print-area th { page-break-inside: avoid; break-inside: avoid; }
          .print-header h1 { font-size: 16px !important; }
          .brand-logo { height: 22px !important; }
        }
      `}</style>

      {/* Header (screen only) */}
      <div className="flex items-center justify-between no-print">
        <h2 className="text-lg font-semibold">Paystub Editor</h2>
        <div className={`text-xs ${canHR ? "text-green-700" : "text-gray-600"}`}>
          {canHR ? "HR/Admin access" : "Read-only (need HR/Admin)"} · {me.email || "—"}
        </div>
      </div>

      {/* Defaults badge / warning (screen only) */}
      <div className="text-xs no-print">
        {form.employee_uid ? (
          missingDefaults ? (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800">
              No complete defaults saved for this employee.
              <Button size="sm" variant="outline" onClick={useSavedDefaults}>Use saved defaults</Button>
              <Button size="sm" onClick={saveDefaultsForEmployee}>Save current as defaults</Button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-3 px-2 py-1 rounded bg-green-50 border border-green-300 text-green-800">
              Defaults: rate {toMoney(currentDefaults.hourly_rate)} · OT × {Number(currentDefaults.ot_multiplier).toFixed(2)} · Vac {Number(currentDefaults.vacation_pct).toFixed(1)}%
              <Button size="sm" variant="outline" onClick={useSavedDefaults}>Use saved defaults</Button>
            </div>
          )
        ) : (
          <span className="text-gray-500">Select an employee to see defaults.</span>
        )}
      </div>

      {/* Content: two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: setup & actions (screen only) */}
        <Card className="p-4 space-y-3 lg:col-span-1 no-print">
          <div className="text-sm font-semibold">Setup</div>

          <div>
            <label className="block text-xs mb-1">Employee</label>
            <select
              className="border rounded p-2 w-full"
              value={form.employee_uid}
              onChange={(e) =>
                setForm((s) => ({ ...s, employee_uid: e.target.value }))
              }
            >
              <option value="">Select employee…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameById.get(p.id) || p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">Frequency</label>
              <select
                className="border rounded p-2 w-full"
                value={form.frequency}
                onChange={(e) =>
                  setForm((s) => ({ ...s, frequency: e.target.value }))
                }
              >
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {form.frequency === "monthly" ? (
              <div>
                <label className="block text-xs mb-1">Month</label>
                <input
                  type="month"
                  className="border rounded p-2 w-full"
                  value={form.month}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, month: e.target.value }))
                  }
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs mb-1">Start</label>
                  <input
                    type="date"
                    className="border rounded p-2 w-full"
                    value={form.start}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, start: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1">End</label>
                  <input
                    type="date"
                    className="border rounded p-2 w-full"
                    value={form.end}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, end: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">Currency</label>
              <select
                className="border rounded p-2 w-full"
                value={form.currency_code}
                onChange={(e) =>
                  setForm((s) => ({ ...s, currency_code: e.target.value }))
                }
              >
                {["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">FX rate</label>
              <Input
                type="number"
                step="0.000001"
                value={form.fx_rate}
                onChange={(e) =>
                  setForm((s) => ({ ...s, fx_rate: e.target.value }))
                }
              />
            </div>
            <div className="flex items-end">
              <div className="text-xs text-gray-600">
                Stored with the paystub (shown in Approval grid).
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div
              className={`${
                missingDefaults &&
                (!currentDefaults || Number(currentDefaults.hourly_rate) <= 0)
                  ? "ring-2 ring-rose-400 rounded"
                  : ""
              }`}
            >
              <label className="block text-xs mb-1">Hourly rate</label>
              <Input
                type="number"
                step="0.01"
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm((s) => ({ ...s, hourly_rate: e.target.value }))
                }
              />
            </div>
            <div
              className={`${
                missingDefaults && (!currentDefaults || currentDefaults.ot_multiplier == null)
                  ? "ring-2 ring-rose-400 rounded"
                  : ""
              }`}
            >
              <label className="block text-xs mb-1">OT multiplier</label>
              <Input
                type="number"
                step="0.1"
                value={form.ot_multiplier}
                onChange={(e) =>
                  setForm((s) => ({ ...s, ot_multiplier: e.target.value }))
                }
              />
            </div>
            <div
              className={`${
                missingDefaults && (!currentDefaults || currentDefaults.vacation_pct == null)
                  ? "ring-2 ring-rose-400 rounded"
                  : ""
              }`}
            >
              <label className="block text-xs mb-1">Vacation %</label>
              <Input
                type="number"
                step="0.1"
                value={form.vacation_pct}
                onChange={(e) =>
                  setForm((s) => ({ ...s, vacation_pct: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              onClick={useSavedDefaults}
              disabled={!form.employee_uid}
            >
              Use saved defaults
            </Button>
            <Button
              className="flex-1"
              onClick={saveDefaultsForEmployee}
              disabled={!canHR || !form.employee_uid || busy}
            >
              Save defaults
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">Regular hours</label>
              <Input
                type="number"
                step="0.01"
                value={form.regular_hours}
                onChange={(e) =>
                  setForm((s) => ({ ...s, regular_hours: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs mb-1">OT hours</label>
              <Input
                type="number"
                step="0.01"
                value={form.overtime_hours}
                onChange={(e) =>
                  setForm((s) => ({ ...s, overtime_hours: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">Allowances</label>
              <Input
                type="number"
                step="0.01"
                value={form.allowances}
                onChange={(e) =>
                  setForm((s) => ({ ...s, allowances: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Deductions</label>
              <Input
                type="number"
                step="0.01"
                value={form.deductions}
                onChange={(e) =>
                  setForm((s) => ({ ...s, deductions: e.target.value }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={prefillFromAttendance}
                disabled={!canHR || !form.employee_uid || busy}
              >
                Prefill from attendance
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1">Note (prints on stub)</label>
              <Input
                type="text"
                value={form.note}
                onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Status</label>
              <select
                className="border rounded p-2 w-full"
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
              >
                <option value="pending">pending</option>
                <option value="paid">paid</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => window.print()}>
              Print / PDF
            </Button>
            <Button onClick={saveToPayroll} disabled={!canHR || busy}>
              Save to payroll
            </Button>
          </div>

          {banner && (
            <div
              className={`text-sm rounded border p-2 ${
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

        {/* RIGHT: preview that prints */}
        <div className="lg:col-span-2 space-y-4">
          <Card className={`p-4 print-area print-sheet ${missingDefaults ? "bg-amber-50 border-amber-300" : ""}`}>
            {/* PRINT HEADER with logo + meta */}
            <div className="flex items-center justify-between print-header mb-2">
              <div className="flex items-center gap-3">
                <img src={logo} alt="DigitizerX" className="brand-logo h-6 w-auto" />
                <h1 className="font-semibold text-base">DigitizerX · Paystub</h1>
              </div>
              <div className="text-right text-xs leading-5">
                <div><strong>Employee:</strong> {employeeLabel}</div>
                <div><strong>Period:</strong> {periodLabel}</div>
                <div><strong>Currency:</strong> {String(form.currency_code || "INR").toUpperCase()} @{form.fx_rate}</div>
              </div>
            </div>

            {/* totals */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">Base (hourly)</div>
                <div className="font-semibold">{toMoney(calc.base)}</div>
              </div>
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">OT pay</div>
                <div className="font-semibold">{toMoney(calc.ot)}</div>
              </div>
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">Vacation</div>
                <div className="font-semibold">{toMoney(calc.vacPay)}</div>
              </div>
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">Gross</div>
                <div className="font-semibold">{toMoney(calc.gross)}</div>
              </div>
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">Net</div>
                <div className="font-semibold">{toMoney(calc.net)}</div>
              </div>
              <div className="border rounded p-2 text-center">
                <div className="text-xs text-gray-500">Currency</div>
                <div className="font-semibold">
                  {String(form.currency_code || "INR").toUpperCase()} @{form.fx_rate}
                </div>
              </div>
            </div>

            {/* breakdown table */}
            <div className="mt-3 border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border text-left">Hours</th>
                    <th className="p-2 border text-left">Calc. Rate</th>
                    <th className="p-2 border text-left">Description</th>
                    <th className="p-2 border text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border">{form.regular_hours}</td>
                    <td className="p-2 border">{toMoney(form.hourly_rate)}</td>
                    <td className="p-2 border">Base Hourly</td>
                    <td className="p-2 border text-right">{toMoney(calc.base)}</td>
                  </tr>
                  <tr>
                    <td className="p-2 border">{form.overtime_hours}</td>
                    <td className="p-2 border">
                      {toMoney(form.hourly_rate * form.ot_multiplier)}
                    </td>
                    <td className="p-2 border">Overtime ({form.ot_multiplier}x)</td>
                    <td className="p-2 border text-right">{toMoney(calc.ot)}</td>
                  </tr>
                  {Number(form.vacation_pct || 0) > 0 && (
                    <tr>
                      <td className="p-2 border">—</td>
                      <td className="p-2 border">{form.vacation_pct}%</td>
                      <td className="p-2 border">Vacation Pay</td>
                      <td className="p-2 border text-right">{toMoney(calc.vacPay)}</td>
                    </tr>
                  )}
                  {Number(form.allowances || 0) !== 0 && (
                    <tr>
                      <td className="p-2 border">—</td>
                      <td className="p-2 border">—</td>
                      <td className="p-2 border">Other Allowances</td>
                      <td className="p-2 border text-right">{toMoney(form.allowances)}</td>
                    </tr>
                  )}
                  {Number(form.deductions || 0) !== 0 && (
                    <tr>
                      <td className="p-2 border">—</td>
                      <td className="p-2 border">—</td>
                      <td className="p-2 border">Deductions</td>
                      <td className="p-2 border text-right">-{toMoney(form.deductions)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="p-2 border" colSpan={3}>
                      <div className="text-right font-medium">Net Pay</div>
                    </td>
                    <td className="p-2 border text-right font-semibold">
                      {toMoney(calc.net)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Per-day breakdown (screen only) */}
          <Card className="p-4 no-print">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Per-day breakdown</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={prefillFromAttendance}
                  disabled={!form.employee_uid}
                >
                  Refresh from attendance
                </Button>
                <Button
                  variant="outline"
                  onClick={exportDaysCsv}
                  disabled={!days?.length}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border text-left">Date</th>
                    <th className="p-2 border text-left">Regular (h)</th>
                    <th className="p-2 border text-left">Overtime (h)</th>
                    <th className="p-2 border text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {!days?.length ? (
                    <tr>
                      <td className="p-2 border text-center text-gray-500" colSpan={4}>
                        No daily rows (run “Prefill from attendance”).
                      </td>
                    </tr>
                  ) : (
                    days.map((d, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border">{d.work_date || d.date || ""}</td>
                        <td className="p-2 border">
                          {(Number(d.regular_minutes || 0) / 60).toFixed(2)}
                        </td>
                        <td className="p-2 border">
                          {(Number(d.overtime_minutes || 0) / 60).toFixed(2)}
                        </td>
                        <td className="p-2 border">{d.note || ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PaystubEditor;
