import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import toast, { Toaster } from 'react-hot-toast';
import {
  Package, Tag, Save, X, Edit3, Trash2, QrCode, Printer, Plus, Trash, Factory, Box, CheckCircle2
} from 'lucide-react';
import { getLogoDataURL, makeQR, printHTMLViaIframe } from '../utils/print';
import logo from '../assets/logo.png';
import { useUOM } from '../contexts/UOMContext';

const cls = (...a) => a.filter(Boolean).join(' ');

const PartDetail = () => {
  const { id, code } = useParams();
  const nav = useNavigate();
  const { uoms } = useUOM() || { uoms: [] };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [part, setPart] = useState(null);
  const [edit, setEdit] = useState(false);

  const [plants, setPlants] = useState([]);
  const [plantIdByUid, setPlantIdByUid] = useState({});
  const [form, setForm] = useState({
    part_code: '', part_name: '', description: '', uom_uid: null, active: true, is_quarantine: false
  });
  const [locRows, setLocRows] = useState([]);

  const title = useMemo(() => part?.part_name || part?.part_code || 'Part', [part]);

  const resolveByCodeIfNeeded = async () => {
    if (!id && code) {
      const r = await supabase.from('part_master').select('id').eq('part_code', code).maybeSingle();
      if (r.error || !r.data) throw new Error('Part not found');
      return r.data.id;
    }
    return id;
  };

  const loadPlants = async () => {
    const r = await supabase.from('plant_master').select('id,plant_id').order('plant_id');
    if (!r.error) {
      setPlants(r.data || []);
      const m = {};
      (r.data || []).forEach(x => { m[x.id] = x.plant_id; });
      setPlantIdByUid(m);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      await loadPlants();
      const pid = await resolveByCodeIfNeeded();

      const pm = await supabase
        .from('part_master')
        .select('*')
        .eq('id', pid)
        .maybeSingle();
      if (pm.error || !pm.data) throw new Error('Part not found');

      const pl = await supabase
        .from('part_location')
        .select('id,plant_uid,bin_code,min_qty,max_qty,qty_on_hand,reorder_point,supplier_name,lead_time_days')
        .eq('part_uid', pid);

      setPart(pm.data);
      setForm({
        part_code: pm.data.part_code || '',
        part_name: pm.data.part_name || '',
        description: pm.data.description || '',
        uom_uid: pm.data.uom_uid || null,
        active: !!pm.data.active,
        is_quarantine: !!pm.data.is_quarantine
      });
      setLocRows((pl.data || []).map(x => ({
        id: x.id,
        plant_uid: x.plant_uid,
        plant_id: '',
        bin_code: x.bin_code || '',
        min_qty: x.min_qty || 0,
        max_qty: x.max_qty || 0,
        qty_on_hand: x.qty_on_hand || 0,
        reorder_point: x.reorder_point || 0,
        supplier_name: x.supplier_name || '',
        lead_time_days: x.lead_time_days ?? ''
      })));
    } catch (e) {
      toast.error(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, code]);

  const resolveUomUid = (uom_code) => uoms.find(u => u.uom_code === uom_code)?.id || null;

  const save = async () => {
    setSaving(true);
    await toast.promise((async () => {
      if (!form.part_code.trim() || !form.part_name.trim()) throw new Error('Part Code & Name required');

      const payloadPM = {
        part_code: form.part_code.trim(),
        part_name: form.part_name.trim(),
        description: form.description || '',
        uom_uid: form.uom_uid || null,
        is_quarantine: !!form.is_quarantine,
        active: !!form.active
      };
      const { error: e1 } = await supabase.from('part_master').update(payloadPM).eq('id', part.id);
      if (e1) throw e1;

      // Upsert locations (simple strategy)
      for (const row of locRows) {
        // allow choosing plant by code if user typed it
        let plant_uid = row.plant_uid;
        if (!plant_uid && row.plant_id) {
          const p = await supabase.from('plant_master').select('id').ilike('plant_id', row.plant_id).maybeSingle();
          if (!p.error) plant_uid = p.data?.id || null;
        }
        if (!plant_uid) {
          const p = await supabase.from('plant_master').select('id').ilike('plant_id', 'Plant1').maybeSingle();
          plant_uid = p.data?.id || null;
        }
        const payloadPL = {
          part_uid: part.id,
          plant_uid,
          bin_code: row.bin_code || null,
          min_qty: Number(row.min_qty || 0),
          max_qty: Number(row.max_qty || 0),
          qty_on_hand: Number(row.qty_on_hand || 0),
          reorder_point: Number(row.reorder_point || 0),
          supplier_name: row.supplier_name || null,
          lead_time_days: row.lead_time_days === '' ? null : Number(row.lead_time_days)
        };
        if (row.id) {
          const { error } = await supabase.from('part_location').update(payloadPL).eq('id', row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('part_location').insert([payloadPL]);
          if (error) throw error;
        }
      }

      await load();
      setEdit(false);
    })(), {
      loading: 'Saving…',
      success: 'Saved',
      error: (e) => e?.message || 'Save failed'
    }).finally(() => setSaving(false));
  };

  const addRow = () =>
    setLocRows(prev => prev.concat([{
      id: null, plant_uid: null, plant_id: 'Plant1', bin_code: '', min_qty: 0, max_qty: 0,
      qty_on_hand: 0, reorder_point: 0, supplier_name: '', lead_time_days: ''
    }]));

  const delRow = async (idx) => {
    const row = locRows[idx];
    if (row.id) {
      const ok = window.confirm('Delete this location row?');
      if (!ok) return;
      const { error } = await supabase.from('part_location').delete().eq('id', row.id);
      if (error) return toast.error(error.message);
    }
    setLocRows(prev => prev.filter((_, i) => i !== idx));
  };

  const onPrintPartLabel = async () => {
    const logoURL = await getLogoDataURL(logo);
    const defaultPlant = locRows[0] ? (plantIdByUid[locRows[0].plant_uid] || locRows[0].plant_id || 'Plant1') : 'Plant1';
    const defaultBin = locRows[0]?.bin_code || null;
    const qr = await makeQR(JSON.stringify({
      type: 'part',
      part_uid: part.id,
      part_code: part.part_code,
      plant_id: defaultPlant,
      bin_code: defaultBin,
      uom: uoms.find(u => u.id === form.uom_uid)?.uom_code || null
    }));

    const w = 50, h = 38;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Part Label</title>
      <style>
        @page{margin:8mm} body{font-family:Arial,Helvetica,sans-serif}
        .card{width:${w}mm;height:${h}mm;border:1px solid #cbd5e1;border-radius:6px;padding:3mm;display:flex;flex-direction:column;justify-content:space-between}
        .hdr{display:flex;gap:6px;align-items:center} .hdr img{height:10mm} .title{font-weight:700;font-size:12px}
        .sub{font-size:10px;color:#374151;margin-top:2px}
        .kv{font-size:10px;color:#111}
        .qr{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .qr img{max-height:16mm;max-width:100%} .cap{font-size:10px;color:#6b7280;margin-top:2px}
      </style></head><body>
        <div class="card">
          <div class="hdr">${logoURL ? `<img src="${logoURL}" alt="logo"/>` : ''}<div class="title">${(form.part_name || '').replace(/</g,'&lt;')}</div></div>
          <div class="sub">ID: ${(form.part_code || '').replace(/</g,'&lt;')}</div>
          <div class="kv">UOM: ${uoms.find(u => u.id === form.uom_uid)?.uom_code || '-'} • Bin: ${defaultBin || '-'}</div>
          <div class="qr"><img src="${qr}" alt="QR"/><div class="cap">QR • ${(String(part.id).slice(0,4)+'…'+String(part.id).slice(-4))}</div></div>
        </div>
      </body></html>`;
    printHTMLViaIframe(html);
  };

  const onDelete = async () => {
    const ok = window.confirm(`Delete part "${form.part_code}"? This also removes its locations.`);
    if (!ok) return;
    await toast.promise(
      supabase.from('part_master').delete().eq('id', part.id),
      { loading: 'Deleting…', success: 'Deleted', error: (e) => e?.message || 'Delete failed' }
    );
    nav(-1);
  };

  return (
    <div className="px-3 py-4 sm:p-6">
      <Toaster position="top-right"/>
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border shadow-sm bg-white/80 overflow-hidden">
          <div className="p-4 border-b bg-gradient-to-r from-[#ecf2ff] via-[#f2f7ff] to-[#eefcf6]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#eef2ff] text-[#143C8B] flex items-center justify-center ring-1"><Package size={18}/></div>
                <div>
                  <div className="text-xl font-extrabold text-[#143C8B]">{loading ? 'Loading…' : title}</div>
                  <div className="text-xs text-slate-600">{loading ? '' : (part?.part_code || '—')}</div>
                </div>
              </div>
              {!loading && (
                <div className="flex flex-wrap gap-2">
                  {!edit ? (
                    <>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50" onClick={() => setEdit(true)}><Edit3 size={16}/> Edit</button>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50" onClick={onPrintPartLabel}><Printer size={16}/> Print Label</button>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100" onClick={onDelete}><Trash2 size={16}/> Delete</button>
                    </>
                  ) : (
                    <>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white hover:opacity-95" style={{background:'#0F7A5A'}} onClick={save} disabled={saving}><Save size={16}/> Save</button>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50" onClick={() => { setEdit(false); setForm(f => ({ ...f, part_code: part.part_code, part_name: part.part_name, description: part.description, uom_uid: part.uom_uid, active: part.active, is_quarantine: part.is_quarantine })); }}><X size={16}/> Cancel</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {!edit ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border bg-white/90 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Part Code</div>
                    <div className="mt-1 text-sm font-medium">{part?.part_code || '—'}</div>
                  </div>
                  <div className="rounded-xl border bg-white/90 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Part Name</div>
                    <div className="mt-1 text-sm font-medium">{part?.part_name || '—'}</div>
                  </div>
                  <div className="rounded-xl border bg-white/90 p-4 md:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Description</div>
                    <div className="mt-1 text-sm">{part?.description || '—'}</div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border bg-white/90 p-4">
                  <div className="text-sm font-semibold mb-2">Locations</div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr><th className="p-2 text-left">Plant</th><th className="p-2 text-left">Bin</th><th className="p-2 text-left">QOH</th><th className="p-2 text-left">Reorder</th></tr>
                      </thead>
                      <tbody>
                        {locRows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{plantIdByUid[r.plant_uid] || '—'}</td>
                            <td className="p-2">{r.bin_code || '—'}</td>
                            <td className="p-2">{r.qty_on_hand ?? '—'}</td>
                            <td className="p-2">{r.reorder_point ?? '—'}</td>
                          </tr>
                        ))}
                        {!locRows.length && <tr><td className="p-3 text-slate-500" colSpan={4}>No locations.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Part Code</div>
                    <input className="w-full border rounded px-3 py-2 text-sm" value={form.part_code} onChange={(e) => setForm({ ...form, part_code: e.target.value })}/>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Part Name</div>
                    <input className="w-full border rounded px-3 py-2 text-sm" value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })}/>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Description</div>
                    <textarea className="w-full border rounded px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">UOM</div>
                    <select className="w-full border rounded px-3 py-2 text-sm" value={form.uom_uid || ''} onChange={(e) => setForm({ ...form, uom_uid: e.target.value || null })}>
                      <option value="">—</option>
                      {uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Active</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_quarantine} onChange={(e) => setForm({ ...form, is_quarantine: e.target.checked })}/> Quarantine</label>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">Locations</div>
                    <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border bg-white hover:bg-slate-50 text-sm" onClick={addRow}><Plus size={16}/> Add Row</button>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 text-left">Plant</th><th className="p-2 text-left">Bin</th><th className="p-2">Min</th><th className="p-2">Max</th>
                          <th className="p-2">Reorder</th><th className="p-2">QOH</th><th className="p-2 text-left">Supplier</th><th className="p-2">Lead(d)</th><th className="p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              <select className="border rounded p-1" value={row.plant_uid || ''} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx] = { ...n[idx], plant_uid: e.target.value || null, plant_id: '' }; return n; })}>
                                <option value="">(choose)</option>
                                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_id}</option>)}
                              </select>
                            </td>
                            <td className="p-2"><input className="border rounded p-1 w-28" value={row.bin_code} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx] = { ...n[idx], bin_code: e.target.value }; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-20" type="number" step="any" value={row.min_qty} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].min_qty = e.target.value; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-20" type="number" step="any" value={row.max_qty} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].max_qty = e.target.value; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-24" type="number" step="any" value={row.reorder_point} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].reorder_point = e.target.value; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-24" type="number" step="any" value={row.qty_on_hand} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].qty_on_hand = e.target.value; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-36" value={row.supplier_name} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].supplier_name = e.target.value; return n; })}/></td>
                            <td className="p-2"><input className="border rounded p-1 w-20" type="number" value={row.lead_time_days} onChange={e => setLocRows(prev => { const n=[...prev]; n[idx].lead_time_days = e.target.value; return n; })}/></td>
                            <td className="p-2 text-center"><button className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-slate-50" onClick={() => delRow(idx)}><Trash size={14}/></button></td>
                          </tr>
                        ))}
                        {!locRows.length && <tr><td className="p-2 text-slate-500" colSpan={9}>No locations. Add a row.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartDetail;
