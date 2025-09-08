// src/components/submodules/hr/PaystubEditor.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from "../../ui/button";   // default export
import Input from "../../ui/Input";     // default export
import { Skeleton } from "../../ui/skeleton";
import toast from "react-hot-toast";
import logo from "../../../assets/logo.png";

import {
  UserCircle2,
  Calendar,
  CalendarClock,
  BadgeIndianRupee,
  Wallet,
  Percent,
  Timer,
  FolderSync,
  FileCheck2,
  Printer,
  Save
} from "lucide-react";

/* ---------------- helpers ---------------- */
const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const toMoney = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      <FileCheck2 className="h-3.5 w-3.5" />
      {v}
    </span>
  );
};

/* ---------------- component ---------------- */
const PaystubEditor = () => {
  // whoami + server-trusted canHR
  const [me, setMe] = useState({ email: "", roles: [], loading: true });
  const [serverCanHR, setServerCanHR] = useState(null);
  const roleFallbackCanHR = useMemo(() => {
    const r = (me.roles || []).map((x) => String(x).toLowerCase());
    return r.includes("super admin") || r.includes("admin") || r.includes("hr");
  }, [me.roles]);
  const canHR = (serverCanHR ?? roleFallbackCanHR) === true;

  // boot state
  const [booting, setBooting] = useState(true);

  // directory
  const [people, setPeople] = useState([]);
  const nameById = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      m.set(
        p.id,
        `${p.employee_id ? `[${p.employee_id}] ` : ""}${p.first_name || ""} ${p.last_name || ""}`.trim()
      );
    }
    return m;
  }, [people]);

  // payroll_rate defaults
  const [defaults, setDefaults] = useState(new Map());
  const getDefaults = (uid) => defaults.get(uid) || null;

  // editor form
  const [form, setForm] = useState({
    employee_uid: "",
    frequency: "biweekly",
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
    currency_code: "INR",
    fx_rate: 1,
  });

  // deep-link
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const emp = searchParams.get("employee");
    if (emp && !form.employee_uid) {
      setForm((s) => ({ ...s, employee_uid: emp }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // per-day
  const [days, setDays] = useState([]);
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

  // pretty labels
  const periodLabel = useMemo(() => {
    if (form.frequency === "monthly") {
      return `${firstOfMonth(form.month)} → ${lastOfMonth(form.month)}`;
    }
    return `${form.start} → ${form.end}`;
  }, [form.frequency, form.month, form.start, form.end]);
  const employeeLabel = form.employee_uid ? nameById.get(form.employee_uid) || form.employee_uid : "—";

  /* ------------ boot: whoami + canHR + directory + defaults ------------ */
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
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
          try {
            const { data } = await supabase
              .from("vw_user_management_ext")
              .select("email, role")
              .eq("email", authEmail)
              .maybeSingle();
            if (data) roles = normalizeRoles(data.role);
          } catch (_) {}
          if ((roles || []).length === 0) {
            try {
              const { data } = await supabase
                .from("vw_user_management")
                .select("email, role")
                .eq("email", authEmail)
                .maybeSingle();
              if (data) roles = normalizeRoles(data.role);
            } catch (_) {}
          }
          if ((roles || []).length === 0) {
            try {
              const { data } = await supabase
                .from("user_management")
                .select("email, role")
                .eq("email", authEmail)
                .maybeSingle();
              if (data) roles = normalizeRoles(data.role);
            } catch (_) {}
          }
          who = { email: authEmail, roles };
        }

        setMe({ email: who?.email || authEmail || "", roles: roles || [], loading: false });

        try {
          const { data } = await supabase.rpc("app_has_any_role", {
            role_list: ["HR", "Admin", "Super Admin"],
          });
          setServerCanHR(Boolean(data));
        } catch {
          setServerCanHR(null);
        }

        // directory
        try {
          const { data, error } = await supabase
            .from("vw_user_management_ext")
            .select("id, employee_id, first_name, last_name, email")
            .order("employee_id", { ascending: true });
          if (!error && Array.isArray(data) && data.length) {
            setPeople(data);
          } else {
            for (const src of ["vw_user_management", "user_management"]) {
              try {
                const { data: d2, error: e2 } = await supabase
                  .from(src)
                  .select("id, employee_id, first_name, last_name, email")
                  .order("employee_id", { ascending: true });
                if (!e2 && Array.isArray(d2) && d2.length) {
                  setPeople(d2);
                  break;
                }
              } catch {}
            }
          }
        } catch (err) {
          console.error("Employee directory load failed:", err?.message || err);
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
        } catch {}
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // auto-fill defaults when employee changes
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
    if (!canHR) return toast.error("Not authorized");
    if (!form.employee_uid) return toast.error("Select an employee first");

    const next = {
      hourly_rate: parseFloatSafe(form.hourly_rate, 0),
      ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
      vacation_pct: parseFloatSafe(form.vacation_pct, 0),
    };
    setBusy(true);
    try {
      await toast.promise(
        supabase
          .from("payroll_rate")
          .upsert([{ employee_uid: form.employee_uid, ...next }], { onConflict: "employee_uid" }),
        { loading: "Saving defaults…", success: "Defaults saved", error: (e) => e.message || "Save failed" }
      );
      setDefaults((m) => new Map(m.set(form.employee_uid, next)));
    } finally {
      setBusy(false);
    }
  }

  async function prefillFromAttendance() {
    if (!canHR) return toast.error("Not authorized");
    if (!form.employee_uid) return toast.error("Select an employee");

    const isMonthly = form.frequency === "monthly";
    const p_start = isMonthly ? firstOfMonth(form.month) : form.start;
    const p_end = isMonthly ? lastOfMonth(form.month) : form.end;

    setBusy(true);
    try {
      await toast.promise(
        (async () => {
          const { data, error } = await supabase.rpc("app_paystub_from_attendance", {
            p_employee_uid: form.employee_uid,
            p_start,
            p_end,
            p_hourly_rate: parseFloatSafe(form.hourly_rate, 0),
            p_ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
            p_vacation_pct: parseFloatSafe(form.vacation_pct, 0),
          });
          if (error) throw error;

          if (data && typeof data === "object") {
            const next = { ...form };
            if (data.regular_hours != null) next.regular_hours = data.regular_hours;
            if (data.overtime_hours != null) next.overtime_hours = data.overtime_hours;
            if (data.recommended_allowances != null) next.allowances = data.recommended_allowances;
            if (data.recommended_deductions != null) next.deductions = data.recommended_deductions;
            if (data.hourly_rate != null) next.hourly_rate = data.hourly_rate;
            if (data.ot_multiplier != null) next.ot_multiplier = data.ot_multiplier;
            if (data.vacation_pct != null) next.vacation_pct = data.vacation_pct;
            setForm(next);
          }

          try {
            const { data: rows, error: e2 } = await supabase.rpc("app_paystub_days", {
              p_employee_uid: form.employee_uid,
              p_start,
              p_end,
            });
            if (e2) throw e2;
            if (Array.isArray(rows)) setDays(rows);
          } catch (e) {
            console.warn("app_paystub_days not available", e?.message);
          }
        })(),
        { loading: "Prefilling from attendance…", success: "Prefill complete", error: "Prefill failed" }
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveToPayroll() {
    if (!canHR) return toast.error("Not authorized");
    if (!form.employee_uid) return toast.error("Select an employee");

    const currency_code = String(form.currency_code || "INR").toUpperCase();
    const fx_rate = parseFloatSafe(form.fx_rate, 1);

    setBusy(true);
    try {
      await toast.promise(
        (async () => {
          let saved = false;

          // Try RPC first (if present in DB)
          try {
            const { data, error } = await supabase.rpc("hr_create_paystub_from_attendance", {
              p_employee_uid: form.employee_uid,
              p_start:
                form.frequency === "monthly" ? firstOfMonth(form.month) : form.start,
              p_end:
                form.frequency === "monthly" ? lastOfMonth(form.month) : form.end,
              p_hourly_rate: parseFloatSafe(form.hourly_rate, 0),
              p_ot_multiplier: parseFloatSafe(form.ot_multiplier, 1.5),
              p_vacation_pct: parseFloatSafe(form.vacation_pct, 0),
              p_status: form.status,
              p_note: form.note || null,
              p_currency_code: currency_code,
              p_fx_rate: fx_rate,
            });
            if (error) throw error;
            const newId =
              (typeof data === "string" && data) ||
              data?.id ||
              (Array.isArray(data) ? data[0]?.id : null);
            if (newId) saved = true;
          } catch (_) {}

          // --------- compute basics (ALIGNED UPDATE) ----------
          const isMonthly = form.frequency === "monthly";
          const p_start = isMonthly ? firstOfMonth(form.month) : form.start;
          const p_end = isMonthly ? lastOfMonth(form.month) : form.end;

          const month = isMonthly ? form.month : monthOf(p_start);
          const base_salary = calc.base;
          const allowances = calc.ot + calc.vacPay + parseFloatSafe(form.allowances, 0);
          const deductions = parseFloatSafe(form.deductions, 0);

          /**
           * If the RPC didn’t save, do a plain upsert into the real table.
           * NOTE: monthly table is "payroll" with columns: month, basic_salary, allowances, deductions, status, notes, currency_code, fx_rate
           */
          if (!saved) {
            const payload = [
              {
                employee_uid: form.employee_uid,
                month, // <-- real column (unique with employee_uid)
                basic_salary: base_salary,
                allowances,
                deductions,
                status: form.status,
                notes:
                  (isMonthly ? `Monthly ${month}` : `Biweekly ${p_start} → ${p_end}`) +
                  (form.note ? ` · ${form.note}` : ""),
                currency_code,
                fx_rate,
              },
            ];

            const { error: upErr } = await supabase
              .from("payroll")
              .upsert(payload, { onConflict: "employee_uid,month" }); // ✅ correct unique key
            if (upErr) throw upErr;
          }

          /**
           * Regardless of which branch saved, enforce currency on the saved month.
           * (Covers the case where your RPC ignores currency.)
           */
          await supabase
            .from("payroll")
            .update({ currency_code, fx_rate })
            .eq("employee_uid", form.employee_uid)
            .eq("month", month);
        })(),
        { loading: "Saving paystub…", success: "Saved to payroll", error: "Save failed" }
      );
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
    const csv = [hdr.join(",")]
      .concat(rows.map((o) => hdr.map((k) => `"${String(o[k] ?? "").replace(/"/g, '""')}"`).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paystub_days_${form.employee_uid}_${form.frequency === "monthly" ? form.month : `${form.start}_${form.end}`}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------- render ---------------- */
  return (
    <div className="p-0">
      {/* Branding header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold">Paystub Editor</h2>
          <div className="hidden md:block">
            <StatusBadge value={form.status} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="w-full px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Access line */}
          <div className="text-xs text-gray-600">
            {canHR ? (
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                HR/Admin access · {me.email || "—"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
                Read-only (need HR/Admin) · {me.email || "—"}
              </span>
            )}
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT */}
            <Card className="p-4 space-y-3 lg:col-span-1 overflow-hidden">
              <div className="text-sm font-semibold text-blue-700">Setup</div>

              {booting ? (
                <div className="space-y-3">
                  <Skeleton className="h-9 w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Employee */}
                  <div>
                    <label className="block text-xs mb-1 text-slate-600">Employee</label>
                    <div className="relative">
                      <UserCircle2 className="h-4 w-4 text-blue-600 absolute left-2 top-3 pointer-events-none" />
                      <select
                        className="border rounded p-2 w-full pl-8"
                        value={form.employee_uid}
                        onChange={(e) => setForm((s) => ({ ...s, employee_uid: e.target.value }))}
                      >
                        <option value="">Select employee…</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {nameById.get(p.id) || p.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Frequency + Dates/Month */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Frequency</label>
                      <div className="relative">
                        <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <select
                          className="border rounded p-2 w-full pl-8"
                          value={form.frequency}
                          onChange={(e) => setForm((s) => ({ ...s, frequency: e.target.value }))}
                        >
                          <option value="biweekly">Biweekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                    </div>

                    {form.frequency === "monthly" ? (
                      <div>
                        <label className="block text-xs mb-1 text-slate-600">Month</label>
                        <div className="relative">
                          <CalendarClock className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                          <input
                            type="month"
                            className="border rounded p-2 w-full pl-8"
                            value={form.month}
                            onChange={(e) => setForm((s) => ({ ...s, month: e.target.value }))}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs mb-1 text-slate-600">Start</label>
                          <div className="relative">
                            <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                            <input
                              type="date"
                              className="border rounded p-2 w-full pl-8"
                              value={form.start}
                              onChange={(e) => setForm((s) => ({ ...s, start: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1 text-slate-600">End</label>
                          <div className="relative">
                            <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                            <input
                              type="date"
                              className="border rounded p-2 w-full pl-8"
                              value={form.end}
                              onChange={(e) => setForm((s) => ({ ...s, end: e.target.value }))}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Currency */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Currency</label>
                      <div className="relative">
                        <BadgeIndianRupee className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <select
                          className="border rounded p-2 w-full pl-8"
                          value={form.currency_code}
                          onChange={(e) => setForm((s) => ({ ...s, currency_code: e.target.value }))}
                        >
                          {["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">FX rate</label>
                      <div className="relative">
                        <Wallet className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <Input
                          type="number"
                          step="0.000001"
                          inputMode="decimal"
                          className="pl-8"
                          placeholder="1"
                          value={form.fx_rate}
                          onChange={(e) => setForm((s) => ({ ...s, fx_rate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex items-end text-[11px] text-gray-600 min-w-0" />
                  </div>
                  <p className="text-[11px] text-gray-600 -mt-2">
                    Stored with the paystub (shown in Approval grid).
                  </p>

                  {/* Rates */}
                  <div className="grid grid-cols-3 gap-3">
                    <div
                      className={
                        missingDefaults && (!currentDefaults || Number(currentDefaults.hourly_rate) <= 0)
                          ? "ring-2 ring-rose-400 rounded"
                          : ""
                      }
                    >
                      <label className="block text-xs mb-1 text-slate-600">Hourly rate</label>
                      <div className="relative">
                        <BadgeIndianRupee className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          className="pl-8"
                          placeholder="0"
                          value={form.hourly_rate}
                          onChange={(e) => setForm((s) => ({ ...s, hourly_rate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div
                      className={
                        missingDefaults && (!currentDefaults || currentDefaults.ot_multiplier == null)
                          ? "ring-2 ring-rose-400 rounded"
                          : ""
                      }
                    >
                      <label className="block text-xs mb-1 text-slate-600">OT multiplier</label>
                      <div className="relative">
                        <Timer className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <Input
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          className="pl-8"
                          placeholder="1.5"
                          value={form.ot_multiplier}
                          onChange={(e) => setForm((s) => ({ ...s, ot_multiplier: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div
                      className={
                        missingDefaults && (!currentDefaults || currentDefaults.vacation_pct == null)
                          ? "ring-2 ring-rose-400 rounded"
                          : ""
                      }
                    >
                      <label className="block text-xs mb-1 text-slate-600">Vacation %</label>
                      <div className="relative">
                        <Percent className="h-4 w-4 text-blue-600 absolute left-2 top-3" />
                        <Input
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          className="pl-8"
                          placeholder="0"
                          value={form.vacation_pct}
                          onChange={(e) => setForm((s) => ({ ...s, vacation_pct: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => {
                        if (!form.employee_uid) return toast.error("Select an employee first");
                        const d = getDefaults(form.employee_uid);
                        if (!d) return toast.error("No saved defaults for this employee");
                        setForm((s) => ({
                          ...s,
                          hourly_rate: d.hourly_rate ?? s.hourly_rate,
                          ot_multiplier: d.ot_multiplier ?? s.ot_multiplier,
                          vacation_pct: d.vacation_pct ?? s.vacation_pct,
                        }));
                        toast.success("Loaded saved defaults into the form");
                      }}
                    >
                      <FolderSync className="h-4 w-4 mr-1" />
                      Use saved defaults
                    </Button>
                    <Button className="flex-1" onClick={saveDefaultsForEmployee} disabled={!canHR || !form.employee_uid || busy}>
                      <Save className="h-4 w-4 mr-1" />
                      Save defaults
                    </Button>
                  </div>

                  {/* Hours + allowances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Regular hours</label>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={form.regular_hours}
                        onChange={(e) => setForm((s) => ({ ...s, regular_hours: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">OT hours</label>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={form.overtime_hours}
                        onChange={(e) => setForm((s) => ({ ...s, overtime_hours: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Allowances</label>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={form.allowances}
                        onChange={(e) => setForm((s) => ({ ...s, allowances: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Deductions</label>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={form.deductions}
                        onChange={(e) => setForm((s) => ({ ...s, deductions: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-end min-w-0">
                      <Button
                        className="w-full min-w-0 whitespace-normal text-xs md:text-sm leading-snug px-2 py-2"
                        onClick={prefillFromAttendance}
                        disabled={!canHR || !form.employee_uid || busy}
                        title="Fill from attendance"
                      >
                        Fill from attendance
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs mb-1 text-slate-600">Note (prints on stub)</label>
                      <Input
                        type="text"
                        placeholder="Optional note"
                        value={form.note}
                        onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1 text-slate-600">Status</label>
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
                      <Printer className="h-4 w-4 mr-1" />
                      Print / PDF
                    </Button>
                    <Button onClick={saveToPayroll} disabled={!canHR || busy}>
                      <Save className="h-4 w-4 mr-1" />
                      Save to payroll
                    </Button>
                  </div>
                </>
              )}
            </Card>

            {/* RIGHT: preview that prints */}
            <div className="lg:col-span-2 space-y-4">
              <Card className={`p-4 print-area ${missingDefaults ? "bg-amber-50 border-amber-300" : ""}`}>
                {/* PRINT HEADER */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <img src={logo} alt="DigitizerX" className="h-6 w-auto" />
                    <h1 className="font-semibold text-base">DigitizerX · Paystub</h1>
                  </div>
                  <div className="text-right text-xs leading-5">
                    <div>
                      <strong>Employee:</strong> {employeeLabel}
                    </div>
                    <div>
                      <strong>Period:</strong> {periodLabel}
                    </div>
                    <div>
                      <strong>Currency:</strong> {String(form.currency_code || "INR").toUpperCase()} @{form.fx_rate}
                    </div>
                  </div>
                </div>

                {/* totals */}
                {booting ? (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
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
                )}

                {/* breakdown table */}
                <div className="mt-3 border rounded overflow-x-auto">
                  {booting ? (
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
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
                          <td className="p-2 border">{toMoney(form.hourly_rate * form.ot_multiplier)}</td>
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
                          <td className="p-2 border text-right font-semibold">{toMoney(calc.net)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>

              {/* Per-day breakdown */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-blue-700">Per-day breakdown</div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={prefillFromAttendance} disabled={!form.employee_uid}>
                      Refresh from attendance
                    </Button>
                    <Button variant="outline" onClick={exportDaysCsv} disabled={!days?.length}>
                      Export CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {booting ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
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
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media screen {.print-sheet{max-width:210mm;margin-left:auto;margin-right:auto;}}
        @media print{
          @page{size:A4 portrait;margin:10mm;}
          html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff!important;}
          .no-print{display:none!important;}
          body *{visibility:hidden;}
          .print-area,.print-area *{visibility:visible;}
          .print-area{position:fixed;top:0;left:0;right:0;margin:0!important;width:auto!important;padding:10px!important;}
          .print-area .grid{gap:6px!important;}
          .print-area table,.print-area tr,.print-area td,.print-area th{page-break-inside:avoid;break-inside:avoid;}
          .print-header h1{font-size:16px!important;}
          .brand-logo{height:22px!important;}
        }
      `}</style>
    </div>
  );
};

export default PaystubEditor;
