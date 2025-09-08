import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Input from '../../ui/input';
import Button from '../../ui/button';
import { Card } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { supabase } from '../../../utils/supabaseClient';
import { Search, Truck, ClipboardList, Package, SquareArrowOutUpRight } from 'lucide-react';

const badge = (s='') => {
  const k = s.toLowerCase();
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';
  if (['released','qa approved','ok'].includes(k)) return `${base} bg-emerald-100 text-emerald-700 border-emerald-200`;
  if (['submitted','pending qa'].includes(k)) return `${base} bg-sky-100 text-sky-700 border-sky-200`;
  if (['rejected','qa rejected','not ok'].includes(k)) return `${base} bg-rose-100 text-rose-700 border-rose-200`;
  if (['draft'].includes(k)) return `${base} bg-slate-100 text-slate-700 border-slate-200`;
  return `${base} bg-slate-100 text-slate-600 border-slate-200`;
};

export default function GatePassIndex() {
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { gpNo } = useParams() || {};

  const fetchList = useCallback(async (q) => {
    setLoading(true);
    // 1) gate passes
    const gpQuery = supabase
      .from('inbound_gate_entries')
      .select('id,gate_pass_no,created_at,transporter_name,vehicle_no,driver_name')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    const { data: gates, error } = await gpQuery;
    if (error) { setRows([]); setLoading(false); return; }
    const list = Array.isArray(gates) ? gates : [];

    // 2) statuses: fetch latest per GP from vehicle_inspections & material_inspections
    const gps = list.map((g) => g.gate_pass_no).filter(Boolean);
    let vMap = new Map(), mMap = new Map();
    if (gps.length) {
      const [{ data: v }, { data: m }] = await Promise.all([
        supabase.from('vehicle_inspections').select('gate_pass_no,status,updated_at').in('gate_pass_no', gps),
        supabase.from('material_inspections').select('gate_pass_no,materials,status,updated_at').in('gate_pass_no', gps),
      ]);
      (v || []).forEach(r => vMap.set(r.gate_pass_no, r.status || 'Draft'));
      (m || []).forEach(r => {
        // summarize materials: Released if any row Released; Submitted if any Submitted; else Draft
        const mats = Array.isArray(r.materials) ? r.materials : [];
        const hasReleased = mats.some(x => (x.status||'').toLowerCase()==='released');
        const hasSubmitted = mats.some(x => (x.status||'').toLowerCase()==='submitted');
        const s = hasReleased ? 'Released' : hasSubmitted ? 'Submitted' : (r.status || 'Draft');
        mMap.set(r.gate_pass_no, s);
      });
    }

    const filtered = (q ? list.filter(g => String(g.gate_pass_no).toLowerCase().includes(q.toLowerCase())) : list)
      .map(g => ({
        ...g,
        vi_status: vMap.get(g.gate_pass_no) || 'Not started',
        mi_status: mMap.get(g.gate_pass_no) || 'Not started',
      }));

    setRows(filtered);
    setLoading(false);
  }, []);

  useEffect(() => { fetchList(''); }, [fetchList]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-5 h-5 text-blue-700" />
        <div className="font-medium">Gate Passes</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-blue-700" />
            <Input
              className="pl-8 h-9"
              placeholder="Search gate pass no…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchList(term); }}
            />
          </div>
          <Button variant="outline" onClick={() => fetchList(term)} className="h-9">Search</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_,i)=><Skeleton key={i} className="h-12"/>)}</div>
      ) : (
        <div className="overflow-auto border rounded">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3 border-b">Gate Pass</th>
                <th className="text-left p-3 border-b">Created</th>
                <th className="text-left p-3 border-b">Transporter / Vehicle</th>
                <th className="text-left p-3 border-b">Vehicle Inspection</th>
                <th className="text-left p-3 border-b">Material Inspection</th>
                <th className="text-left p-3 border-b w-48">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((g) => (
                <tr key={g.id} className="odd:bg-white even:bg-slate-50/50">
                  <td className="p-3 border-b font-medium">{g.gate_pass_no}</td>
                  <td className="p-3 border-b">{new Date(g.created_at).toLocaleString()}</td>
                  <td className="p-3 border-b">
                    <div className="text-slate-800">{g.transporter_name || '-'}</div>
                    <div className="text-[11px] text-slate-500">{g.vehicle_no || ''}</div>
                  </td>
                  <td className="p-3 border-b"><span className={badge(g.vi_status)}>{g.vi_status}</span></td>
                  <td className="p-3 border-b"><span className={badge(g.mi_status)}>{g.mi_status}</span></td>
                  <td className="p-3 border-b">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/${encodeURIComponent(g.gate_pass_no)}/gate-entry`}>
                        <Button size="sm" variant="outline" className="h-8">
                          <Truck className="w-4 h-4 mr-1" /> Gate Entry
                        </Button>
                      </Link>
                      <Link to={`/${encodeURIComponent(g.gate_pass_no)}/inspection/vehicle`}>
                        <Button size="sm" variant="outline" className="h-8">
                          <Package className="w-4 h-4 mr-1" /> Vehicle
                        </Button>
                      </Link>
                      <Link to={`/${encodeURIComponent(g.gate_pass_no)}/inspection/material`}>
                        <Button size="sm" className="h-8">
                          <SquareArrowOutUpRight className="w-4 h-4 mr-1" /> Material
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="p-4 text-slate-500" colSpan={6}>No gate passes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
