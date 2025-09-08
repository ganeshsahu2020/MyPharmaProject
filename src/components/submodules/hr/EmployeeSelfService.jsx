// src/components/submodules/hr/EmployeeSelfService.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { Card } from '../../ui/card';
import Button from '../../ui/button';  // Default import
import { Skeleton } from '../../ui/skeleton';
import toast from 'react-hot-toast';
import {
  UserCircle2,
  CalendarDays,
  Clock4,
  Search,
  FileSpreadsheet,
  ClipboardList,
  ClipboardCheck,
  ClipboardEdit,
} from 'lucide-react';
import { minToH, h2, overtimeH, parseIntSafe } from '../../../utils/timeMath';

/** tiny helpers **/
const isoDate = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const toTime = (t) => (t ? t.toString().slice(0, 5) : '');
const fmtDT = (s) => (s ? new Date(s).toLocaleString() : '—');

// Local midnight → UTC ISO boundaries
const localDayBoundsAsUtc = (yyyyMmDd) => {
  const a = new Date(`${yyyyMmDd}T00:00:00`);
  const b = new Date(`${yyyyMmDd}T23:59:59.999`);
  return { startUtc: a.toISOString(), endUtc: b.toISOString() };
};
const localRangeBoundsAsUtc = (from, to) => {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T23:59:59.999`);
  return { startUtc: a.toISOString(), endUtc: b.toISOString() };
};

/* ─────────────────────────── UI helpers (chips & tones) ─────────────────────────── */
const chipBase =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-white';

const chipClass = (tone = 'default') => {
  switch (tone) {
    case 'success':
      return `${chipBase} border-emerald-300 text-emerald-700`;
    case 'warning':
      return `${chipBase} border-amber-300 text-amber-700`;
    case 'danger':
      return `${chipBase} border-rose-300 text-rose-700`;
    case 'info':
      return `${chipBase} border-blue-300 text-blue-700`;
    default:
      return `${chipBase} border-gray-300 text-gray-700`;
  }
};

const reqTone = (s = '') => {
  const x = s.toLowerCase();
  if (x.includes('approve')) return 'success';
  if (x.includes('reject') || x.includes('cancel')) return 'danger';
  if (x.includes('pending')) return 'warning';
  return 'info';
};

const attendanceTone = (s = '') => {
  const x = s.toLowerCase();
  if (x.includes('present')) return 'success';
  if (x.includes('leave') || x.includes('holiday')) return 'info';
  if (x.includes('absent')) return 'danger';
  return 'warning';
};

// synthesize an attendance row from punches when a day has punches but no attendance row
function synthesizeDayFromPunches(dateStr, punches) {
  if (!punches || punches.length === 0) return null;
  const firstIn = punches.find((p) => p.punch_type === 'in') || punches[0];
  const lastOut = [...punches].reverse().find((p) => p.punch_type === 'out') || punches[punches.length - 1];

  // accumulate break minutes from break_in/out pairs
  let breakMin = 0;
  let openBreak = null;
  for (const p of punches) {
    if (p.punch_type === 'break_in') openBreak = p.occurred_at;
    if (p.punch_type === 'break_out' && openBreak) {
      breakMin += Math.max(0, Math.floor((new Date(p.occurred_at) - new Date(openBreak)) / 60000));
      openBreak = null;
    }
  }

  let workMin = 0;
  if (firstIn && lastOut) {
    const gross = Math.max(0, Math.floor((new Date(lastOut.occurred_at) - new Date(firstIn.occurred_at)) / 60000));
    workMin = Math.max(0, gross - breakMin);
  }
  const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : null);
  return {
    date: dateStr,
    employee_uid: punches[0].employee_uid,
    status: 'present',
    check_in: hhmm(firstIn?.occurred_at),
    check_out: hhmm(lastOut?.occurred_at),
    total_work_minutes: workMin,
    total_break_minutes: breakMin,
    updated_at: null,
    __synthetic: true,
  };
}

const EmployeeSelfService = () => {
  // whoami + employee mapping
  const [authUser, setAuthUser] = useState(null);
  const [emp, setEmp] = useState(null);
  const [whoamiWarn, setWhoamiWarn] = useState('');

  // overtime base (configurable)
  const [ovBaseMin, setOvBaseMin] = useState(parseIntSafe(import.meta.env.VITE_OVERTIME_BASE_MIN, 480));

  // today & range
  const [today] = useState(isoDate());
  const [range, setRange] = useState({
    start: isoDate(new Date(Date.now() - 14 * 86400000)),
    end: isoDate(),
  });

  // data
  const [attendance, setAttendance] = useState([]);
  const [attSearch, setAttSearch] = useState('');
  const [todayRow, setTodayRow] = useState(null);
  const [todayPunches, setTodayPunches] = useState([]);
  const [corrList, setCorrList] = useState([]);
  const [leaveList, setLeaveList] = useState([]);

  // loading flags
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [loadingToday, setLoadingToday] = useState(false);
  const [loadingPunches, setLoadingPunches] = useState(false);
  const [loadingCorr, setLoadingCorr] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);

  // forms
  const [corrForm, setCorrForm] = useState({ date: isoDate(), in: '', out: '', reason: '' });
  const [leaveForm, setLeaveForm] = useState({ from: isoDate(), to: isoDate(), type: 'general', reason: '' });

  // busy flags
  const [punching, setPunching] = useState(false);
  const [corrBusy, setCorrBusy] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const canPunch = useMemo(() => Boolean(emp?.id), [emp?.id]);

  /** boot: resolve auth user & employee + overtime base **/
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthUser(user || null);
      const email = user?.email || null;
      if (!email) {
        setWhoamiWarn(
          'No auth user email found. Please sign in; otherwise the page cannot resolve your employee profile.',
        );
        return;
      }
      const { data: empRow, error: empErr } = await supabase
        .from('vw_user_management_ext')
        .select('id, employee_id, first_name, last_name, email')
        .eq('email', email)
        .maybeSingle();
      if (empErr) {
        setWhoamiWarn(`Failed to load employee profile: ${empErr.message}`);
        return;
      }
      if (!empRow) {
        setWhoamiWarn(`No employee mapped to ${email}. Create/link a row in user_management.`);
        return;
      }
      setEmp(empRow);
      // overtime base from DB → fallback to env (→ 480)
      try {
        const { data: cfg, error: cfgErr } = await supabase.rpc('app_overtime_base_min');
        if (!cfgErr && Number.isFinite(cfg)) setOvBaseMin(cfg);
      } catch (_) {}
    })();
  }, []);

  /** load everything when emp or range changes **/
  useEffect(() => {
    if (!emp?.id) return;
    loadAttendance();
    loadToday();
    loadPunches();
    loadCorrections();
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp?.id, range.start, range.end]);

  // ---------- loads ----------
  async function loadAttendance() {
    setLoadingAtt(true);
    try {
      // base rows
      const { data: att } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_uid', emp.id)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: false });
      const base = att || [];

      // fill holes from punches
      const { startUtc, endUtc } = localRangeBoundsAsUtc(range.start, range.end);
      const { data: punches } = await supabase
        .from('attendance_punch')
        .select('employee_uid,punch_type,occurred_at')
        .eq('employee_uid', emp.id)
        .gte('occurred_at', startUtc)
        .lte('occurred_at', endUtc)
        .order('occurred_at', { ascending: true });

      const byDay = new Map();
      for (const p of punches || []) {
        const d = new Date(p.occurred_at);
        const key = isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(p);
      }
      const existing = new Set(base.map((r) => r.date));
      const synth = [];
      for (const [d, arr] of byDay.entries()) {
        if (!existing.has(d)) {
          const s = synthesizeDayFromPunches(d, arr);
          if (s) synth.push(s);
        }
      }
      const merged = [...base, ...synth].sort((a, b) => (a.date < b.date ? 1 : -1));
      setAttendance(merged);
    } finally {
      setLoadingAtt(false);
    }
  }

  async function loadToday() {
    setLoadingToday(true);
    try {
      const localDay = today;
      const utcDay = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_uid', emp.id)
        .or(`date.eq.${localDay},date.eq.${utcDay}`)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setTodayRow(data || null);
    } finally {
      setLoadingToday(false);
    }
  }

  async function loadPunches() {
    setLoadingPunches(true);
    try {
      const { startUtc, endUtc } = localDayBoundsAsUtc(today);
      const { data } = await supabase
        .from('attendance_punch')
        .select('punch_type,occurred_at,source,note')
        .eq('employee_uid', emp.id)
        .gte('occurred_at', startUtc)
        .lte('occurred_at', endUtc)
        .order('occurred_at', { ascending: true });
      setTodayPunches(data || []);
    } finally {
      setLoadingPunches(false);
    }
  }

  async function loadCorrections() {
    setLoadingCorr(true);
    try {
      const { data } = await supabase
        .from('attendance_correction_request')
        .select(
          'id,employee_uid,request_date,proposed_check_in,proposed_check_out,reason,status,hr_comment,created_at,decided_at',
        )
        .eq('employee_uid', emp.id)
        .order('created_at', { ascending: false });
      setCorrList(data || []);
    } finally {
      setLoadingCorr(false);
    }
  }

  async function loadLeaves() {
    setLoadingLeave(true);
    try {
      const { data } = await supabase
        .from('leave_request_ui')
        .select('id,employee_uid,date_from,date_to,leave_type,status,hr_comment,created_at')
        .eq('employee_uid', emp.id)
        .order('created_at', { ascending: false });
      setLeaveList(data || []);
    } finally {
      setLoadingLeave(false);
    }
  }

  // ---------- CSV exports ----------
  function downloadCsv(name, rows, headers) {
    const hdr = headers.map((h) => `"${h}"`).join(',');
    const lines = rows.map((r) =>
      headers.map((k) => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','),
    );
    const csv = [hdr, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportAttendanceCsv() {
    const rows = (attendance || []).map((r) => ({
      date: r.date,
      status: r.status || '',
      check_in: r.check_in || '',
      check_out: r.check_out || '',
      work_h: h2(minToH(r.total_work_minutes || 0)),
      break_h: h2(minToH(r.total_break_minutes || 0)),
      overtime_h: h2(overtimeH(r.total_work_minutes || 0, ovBaseMin)),
      updated_at: r.updated_at || '',
    }));
    downloadCsv(
      `attendance_${range.start}_${range.end}.csv`,
      rows,
      ['date', 'status', 'check_in', 'check_out', 'work_h', 'break_h', 'overtime_h', 'updated_at'],
    );
  }

  function exportCorrectionsCsv() {
    const rows = (corrList || []).map((r) => ({
      request_date: r.request_date,
      proposed_check_in: r.proposed_check_in || '',
      proposed_check_out: r.proposed_check_out || '',
      status: r.status || '',
      hr_comment: r.hr_comment || '',
      created_at: r.created_at || '',
      decided_at: r.decided_at || '',
    }));
    downloadCsv(
      `corrections_${range.start}_${range.end}.csv`,
      rows,
      [
        'request_date',
        'proposed_check_in',
        'proposed_check_out',
        'status',
        'hr_comment',
        'created_at',
        'decided_at',
      ],
    );
  }

  // ----- PUNCHES (self) — optimistic + toast.promise -----
  async function doPunch(type) {
    if (!canPunch || punching) return;
    setPunching(true);

    // optimistic: add a punch locally
    const optimistic = { punch_type: type, occurred_at: new Date().toISOString(), source: 'self', note: null };
    setTodayPunches((rows) => [...rows, optimistic]);

    await toast
      .promise(
        supabase.rpc('hr_punch_self', {
          p_type: type,
          p_at: optimistic.occurred_at,
          p_source: 'self',
          p_note: null,
        }),
        {
          loading: `Recording ${type}…`,
          success: `${type.toUpperCase()} recorded`,
          error: 'Punch failed',
        },
      )
      .then(async () => {
        await Promise.all([loadPunches(), loadToday(), loadAttendance()]);
      })
      .catch(async () => {
        await loadPunches(); // rollback/refresh
      })
      .finally(() => setPunching(false));
  }

  // ----- Missed punch / correction request (self) — optimistic + toast.promise -----
  async function submitCorrection(e) {
    e?.preventDefault?.();
    if (!emp?.id) return toast.error('No employee profile resolved.');
    if (!corrForm.reason.trim()) return toast.error('Reason is required.');
    setCorrBusy(true);

    // optimistic row
    const tempId = `tmp_${Date.now()}`;
    const tempRow = {
      id: tempId,
      employee_uid: emp.id,
      request_date: corrForm.date,
      proposed_check_in: corrForm.in || null,
      proposed_check_out: corrForm.out || null,
      reason: corrForm.reason.trim(),
      status: 'pending',
      hr_comment: null,
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    setCorrList((rows) => [tempRow, ...rows]);

    await toast
      .promise(
        supabase.from('attendance_correction_request').insert([
          {
            employee_uid: emp.id,
            request_date: corrForm.date,
            proposed_check_in: corrForm.in || null,
            proposed_check_out: corrForm.out || null,
            reason: corrForm.reason.trim(),
          },
        ]),
        { loading: 'Submitting…', success: 'Request submitted', error: 'Submit failed' },
      )
      .then(async () => {
        await loadCorrections();
        setCorrForm({ date: isoDate(), in: '', out: '', reason: '' });
      })
      .catch(() => {
        setCorrList((rows) => rows.filter((r) => r.id !== tempId)); // rollback
      })
      .finally(() => setCorrBusy(false));
  }

  // ----- Leave request (self) — optimistic + toast.promise -----
  async function submitLeave(e) {
    e?.preventDefault?.();
    if (!emp?.id) return toast.error('No employee profile resolved.');
    if (!leaveForm.reason.trim()) return toast.error('Reason is required.');
    if (leaveForm.to < leaveForm.from) return toast.error('End date must be ≥ start date.');
    setLeaveBusy(true);

    const tempId = `tmp_${Date.now()}`;
    const tempRow = {
      id: tempId,
      employee_uid: emp.id,
      date_from: leaveForm.from,
      date_to: leaveForm.to,
      leave_type: leaveForm.type,
      status: 'pending',
      hr_comment: null,
      created_at: new Date().toISOString(),
    };
    setLeaveList((rows) => [tempRow, ...rows]);

    await toast
      .promise(
        supabase.rpc('ui_leave_request_create', {
          p_date_from: leaveForm.from,
          p_date_to: leaveForm.to,
          p_leave_type: leaveForm.type,
          p_reason: leaveForm.reason.trim(),
        }),
        { loading: 'Submitting…', success: 'Leave request submitted', error: 'Submit failed' },
      )
      .then(async () => {
        await loadLeaves();
        setLeaveForm({ from: isoDate(), to: isoDate(), type: 'general', reason: '' });
      })
      .catch(() => {
        setLeaveList((rows) => rows.filter((r) => r.id !== tempId)); // rollback
      })
      .finally(() => setLeaveBusy(false));
  }

  // ---------- filters & summary ----------
  const filteredAttendance = useMemo(() => {
    if (!attSearch.trim()) return attendance;
    const q = attSearch.toLowerCase();
    return attendance.filter((r) => {
      const bag = `${r.date} ${r.status || ''} ${toTime(r.check_in)} ${toTime(r.check_out)} ${h2(
        minToH(r.total_work_minutes),
      )} ${h2(minToH(r.total_break_minutes))}`.toLowerCase();
      return bag.includes(q);
    });
  }, [attendance, attSearch]);

  const attSummary = useMemo(() => {
    const days = filteredAttendance.length;
    const workMin = filteredAttendance.reduce((a, r) => a + (Number(r.total_work_minutes) || 0), 0);
    const breakMin = filteredAttendance.reduce((a, r) => a + (Number(r.total_break_minutes) || 0), 0);
    const overtimeMin = filteredAttendance.reduce(
      (a, r) => a + Math.max(0, (Number(r.total_work_minutes) || 0) - ovBaseMin),
      0,
    );
    const presentDays = filteredAttendance.filter((r) => (r.status || '').toLowerCase() === 'present').length;
    return {
      days,
      presentDays,
      workH: h2(minToH(workMin)),
      breakH: h2(minToH(breakMin)),
      overtimeH: h2(minToH(overtimeMin)),
      avgH: days ? h2(minToH(workMin) / days) : '0.00',
    };
  }, [filteredAttendance, ovBaseMin]);

  // ---------- heatmap data (selected range) ----------
  const heatmap = useMemo(() => {
    // build a date list from range.start..range.end
    const start = new Date(range.start);
    const end = new Date(range.end);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(isoDate(d));
    }
    // map hours
    const map = new Map();
    for (const r of attendance) {
      map.set(r.date, Number(h2(minToH(r.total_work_minutes || 0))));
    }
    return days.map((d) => ({ date: d, h: map.get(d) || 0 }));
  }, [attendance, range.start, range.end]);

  // weekly average (last 7 days from today or range end)
  const weeklyAvg = useMemo(() => {
    const end = new Date(range.end);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    let total = 0;
    let n = 0;
    for (const r of attendance) {
      const d = new Date(r.date);
      if (d >= start && d <= end) {
        total += minToH(r.total_work_minutes || 0);
        n++;
      }
    }
    return h2(n ? total / n : 0);
  }, [attendance, range.end]);

  return (
    <div className="p-3 space-y-4">
      {/* BRANDING-ONLY HEADER */}
      <div className="rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-5 text-white">
          <div className="space-y-0.5">
            <div className="text-xs/5 opacity-90 inline-flex items-center gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Workforce
            </div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
              Employee Self-Service
            </h2>
          </div>
        </div>
      </div>

      {/* INFO BAR */}
      <Card className="p-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-xs text-gray-600 inline-flex items-center gap-2">
            <UserCircle2 className="h-4 w-4 text-blue-700" />
            {emp ? (
              <>
                Signed in as <b>{emp.first_name} {emp.last_name}</b> ({emp.employee_id || authUser?.email}) · OT base{' '}
                {h2(minToH(ovBaseMin))}h
              </>
            ) : (
              'Resolving your employee profile…'
            )}
          </div>
          {whoamiWarn && (
            <div className="text-xs rounded border p-2 bg-yellow-50 text-yellow-800 border-yellow-200">
              {whoamiWarn}
            </div>
          )}
        </div>
      </Card>

      {/* Punch panel */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => doPunch('in')} disabled={!canPunch || punching}>
            Punch In
          </Button>
          <Button variant="outline" onClick={() => doPunch('break_in')} disabled={!canPunch || punching}>
            Break In
          </Button>
          <Button variant="outline" onClick={() => doPunch('break_out')} disabled={!canPunch || punching}>
            Break Out
          </Button>
          <Button variant="destructive" onClick={() => doPunch('out')} disabled={!canPunch || punching}>
            Punch Out
          </Button>
          <div className="ml-auto text-sm text-gray-600 inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-700" />
            Today: {today}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">Check In</div>
            <div className="text-base font-semibold">
              {loadingToday ? <Skeleton className="h-6 w-20" /> : toTime(todayRow?.check_in) || '—'}
            </div>
          </div>
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">Check Out</div>
            <div className="text-base font-semibold">
              {loadingToday ? <Skeleton className="h-6 w-20" /> : toTime(todayRow?.check_out) || '—'}
            </div>
          </div>
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">Work / Break (h)</div>
            <div className="text-base font-semibold">
              {loadingToday ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <>
                  {h2(minToH(todayRow?.total_work_minutes ?? 0))} / {h2(minToH(todayRow?.total_break_minutes ?? 0))}
                </>
              )}
            </div>
          </div>
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">Overtime (h)</div>
            <div className="text-base font-semibold">
              {loadingToday ? <Skeleton className="h-6 w-20" /> : h2(overtimeH(todayRow?.total_work_minutes ?? 0, ovBaseMin))}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-1">Today’s punches</div>
          <div className="flex flex-wrap gap-2">
            {loadingPunches ? (
              <>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
              </>
            ) : todayPunches.length === 0 ? (
              <span className="text-xs text-gray-500">None yet</span>
            ) : (
              todayPunches.map((p, i) => (
                <span key={i} className="text-xs border rounded px-2 py-0.5 bg-white">
                  {p.punch_type.toUpperCase()} · {new Date(p.occurred_at).toLocaleTimeString()}
                </span>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Range + summary + actions */}
      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <div className="relative">
            <label className="block text-xs mb-1 text-blue-800">From</label>
            <CalendarDays className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
            <input
              type="date"
              className="border rounded p-2 pl-8 text-sm w-full"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              inputMode="numeric"
            />
          </div>
          <div className="relative">
            <label className="block text-xs mb-1 text-blue-800">To</label>
            <CalendarDays className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
            <input
              type="date"
              className="border rounded p-2 pl-8 text-sm w-full"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              inputMode="numeric"
            />
          </div>
          <div className="relative md:col-span-2">
            <label className="block text-xs mb-1 text-blue-800">Search (date/status/time)</label>
            <Search className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
            <input
              className="border rounded p-2 pl-8 text-sm w-full"
              placeholder="e.g. 2025-08-14 present 09:00"
              value={attSearch}
              onChange={(e) => setAttSearch(e.target.value)}
              inputMode="text"
              enterKeyHint="search"
            />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2 justify-end">
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(loadAttendance(), {
                  loading: 'Refreshing…',
                  success: 'Updated',
                  error: 'Failed to refresh',
                })
              }
            >
              Refresh
            </Button>
            <Button variant="outline" onClick={exportAttendanceCsv}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={exportCorrectionsCsv}>
              <ClipboardList className="h-4 w-4 mr-1" />
              Corrections CSV
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mt-3">
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Days</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-10 mx-auto" /> : attSummary.days}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Present Days</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-10 mx-auto" /> : attSummary.presentDays}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Work (h)</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-14 mx-auto" /> : attSummary.workH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Break (h)</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-14 mx-auto" /> : attSummary.breakH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Overtime (h)</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-14 mx-auto" /> : attSummary.overtimeH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Avg/Day (h)</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-14 mx-auto" /> : attSummary.avgH}</div>
          </Card>
          <Card className="p-2 text-center">
            <div className="text-xs text-gray-500">Weekly Avg (h)</div>
            <div className="font-semibold">{loadingAtt ? <Skeleton className="h-5 w-14 mx-auto" /> : weeklyAvg}</div>
          </Card>
        </div>

        {/* Heatmap (selected range) */}
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-1">Work hours heatmap</div>
          <div className="grid grid-cols-7 gap-1">
            {heatmap.map((d) => (
              <div
                key={d.date}
                className="w-6 h-6 rounded"
                title={`${d.date}: ${h2(d.h)}h`}
                style={{
                  backgroundColor: d.h === 0 ? '#f3f4f6' : d.h < 4 ? '#d1fae5' : d.h < 8 ? '#6ee7b7' : '#10b981',
                }}
              />
            ))}
          </div>
        </div>

        {/* Attendance table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
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
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="p-2 border">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ) : filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-center text-gray-500">
                    No records
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((r) => (
                  <tr key={`${r.date}-${r.employee_uid}`}>
                    <td className="p-2 border">
                      {r.date}
                      {r.__synthetic && (
                        <span
                          title="Derived from punches"
                          className="inline-block ml-1 w-1.5 h-1.5 rounded-full bg-gray-400 align-middle"
                        />
                      )}
                    </td>
                    <td className="p-2 border">
                      <span className={chipClass(attendanceTone(r.status))}>{(r.status || '').toUpperCase()}</span>
                    </td>
                    <td className="p-2 border">{toTime(r.check_in) || '—'}</td>
                    <td className="p-2 border">{toTime(r.check_out) || '—'}</td>
                    <td className="p-2 border">{h2(minToH(r.total_work_minutes))}</td>
                    <td className="p-2 border">{h2(minToH(r.total_break_minutes))}</td>
                    <td className="p-2 border">{h2(overtimeH(r.total_work_minutes ?? 0, ovBaseMin))}</td>
                    <td className="p-2 border text-xs text-gray-500">{fmtDT(r.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Missed punch / correction request */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm inline-flex items-center gap-2 text-blue-800">
            <ClipboardEdit className="h-4 w-4 text-blue-600" />
            Missed Punch Request
          </div>
          <form onSubmit={submitCorrection} className="space-y-2">
            <div className="relative">
              <label className="block text-xs mb-1">Date</label>
              <CalendarDays className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
              <input
                type="date"
                className="border rounded p-2 pl-8 text-sm w-full"
                value={corrForm.date}
                onChange={(e) => setCorrForm((f) => ({ ...f, date: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <label className="block text-xs mb-1">Proposed In (optional)</label>
                <Clock4 className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
                <input
                  type="time"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={corrForm.in}
                  onChange={(e) => setCorrForm((f) => ({ ...f, in: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <div className="relative">
                <label className="block text-xs mb-1">Proposed Out (optional)</label>
                <Clock4 className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
                <input
                  type="time"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={corrForm.out}
                  onChange={(e) => setCorrForm((f) => ({ ...f, out: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="relative">
              <label className="block text-xs mb-1">Reason</label>
              <ClipboardList className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
              <textarea
                className="border rounded p-2 pl-8 text-sm w-full"
                rows={3}
                value={corrForm.reason}
                onChange={(e) => setCorrForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={corrBusy}>
                {corrBusy ? 'Submitting…' : 'Submit'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCorrForm({ date: isoDate(), in: '', out: '', reason: '' })}
                disabled={corrBusy}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  toast.promise(loadCorrections(), {
                    loading: 'Refreshing…',
                    success: 'Updated',
                    error: 'Failed to refresh',
                  })
                }
              >
                Refresh
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm">My Correction Requests</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border text-left">Date</th>
                  <th className="p-2 border text-left">In/Out</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">HR Comment</th>
                  <th className="p-2 border text-left">Decided At</th>
                </tr>
              </thead>
              <tbody>
                {loadingCorr ? (
                  <tr>
                    <td colSpan={5} className="p-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ) : corrList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-gray-500">
                      No requests
                    </td>
                  </tr>
                ) : (
                  corrList.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2 border">{r.request_date}</td>
                      <td className="p-2 border">
                        {toTime(r.proposed_check_in) || '—'} / {toTime(r.proposed_check_out) || '—'}
                      </td>
                      <td className="p-2 border">
                        <span className={chipClass(reqTone(r.status))}>{(r.status || 'pending').toUpperCase()}</span>
                      </td>
                      <td className="p-2 border text-xs">{r.hr_comment || '—'}</td>
                      <td className="p-2 border text-xs">{r.decided_at ? fmtDT(r.decided_at) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Leave request */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm inline-flex items-center gap-2 text-blue-800">
            <ClipboardCheck className="h-4 w-4 text-blue-600" />
            Leave Request
          </div>
          <form onSubmit={submitLeave} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <label className="block text-xs mb-1">From</label>
                <CalendarDays className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
                <input
                  type="date"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={leaveForm.from}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, from: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <div className="relative">
                <label className="block text-xs mb-1">To</label>
                <CalendarDays className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
                <input
                  type="date"
                  className="border rounded p-2 pl-8 text-sm w-full"
                  value={leaveForm.to}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, to: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="relative">
              <label className="block text-xs mb-1">Type</label>
              <ClipboardList className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
              <select
                className="border rounded p-2 pl-8 text-sm w-full"
                value={leaveForm.type}
                onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="general">General</option>
                <option value="sick">Sick</option>
                <option value="casual">Casual</option>
                <option value="vacation">Vacation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="relative">
              <label className="block text-xs mb-1">Reason</label>
              <ClipboardList className="h-4 w-4 absolute left-2 top-9 text-blue-600/80 pointer-events-none" />
              <textarea
                className="border rounded p-2 pl-8 text-sm w-full"
                rows={3}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={leaveBusy}>
                {leaveBusy ? 'Submitting…' : 'Submit'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLeaveForm({ from: isoDate(), to: isoDate(), type: 'general', reason: '' })}
                disabled={leaveBusy}
              >
                Clear
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-3">
          <div className="font-semibold mb-2 text-sm">My Leave Requests</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border text-left">Dates</th>
                  <th className="p-2 border text-left">Type</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">HR Comment</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeave ? (
                  <tr>
                    <td colSpan={4} className="p-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ) : leaveList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-gray-500">
                      No requests
                    </td>
                  </tr>
                ) : (
                  leaveList.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2 border">
                        {r.date_from} → {r.date_to}
                      </td>
                      <td className="p-2 border capitalize">{r.leave_type}</td>
                      <td className="p-2 border">
                        <span className={chipClass(reqTone(r.status))}>{(r.status || 'pending').toUpperCase()}</span>
                      </td>
                      <td className="p-2 border text-xs">{r.hr_comment || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeSelfService;
