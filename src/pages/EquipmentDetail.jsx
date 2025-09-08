// src/pages/EquipmentDetail.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, Tag, Factory, Box, CalendarCheck, CalendarClock, QrCode,
  Edit3, Save, X, ShieldCheck, Trash2, Copy, Printer, Lock, CheckCircle2,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase } from '../utils/supabaseClient';
import logo from '../assets/logo.png';

/* ───────────────────────── BRAND / CONFIG ───────────────────────── */
const BRAND = {
  name: 'DigitizerX',
  nameColor: '#1E40AF',
  blue: '#143C8B',
  emerald: '#0F7A5A',
  gradientFrom: '#ecf2ff',
  gradientVia: '#f2f7ff',
  gradientTo: '#eefcf6',
};

const cls = (...a) => a.filter(Boolean).join(' ');
const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

const StatusBadge = ({ status }) => {
  const s = String(status || 'Active').toLowerCase();
  const style =
    s === 'active'
      ? { backgroundColor: '#eefcf6', color: '#0F7A5A', border: '1px solid #c7f0de' }
      : s === 'out of service'
      ? { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
      : s === 'retired'
      ? { backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }
      : { backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={style}
    >
      <CheckCircle2 size={14} style={{ opacity: 0.8 }} />
      {status || '—'}
    </span>
  );
};

const Tile = ({ icon: Icon, color, label, value }) => (
  <div className="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition-shadow p-4 flex items-start gap-3">
    <div
      className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ring-1"
      style={{
        color: color.fg,
        background: color.bg,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.02)',
      }}
    >
      <Icon size={18} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[15px] mt-0.5 font-medium break-words">{value || '—'}</div>
    </div>
  </div>
);

const IconInput = ({ icon: Icon, ...props }) => (
  <div className="relative">
    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none" style={{ color: BRAND.blue }}>
      <Icon size={16} />
    </div>
    <input
      {...props}
      className={cls(
        'w-full border rounded-lg px-3 py-2 text-sm pl-9',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
      )}
    />
  </div>
);

const IconSelect = ({ ...props }) => (
  <select
    {...props}
    className={cls(
      'w-full border rounded-lg px-3 py-2 text-sm',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
    )}
  />
);

const Skeleton = ({ h = 14 }) => (
  <div className="animate-pulse">
    <div className="rounded bg-slate-200" style={{ height: h }} />
  </div>
);

/* ───────────────────────── MAIN PAGE ───────────────────────── */
const EquipmentDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState(null);
  const [edit, setEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [form, setForm] = useState({
    asset_code: '',
    name: '',
    status: 'Active',
    serial_no: '',
    manufacturer: '',
    model: '',
    install_date: '',
    calibration_done_on: '',
    calibration_due_on: '',
    qr_token: '',
    public_token: '',
  });

  const title = useMemo(() => asset?.name || asset?.asset_code || 'Equipment', [asset]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        let admin = false;
        const rpc = await supabase.rpc('_is_admin');
        if (!rpc.error) admin = !!rpc.data;
        else {
          const role = (data?.user?.user_metadata?.role || '').toLowerCase();
          admin = role === 'admin' || role === 'superadmin';
        }
        setIsAdmin(admin);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const op = (async () => {
      const { data, error } = await supabase
        .from('asset')
        .select(
          'id,asset_code,name,status,serial_no,manufacturer,model,install_date,calibration_done_on,calibration_due_on,qr_token,public_token,created_at'
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Not found');

      setAsset(data);
      setForm({
        asset_code: data.asset_code || '',
        name: data.name || '',
        status: data.status || 'Active',
        serial_no: data.serial_no || '',
        manufacturer: data.manufacturer || '',
        model: data.model || '',
        install_date: data.install_date || '',
        calibration_done_on: data.calibration_done_on || '',
        calibration_due_on: data.calibration_due_on || '',
        qr_token: data.qr_token || '',
        public_token: data.public_token || '',
      });
    })();

    await toast
      .promise(op, {
        loading: 'Loading…',
        success: 'Loaded',
        error: (e) => e?.message || 'Failed to load',
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const requireAdmin = () => {
    if (!isAdmin) {
      toast.error('Admin only');
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!requireAdmin()) return;
    setSaving(true);
    await toast
      .promise(
        (async () => {
          const payload = {
            asset_code: form.asset_code || null,
            name: form.name || null,
            status: form.status || 'Active',
            serial_no: form.serial_no || null,
            manufacturer: form.manufacturer || null,
            model: form.model || null,
            install_date: form.install_date || null,
            calibration_done_on: form.calibration_done_on || null,
            calibration_due_on: form.calibration_due_on || null,
          };
          const { error } = await supabase.from('asset').update(payload).eq('id', id);
          if (error) throw error;
          await load();
          setEdit(false);
        })(),
        { loading: 'Saving…', success: 'Saved', error: (e) => e?.message || 'Save failed' }
      )
      .finally(() => setSaving(false));
  };

  const onRetire = async () => {
    if (!requireAdmin()) return;
    await toast.promise(
      (async () => {
        const { error } = await supabase.from('asset').update({ status: 'Retired' }).eq('id', id);
        if (error) throw error;
        await load();
      })(),
      { loading: 'Retiring…', success: 'Asset retired', error: (e) => e?.message || 'Retire failed' }
    );
  };

  const onDelete = async () => {
    if (!requireAdmin()) return;
    const ok = window.confirm('Delete this asset? This cannot be undone.');
    if (!ok) return;
    await toast.promise(
      (async () => {
        const { error } = await supabase.from('asset').delete().eq('id', id);
        if (error) throw error;
        nav(-1);
      })(),
      { loading: 'Deleting…', success: 'Deleted', error: (e) => e?.message || 'Delete failed' }
    );
  };

  const copy = (t) =>
    navigator.clipboard.writeText(t || '').then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed')
    );

  const onPrintSheet = () => {
    const a = asset;
    if (!a) return;
    const token = a.qr_token || a.public_token || '';
    const qrImg = token
      ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(token)}`
      : '';

    const css = `
      <style>
        @page { margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; }
        .header { display:flex; align-items:center; gap:16px; margin-bottom:16px; border-bottom:1px solid #e5e7eb; padding-bottom:12px; }
        .brand { display:flex; align-items:flex-start; gap:12px; }
        .brand .name { font-weight:700; letter-spacing: .2px; margin-bottom:4px; }
        .title { font-size: 20px; font-weight: 800; color: ${BRAND.blue}; }
        .badge { display:inline-flex; align-items:center; gap:6px; padding:2px 10px; border-radius:999px;
                 border:1px solid #c7f0de; background:#eefcf7; color:#136c55; font-size:12px; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        .card { border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
        .label { color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
        .value { font-size:14px; font-weight:600; margin-top:4px; }
        .qrwrap { display:flex; gap:16px; align-items:center; }
        .muted { color:#64748b; font-size:12px; }
      </style>
    `;

    const html = `
      <!doctype html><html><head><meta charset="utf-8" />
      <title>${a.name || a.asset_code || 'Equipment'} — Print Sheet</title>${css}</head>
      <body>
        <div class="header">
          <div class="brand">
            <div>
              <div class="name" style="color:${BRAND.nameColor}">${BRAND.name}</div>
              <img src="${logo}" alt="Logo" style="height:40px"/>
            </div>
          </div>
          <div style="flex:1">
            <div class="title">${a.name || a.asset_code || 'Equipment'}</div>
            <div style="margin-top:6px"><span class="badge">${a.status || 'Active'}</span></div>
          </div>
          ${qrImg ? `<img src="${qrImg}" alt="QR" style="height:100px;width:100px;border:1px solid #e5e7eb;border-radius:8px;padding:6px;background:#fff" />` : ''}
        </div>
        <div class="grid">
          <div class="card"><div class="label">Equipment ID</div><div class="value">${a.asset_code || '—'}</div></div>
          <div class="card"><div class="label">Equipment Name</div><div class="value">${a.name || '—'}</div></div>
          <div class="card"><div class="label">Serial #</div><div class="value">${a.serial_no || '—'}</div></div>
          <div class="card"><div class="label">Manufacturer</div><div class="value">${a.manufacturer || '—'}</div></div>
          <div class="card"><div class="label">Model</div><div class="value">${a.model || '—'}</div></div>
          <div class="card"><div class="label">Installed</div><div class="value">${fmt(a.install_date)}</div></div>
          <div class="card"><div class="label">Calibration Done</div><div class="value">${fmt(a.calibration_done_on)}</div></div>
          <div class="card"><div class="label">Calibration Due</div><div class="value">${fmt(a.calibration_due_on)}</div></div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="qrwrap">
            ${qrImg ? `<img src="${qrImg}" alt="QR" style="height:140px;width:140px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff"/>` : ''}
            <div>
              <div class="label">QR Token (UUID)</div>
              <div class="value" style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${token || '—'}</div>
              <div class="muted" style="margin-top:6px">Scanner should read the token (no URL). If scanning fails, type this token or the equipment ID in the application.</div>
            </div>
          </div>
        </div>
      </body></html>
    `;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) { toast.error('Popup blocked'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.onload = () => { try { w.focus(); w.print(); } catch {} };
  };

  return (
    <div className="px-3 py-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border shadow-sm bg-white/80 overflow-hidden">
          <div
            className="bg-gradient-to-r"
            style={{ backgroundImage: `linear-gradient(to right, ${BRAND.gradientFrom}, ${BRAND.gradientVia}, ${BRAND.gradientTo})` }}
          >
            <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-bold" style={{ color: BRAND.nameColor }}>{BRAND.name}</div>
                  <img src={logo} alt="Logo" className="h-10 w-auto mt-1" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold" style={{ color: BRAND.blue }}>
                    {loading ? <Skeleton h={20} /> : title}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {loading ? <Skeleton h={16} /> : <StatusBadge status={asset?.status} />}
                    {!isAdmin && !loading && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Lock size={14} /> read-only
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                  onClick={onPrintSheet}
                  title="Print Sheet"
                >
                  <Printer size={16} /> Print Sheet
                </button>

                {!loading && isAdmin && (
                  !edit ? (
                    <>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                        onClick={() => setEdit(true)}
                      >
                        <Edit3 size={16} /> Edit
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                        onClick={onRetire}
                      >
                        <ShieldCheck size={16} /> Retire
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                        onClick={onDelete}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white hover:opacity-95"
                        style={{ background: BRAND.emerald }}
                        onClick={onSave}
                        disabled={saving}
                      >
                        <Save size={16} /> Save
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50"
                        onClick={() => { setEdit(false); setForm((f) => ({ ...f, ...asset })); }}
                      >
                        <X size={16} /> Cancel
                      </button>
                    </>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {!edit ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-xl border bg-white/90 p-4"><Skeleton h={40} /></div>
                    ))
                  ) : (
                    <>
                      <Tile icon={Tag}           color={{ bg:'#eef2ff', fg:BRAND.blue }} label="Equipment ID"   value={asset?.asset_code} />
                      <Tile icon={Package}       color={{ bg:'#f0f7ff', fg:BRAND.blue }} label="Equipment Name" value={asset?.name} />
                      <Tile icon={ShieldCheck}   color={{ bg:'#edfff7', fg:BRAND.emerald }} label="Status" value={asset?.status} />
                      <Tile icon={Tag}           color={{ bg:'#e9fbff', fg:'#0c7d8a' }} label="Serial #" value={asset?.serial_no} />
                      <Tile icon={Factory}       color={{ bg:'#ecfcf7', fg:BRAND.emerald }} label="Manufacturer" value={asset?.manufacturer} />
                      <Tile icon={Box}           color={{ bg:'#f7eefe', fg:'#7a1896' }} label="Model" value={asset?.model} />
                      <Tile icon={CalendarCheck} color={{ bg:'#fff8e8', fg:'#9a6a00' }} label="Installed" value={fmt(asset?.install_date)} />
                      <Tile icon={CalendarCheck} color={{ bg:'#eefcf4', fg:BRAND.emerald }} label="Calibration Done" value={fmt(asset?.calibration_done_on)} />
                      <div className="md:col-span-2">
                        <Tile icon={CalendarClock} color={{ bg:'#fff2f1', fg:'#b42318' }} label="Calibration Due" value={fmt(asset?.calibration_due_on)} />
                      </div>

                      <div className="md:col-span-2 rounded-xl border bg-white/90 shadow-sm p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ring-1" style={{ color:'#9b1c7b', background:'#fdf0fb' }}>
                            <QrCode size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">QR Token (UUID)</div>
                            <div className="text-[13px] sm:text-sm font-mono break-all mt-1">
                              {asset?.qr_token || asset?.public_token || '—'}
                            </div>
                            {(asset?.qr_token || asset?.public_token) && (
                              <button
                                className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-white hover:bg-slate-50 text-xs"
                                onClick={() => copy(asset?.qr_token || asset?.public_token)}
                              >
                                <Copy size={14} /> Copy
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {!loading && (
                  <div className="mt-5 rounded-xl border bg-slate-50 px-4 py-3 text-sm flex flex-wrap gap-x-8 gap-y-2">
                    <div><span className="text-slate-500">Code:</span> <span className="font-medium">{asset?.asset_code || '—'}</span></div>
                    <div className="min-w-[12rem]"><span className="text-slate-500">Name:</span> <span className="font-medium">{asset?.name || '—'}</span></div>
                    <div><span className="text-slate-500">Serial:</span> <span className="font-medium">{asset?.serial_no || '—'}</span></div>
                    <div className="flex items-center gap-2"><span className="text-slate-500">Status:</span> <StatusBadge status={asset?.status} /></div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Equipment ID</div>
                  <IconInput icon={Tag} value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} placeholder="HVAC-001" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Equipment Name</div>
                  <IconInput icon={Package} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Air Handler AHU-1" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Status</div>
                  <IconSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option>Active</option>
                    <option>Out of Service</option>
                    <option>Retired</option>
                  </IconSelect>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Serial #</div>
                  <IconInput icon={Tag} value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} placeholder="SN-123" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Manufacturer</div>
                  <IconInput icon={Factory} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Trane" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Model</div>
                  <IconInput icon={Box} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="T-500" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Installed</div>
                  <IconInput icon={CalendarCheck} type="date" value={form.install_date || ''} onChange={(e) => setForm({ ...form, install_date: e.target.value })} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Calibration Done</div>
                  <IconInput icon={CalendarCheck} type="date" value={form.calibration_done_on || ''} onChange={(e) => setForm({ ...form, calibration_done_on: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Calibration Due</div>
                  <IconInput icon={CalendarClock} type="date" value={form.calibration_due_on || ''} onChange={(e) => setForm({ ...form, calibration_due_on: e.target.value })} />
                </div>
                <div className="md:col-span-2 rounded-xl border bg-slate-50 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">QR Token (read-only)</div>
                  <div className="mt-1 font-mono text-xs break-all">{form.qr_token || form.public_token || '—'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentDetail;
