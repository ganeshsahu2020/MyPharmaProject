// src/components/submodules/Engineering/BreakdownManagement.jsx
// Objective: Fast, compliant breakdown logging with RCA/CAPA, spares, analytics, SOP, & printable Closed Ticket report.
// Notes: Requires Supabase Storage bucket `breakdowns`. All writes use toast.promise for UX.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

import {
  Wrench, Factory, Building2, Spline, LayoutGrid, Cog, ShieldAlert, Flag,
  Paperclip, RefreshCw, Search, Plus, Save, CheckCircle2, XCircle, Play,
  StopCircle, Layers, Printer, FileDown, Clock4, TrendingUp, BarChart3, PieChart,
  FileText, Inbox
} from 'lucide-react';

import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line
} from 'recharts';

import logo from '../../../assets/logo.png';
/* ===== Pretty chart helpers (drop near top) ===== */
const ChartCard = ({ title, subtitle, height=260, children }) => (
  <Card className="p-4">
    <div className="mb-2">
      <div className="text-sm font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
    <div style={{ width: '100%', height }}>
      {children}
    </div>
  </Card>
);

const ValueTile = ({ label, value, Icon, className }) => (
  <Card className={`p-4 flex items-center justify-between ${className||''}`}>
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
    {Icon ? <Icon /> : null}
  </Card>
);

/* Recharts gradient defs to get the nice “colorful” look */
const ChartDefs = () => (
  <defs>
    <linearGradient id="gPrimary" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#60a5fa" stopOpacity="1"/>
      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.85"/>
    </linearGradient>
    <linearGradient id="gEmerald" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#86efac" />
      <stop offset="100%" stopColor="#10b981" />
    </linearGradient>
    <linearGradient id="gAmber" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#fcd34d" />
      <stop offset="100%" stopColor="#f59e0b" />
    </linearGradient>
    <linearGradient id="gRose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#fda4af" />
      <stop offset="100%" stopColor="#f43f5e" />
    </linearGradient>
    <linearGradient id="gIndigo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#a5b4fc" />
      <stop offset="100%" stopColor="#6366f1" />
    </linearGradient>
  </defs>
);

/* Shared tooltip: bold number, small label */
const prettyNum = (n) => (typeof n === 'number' ? n.toLocaleString() : n);
const TooltipBox = ({active, payload, label})=>{
  if(!active || !payload || !payload.length) return null;
  return (
    <div className="rounded border bg-white p-2 text-xs shadow">
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p,i)=>(
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded" style={{background:p.color}} />
          <span className="text-slate-500">{p.name}:</span>
          <b>{prettyNum(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

/* ---------------------- Config ---------------------- */
const SLA_HOURS_BY_SEVERITY = { Critical: 2, Major: 8, Minor: 24 };
const fmt = (d) => (d ? new Date(d).toLocaleString() : '');
const diffHrs = (a, b) => { if (!a || !b) return null; return Math.max(0, (new Date(b) - new Date(a)) / 36e5); };
const csv = (rows) => rows.map((r) => Object.values(r).map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');

/* ==================================================== */
/* =============== Helper UI Components =============== */
/* ==================================================== */

const iconTheme = {
  plant:    { Icon: Factory,     className: 'text-sky-600' },
  subplant: { Icon: Building2,   className: 'text-indigo-600' },
  dept:     { Icon: LayoutGrid,  className: 'text-violet-600' },
  area:     { Icon: Spline,      className: 'text-fuchsia-600' },
  eqp:      { Icon: Cog,         className: 'text-emerald-600' },
  severity: { Icon: ShieldAlert, className: 'text-rose-600' },
  priority: { Icon: Flag,        className: 'text-amber-600' },
  desc:     { Icon: FileText,    className: 'text-slate-600' },
  action:   { Icon: Inbox,       className: 'text-slate-600' },
};

function IconField({ icon, label, children, colSpan=false }) {
  const { Icon, className } = iconTheme[icon] || { Icon: FileText, className: 'text-slate-500' };
  return (
    <div className={colSpan ? 'sm:col-span-2' : ''}>
      <label className="text-xs font-medium text-slate-600 flex items-center gap-2 mb-1">
        <Icon size={16} className={className} /> {label}
      </label>
      <div className="relative">
        <Icon size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${className}`} />
        {React.cloneElement(children, { className: `w-full border rounded pl-9 pr-2 py-2 ${children.props.className || ''}` })}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Open:          'bg-rose-100 text-rose-700 border-rose-300',
    Acknowledged:  'bg-amber-100 text-amber-700 border-amber-300',
    'In-Progress': 'bg-sky-100 text-sky-700 border-sky-300',
    Restored:      'bg-emerald-100 text-emerald-700 border-emerald-300',
    Closed:        'bg-slate-200 text-slate-700 border-slate-300',
    Cancelled:     'bg-zinc-100 text-zinc-600 border-zinc-300',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${map[status] || 'bg-slate-100 text-slate-700 border-slate-300'}`}>{status}</span>;
}

function SkeletonBlock({ rows=6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_,i)=>(
        <div key={i} className="h-8 rounded bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

/* ==================================================== */
/* =================== Main Component ================= */
/* ==================================================== */

export default function BreakdownManagement() {
  const { user } = useAuth();

  const [mastersLoading, setMastersLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [tab, setTab] = useState('Report');

  const [masters, setMasters] = useState({ plants:[], subplants:[], departments:[], areas:[], equipment:[] });
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ q:'', severity:'', priority:'', status:'' });

  const [form, setForm] = useState({
    plant_uid:'', subplant_uid:'', department_uid:'', area_uid:'', equipment_uid:'',
    severity:'Critical', priority:'P1', description:'', immediate_action:'', attachments:[]
  });

  const [active, setActive] = useState(null);
  const [sparesRefresh, setSparesRefresh] = useState(0);
  const fileRef = useRef(null);

  /* --------------- Masters --------------- */
  useEffect(()=>{(async()=>{
    setMastersLoading(true);
    const [p,sp,d,a,e] = await Promise.all([
      supabase.from('plant_master').select('id,plant_name').order('plant_name'),
      supabase.from('subplant_master').select('id,subplant_name,plant_uid').order('subplant_name'),
      supabase.from('department_master').select('id,department_name,subplant_uid').order('department_name'),
      supabase.from('area_master').select('id,area_name,department_uid').order('area_name'),
      supabase.from('equipment_master').select('id,equipment_code,equipment_name,area_uid,status').order('equipment_name')
    ]);
    setMasters({
      plants:p.data||[], subplants:sp.data||[], departments:d.data||[], areas:a.data||[], equipment:e.data||[]
    });
    setMastersLoading(false);
  })();},[]);

  /* --------------- Tickets --------------- */
  const refreshTickets = async ()=>{
    setTicketsLoading(true);
    const { data, error } = await supabase
      .from('breakdown_ticket')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(500);
    if (error) { console.error(error); toast.error('Failed to load tickets'); }
    setTickets(data||[]);
    setTicketsLoading(false);
  };
  useEffect(()=>{ refreshTickets(); },[]);
  useEffect(()=>{
    const ch = supabase.channel('bd_tickets_rt').on(
      'postgres_changes',
      { event:'INSERT', schema:'public', table:'breakdown_ticket' },
      (payload)=>{
        const t = payload.new;
        if (t.severity === 'Critical') {
          toast((t.description || 'Critical breakdown reported'), { icon:'⚠️' });
        }
        refreshTickets();
      }
    ).subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[]);

  /* --------------- Helpers --------------- */
  const computeSLA = (severity)=>{
    const h = SLA_HOURS_BY_SEVERITY[severity] || 24;
    const d = new Date(); d.setHours(d.getHours()+h); return d.toISOString();
  };
  const onPickFiles = ()=> fileRef.current?.click();
  const onFiles = (e)=> setForm((x)=>({ ...x, attachments:[...e.target.files] }));

  const openTicket = (t)=>{ setActive(t); setTab('Queue'); };

  /* --------------- Create Ticket --------------- */
  const createTicket = async ()=>{
    if(!user?.id){ toast.error('Not signed in'); return; }
    if(!form.equipment_uid || !form.description){ toast.error('Equipment & Description required'); return; }

    const run = async ()=>{
      const { data:equipRec, error:equipErr } = await supabase
        .from('equipment_master').select('id').eq('id',form.equipment_uid).maybeSingle();
      if (equipErr) throw equipErr;
      if (!equipRec) throw new Error('Selected equipment not found. Please reselect.');

      const insert = {
        plant_uid:form.plant_uid||null, subplant_uid:form.subplant_uid||null,
        department_uid:form.department_uid||null, area_uid:form.area_uid||null,
        equipment_uid:form.equipment_uid, severity:form.severity, priority:form.priority,
        description:form.description, immediate_action:form.immediate_action||null,
        reported_by:user.id, status:'Open', sla_due_at:computeSLA(form.severity)
      };

      const { data:ins, error:insErr } = await supabase
        .from('breakdown_ticket').insert(insert).select('*').single();
      if (insErr) throw insErr;

      // attachments (optional)
      for (const f of form.attachments||[]) {
        const path = `${ins.id}/${Date.now()}-${f.name}`;
        const up = await supabase.storage.from('breakdowns').upload(path, f, { upsert:false });
        if (!up.error) {
          const { error:attErr } = await supabase
            .from('breakdown_attachment')
            .insert({ ticket_id:ins.id, file_path:path, uploaded_by:user.id });
          if (attErr) console.error(attErr);
        }
      }

      setForm({ plant_uid:'', subplant_uid:'', department_uid:'', area_uid:'', equipment_uid:'',
        severity:'Critical', priority:'P1', description:'', immediate_action:'', attachments:[] });
      await refreshTickets();
      setActive(ins);
      setTab('Queue');
      return 'Ticket created';
    };

    await toast.promise(run(), { loading:'Creating ticket…', success:(m)=>m, error:(e)=>e?.message||'Create failed' });
  };

  /* --------------- Status / RCA / CAPA --------------- */
  const updateTicketStatus = async (id, patch, label='Updating')=>{
    const run = async ()=>{
      const { error } = await supabase.from('breakdown_ticket').update(patch).eq('id',id);
      if (error) throw error;
      await refreshTickets();
      if (active?.id===id) {
        const { data } = await supabase.from('breakdown_ticket').select('*').eq('id',id).single();
        if (data) setActive(data);
      }
      return 'Updated';
    };
    await toast.promise(run(), { loading:`${label}…`, success:(m)=>m, error:(e)=>e?.message||'Update failed' });
  };

  const [rca,setRca] = useState({
    method:'5WHY', why1:'',why2:'',why3:'',why4:'',why5:'',
    fishbone_man:'',fishbone_machine:'',fishbone_method:'',
    fishbone_material:'',fishbone_measurement:'',fishbone_environment:'',
    root_cause:''
  });
  const [capa,setCapa] = useState({ action_type:'Preventive', action_title:'', action_detail:'', owner_email:'', due_date:'' });

  const addRCA = async (ticket_id,payload)=>{
    const rec = {
      ticket_id,
      method:payload.method,
      why1:payload.why1||null, why2:payload.why2||null, why3:payload.why3||null, why4:payload.why4||null, why5:payload.why5||null,
      fishbone_man:payload.fishbone_man||null, fishbone_machine:payload.fishbone_machine||null, fishbone_method:payload.fishbone_method||null,
      fishbone_material:payload.fishbone_material||null, fishbone_measurement:payload.fishbone_measurement||null, fishbone_environment:payload.fishbone_environment||null,
      root_cause:payload.root_cause||null, created_by:user?.id||null,
    };
    await toast.promise(
      supabase.from('breakdown_rca').insert(rec).then(({error})=>{ if(error) throw error; }),
      { loading:'Saving RCA…', success:'RCA saved', error:(e)=>e?.message||'RCA save failed' }
    );
  };

  const addCAPA = async (ticket_id,payload)=>{
    const rec = {
      ticket_id, action_type:payload.action_type, action_title:payload.action_title,
      action_detail:payload.action_detail||null, owner_email:payload.owner_email, due_date:payload.due_date,
      status:'Planned', created_by:user?.id||null
    };
    await toast.promise(
      supabase.from('breakdown_capa').insert(rec).then(({error})=>{ if(error) throw error; }),
      { loading:'Saving CAPA…', success:'CAPA saved', error:(e)=>e?.message||'CAPA save failed' }
    );
  };

  /* --------------- Filters --------------- */
  const filteredTickets = useMemo(()=>{
    return tickets.filter((t)=>{
      if(filters.q){
        const q = filters.q.toLowerCase();
        const hay = [t.ticket_no, t.description, t.priority, t.severity, t.status].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      if(filters.severity && t.severity!==filters.severity) return false;
      if(filters.priority && t.priority!==filters.priority) return false;
      if(filters.status && t.status!==filters.status) return false;
      return true;
    });
  },[tickets,filters]);

  /* --------------- Analytics helpers --------------- */
  const mapById = (arr)=>Object.fromEntries((arr||[]).map(x=>[x.id,x]));
  const plantBy = mapById(masters.plants);
  const subplantBy = mapById(masters.subplants);
  const deptBy = mapById(masters.departments);
  const areaBy = mapById(masters.areas);
  const equipBy = mapById(masters.equipment);

  const weeklyTrend = useMemo(()=>{
    const bucket={};
    filteredTickets.forEach(t=>{
      const d=new Date(t.created_at); if(!isFinite(d)) return;
      const monday=new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const day = monday.getUTCDay() || 7;
      monday.setUTCDate(monday.getUTCDate() - day + 1);
      const key=monday.toISOString().slice(0,10);
      bucket[key]=(bucket[key]||0)+1;
    });
    return Object.entries(bucket).sort((a,b)=>a[0]<b[0]?-1:1).map(([week_start,tickets])=>({week_start,tickets}));
  },[filteredTickets]);

  const mttrByDept = useMemo(()=>{
    const acc={};
    filteredTickets.forEach(t=>{
      const d=diffHrs(t.work_started_at,t.restored_at);
      if(d==null || !t.department_uid) return;
      acc[t.department_uid]=acc[t.department_uid]||{sum:0,n:0};
      acc[t.department_uid].sum+=d; acc[t.department_uid].n+=1;
    });
    return Object.entries(acc).map(([uid,{sum,n}])=>({
      name: deptBy[uid]?.department_name || '—', value: +(sum/n).toFixed(2)
    })).sort((a,b)=>b.value-a.value).slice(0,8);
  },[filteredTickets,deptBy]);

  const mttrByArea = useMemo(()=>{
    const acc={};
    filteredTickets.forEach(t=>{
      const d=diffHrs(t.work_started_at,t.restored_at);
      if(d==null || !t.area_uid) return;
      acc[t.area_uid]=acc[t.area_uid]||{sum:0,n:0};
      acc[t.area_uid].sum+=d; acc[t.area_uid].n+=1;
    });
    return Object.entries(acc).map(([uid,{sum,n}])=>({
      name: areaBy[uid]?.area_name || '—', value: +(sum/n).toFixed(2)
    })).sort((a,b)=>b.value-a.value).slice(0,8);
  },[filteredTickets,areaBy]);

  const topEquip90 = useMemo(()=>{
    const since = Date.now() - 90*864e5;
    const acc={};
    filteredTickets.forEach(t=>{
      const ct=new Date(t.created_at).getTime();
      if(isNaN(ct) || ct<since) return;
      acc[t.equipment_uid]=(acc[t.equipment_uid]||0)+1;
    });
    return Object.entries(acc).map(([uid,count])=>{
      const e=equipBy[uid];
      const label=e?`${(e.equipment_code||'').trim()} — ${e.equipment_name}`:'—';
      return {name:label, value:count};
    }).sort((a,b)=>b.value-a.value).slice(0,5);
  },[filteredTickets,equipBy]);

  const ageingBuckets = useMemo(()=>{
    const now=Date.now();
    const open = filteredTickets.filter(t=>t.status!=='Closed');
    const b = {b0_2:0,b2_8:0,b8_24:0,b24p:0};
    open.forEach(t=>{
      const hrs=(now - new Date(t.created_at).getTime())/36e5;
      if(hrs<2) b.b0_2++; else if(hrs<8) b.b2_8++; else if(hrs<24) b.b8_24++; else b.b24p++;
    });
    return b;
  },[filteredTickets]);

  const slaCompliance = useMemo(()=>{
    const closed = filteredTickets.filter(t=>t.restored_at && t.sla_due_at);
    const ontime = closed.filter(t=>new Date(t.restored_at).getTime() <= new Date(t.sla_due_at).getTime()).length;
    const pct = closed.length? Math.round(100*ontime/closed.length):0;
    return {pct, ontime, total:closed.length};
  },[filteredTickets]);

  /* --------------- Report --------------- */
  const printTicketReport = async (t)=>{
    if(!t) return;

    const [rcaRes,capaRes,spRes,attRes]=await Promise.all([
      supabase.from('breakdown_rca').select('*').eq('ticket_id',t.id).order('created_at',{ascending:false}),
      supabase.from('breakdown_capa').select('*').eq('ticket_id',t.id).order('created_at',{ascending:true}),
      supabase.from('breakdown_spares_used').select('qty_used, part_master(part_code,part_name)').eq('ticket_id',t.id),
      supabase.from('breakdown_attachment').select('*').eq('ticket_id',t.id)
    ]);
    const rca = rcaRes.data?.[0];
    const capas = capaRes.data||[];
    const spares = spRes.data||[];
    const atts = attRes.data||[];

    const eq = equipBy[t.equipment_uid];
    const area = areaBy[t.area_uid];
    const dept = deptBy[t.department_uid];
    const sp = subplantBy[t.subplant_uid];
    const plant = plantBy[t.plant_uid];

    const html = `
<!doctype html><html>
<head>
<meta charset="utf-8" />
<title>${t.ticket_no} — Breakdown Report</title>
<style>
  :root{
    --fg:#0f172a; --muted:#64748b; --bd:#e2e8f0; --chip:#eef2ff; --brand:#2563eb;
  }
  body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--fg); margin:28px;}
  .row{display:flex; align-items:center; gap:12px}
  h1{font-size:22px;margin:0}
  h2{font-size:16px;margin:18px 0 8px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .box{border:1px solid var(--bd);border-radius:10px;padding:12px}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th,td{border:1px solid var(--bd);padding:8px;text-align:left;font-size:12px}
  .muted{color:var(--muted);font-size:12px}
  .chip{background:var(--chip);display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;margin-left:6px}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  img.logo{height:28px}
</style>
</head>
<body>
  <div class="head">
    <div class="row">
      <img src="${logo}" class="logo" />
      <h1>Breakdown Report — ${t.ticket_no}</h1>
    </div>
    <div class="chip">${t.severity}/${t.priority}</div>
  </div>
  <div class="muted">Status: ${t.status}</div>

  <h2>Context</h2>
  <div class="grid">
    <div class="box">
      <b>Site</b><br/>
      ${plant?.plant_name||'-'}<br/>
      ${sp?.subplant_name||'-'}<br/>
      ${dept?.department_name||'-'}<br/>
      ${area?.area_name||'-'}
    </div>
    <div class="box">
      <b>Equipment</b><br/>
      ${(eq?.equipment_code||'').trim()} — ${eq?.equipment_name||'-'}
    </div>
  </div>

  <h2>Timeline</h2>
  <table>
    <tr><th>Created</th><td>${fmt(t.created_at)||'-'}</td></tr>
    <tr><th>Acknowledged</th><td>${fmt(t.acknowledged_at)||'-'}</td></tr>
    <tr><th>Work Started</th><td>${fmt(t.work_started_at)||'-'}</td></tr>
    <tr><th>Restored</th><td>${fmt(t.restored_at)||'-'}</td></tr>
    <tr><th>Closed</th><td>${fmt(t.closed_at)||'-'}</td></tr>
    <tr><th>SLA Due</th><td>${fmt(t.sla_due_at)||'-'}</td></tr>
  </table>

  <h2>Description</h2>
  <div class="box">${(t.description||'').replaceAll('<','&lt;')}</div>

  <h2>Immediate Action</h2>
  <div class="box">${(t.immediate_action||'-').replaceAll('<','&lt;')}</div>

  <h2>RCA</h2>
  <div class="box">
    ${rca?`
      <div><b>Method:</b> ${rca.method||'-'}</div>
      <div><b>Root Cause:</b> ${rca.root_cause||'-'}</div>
      <div><b>5WHY:</b> ${(rca.why1||'-')} / ${(rca.why2||'-')} / ${(rca.why3||'-')} / ${(rca.why4||'-')} / ${(rca.why5||'-')}</div>
    `:'No RCA recorded'}
  </div>

  <h2>CAPA</h2>
  <table>
    <tr><th>Type</th><th>Title</th><th>Owner</th><th>Due Date</th><th>Status</th></tr>
    ${capas.map(c=>`<tr><td>${c.action_type}</td><td>${c.action_title}</td><td>${c.owner_email||''}</td><td>${c.due_date||''}</td><td>${c.status||''}</td></tr>`).join('') || '<tr><td colspan="5">No CAPA</td></tr>'}
  </table>

  <h2>Spares Used</h2>
  <table>
    <tr><th>Part</th><th>Qty</th></tr>
    ${spares.map(s=>`<tr><td>${s.part_master?.part_code||''} — ${s.part_master?.part_name||''}</td><td>${s.qty_used||''}</td></tr>`).join('') || '<tr><td colspan="2">No spares recorded</td></tr>'}
  </table>

  <h2>Attachments</h2>
  <ul>
    ${atts.map(a=>`<li>${a.file_path}</li>`).join('') || '<li>No attachments</li>'}
  </ul>

  <script>window.print()</script>
</body></html>`;
    const w=window.open('','_blank'); if(!w){toast.error('Popup blocked'); return;}
    w.document.write(html); w.document.close();
  };

  /* --------------- Templates / Export --------------- */
  const templateBreakdown = [
    {field:'date_time',example:new Date().toISOString()},
    {field:'reported_by_email',example:user?.email||'engineer@digitizerx.space'},
    {field:'equipment_code',example:'MIX-101'},
    {field:'severity',example:'Critical'},
    {field:'priority',example:'P1'},
    {field:'description',example:'Mixer stopped with high vibration'},
    {field:'immediate_action',example:'Isolated machine, tagged out'},
  ];
  const templateRCA  = [
    {field:'method',example:'5WHY'},
    {field:'why1',example:'Bearing overheated'},
    {field:'why2',example:'Lubrication failure'},
    {field:'why3',example:'Blocked line'},
    {field:'root_cause',example:'Preventive lubrication not performed'},
  ];
  const templateCAPA = [
    {field:'action_type',example:'Preventive'},
    {field:'action_title',example:'Add weekly lubrication checklist'},
    {field:'owner_email',example:'qa@digitizerx.space'},
    {field:'due_date',example:new Date(Date.now()+7*864e5).toISOString().slice(0,10)},
  ];

  const downloadJSON=(name,obj)=>{
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  };
  const downloadCSV=(name,rows)=>{
    const hdr=Object.keys(rows[0]||{}).join(','); const body=csv(rows);
    const blob=new Blob([hdr+'\n'+body],{type:'text/csv'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  };

  /* --------------- Analytics (tiles + charts) --------------- */
  const mttrAvg = useMemo(()=>{
    const arr=filteredTickets.map(t=>diffHrs(t.work_started_at,t.restored_at)).filter(x=>x!=null);
    if(!arr.length) return 0; return (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2);
  },[filteredTickets]);
  const mtbfAvg = useMemo(()=>{
    const byEq={}; filteredTickets.filter(t=>t.restored_at).forEach(t=>{
      byEq[t.equipment_uid]=byEq[t.equipment_uid]||[]; byEq[t.equipment_uid].push(new Date(t.restored_at).getTime());
    });
    let gaps=[]; Object.values(byEq).forEach(arr=>{arr.sort((a,b)=>a-b); for(let i=1;i<arr.length;i++) gaps.push((arr[i]-arr[i-1])/36e5);});
    if(!gaps.length) return 0; return (gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2);
  },[filteredTickets]);
  const criticalOpen = filteredTickets.filter(t=>t.severity==='Critical'&&t.status!=='Closed').length;
  const dueSoon = filteredTickets.filter(t=>t.sla_due_at && new Date(t.sla_due_at)-Date.now()<2*3600*1000 && t.status!=='Closed').length;

  /* ==================================================== */
  /* ====================== UI ========================== */
  /* ==================================================== */

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="text-sky-600" />
          <h1 className="text-xl font-semibold">Breakdown Management</h1>
          <span className="text-[11px] ml-2 px-2 py-0.5 rounded bg-slate-100">
            GMP / FDA / WHO compliant logging + RCA/CAPA
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={()=>downloadJSON('BreakdownReportTemplate.json',templateBreakdown)} variant="outline" className="gap-1"><FileDown size={16}/>Report JSON</Button>
          <Button onClick={()=>downloadJSON('RCA_Template.json',templateRCA)} variant="outline" className="gap-1"><FileDown size={16}/>RCA JSON</Button>
          <Button onClick={()=>downloadJSON('CAPA_Template.json',templateCAPA)} variant="outline" className="gap-1"><FileDown size={16}/>CAPA JSON</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['Report','Queue','Analytics','SOP'].map((t)=>
          <Button key={t} onClick={()=>setTab(t)} variant={tab===t?'default':'outline'} className="px-3 py-1">{t}</Button>
        )}
      </div>

      {/* Report */}
      {tab==='Report' && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5 md:col-span-2 space-y-4">
            {mastersLoading ? (
              <SkeletonBlock rows={10}/>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <IconField icon="plant" label="Plant">
                    <select value={form.plant_uid}
                      onChange={(e)=>setForm((x)=>({ ...x, plant_uid:e.target.value, subplant_uid:'', department_uid:'', area_uid:'', equipment_uid:'' }))}>
                      <option value="">Select plant / site</option>
                      {(masters.plants||[]).map((p)=><option key={p.id} value={p.id}>{p.plant_name}</option>)}
                    </select>
                  </IconField>

                  <IconField icon="subplant" label="Sub-Plant / Block">
                    <select value={form.subplant_uid}
                      onChange={(e)=>setForm((x)=>({ ...x, subplant_uid:e.target.value, department_uid:'', area_uid:'', equipment_uid:'' }))}>
                      <option value="">Select sub-plant / block</option>
                      {(masters.subplants||[]).filter((sp)=>sp.plant_uid===form.plant_uid).map((sp)=><option key={sp.id} value={sp.id}>{sp.subplant_name}</option>)}
                    </select>
                  </IconField>

                  <IconField icon="dept" label="Department">
                    <select value={form.department_uid}
                      onChange={(e)=>setForm((x)=>({ ...x, department_uid:e.target.value, area_uid:'', equipment_uid:'' }))}>
                      <option value="">Select department</option>
                      {(masters.departments||[]).filter((d)=>d.subplant_uid===form.subplant_uid).map((d)=><option key={d.id} value={d.id}>{d.department_name}</option>)}
                    </select>
                  </IconField>

                  <IconField icon="area" label="Area / Room">
                    <select value={form.area_uid}
                      onChange={(e)=>setForm((x)=>({ ...x, area_uid:e.target.value, equipment_uid:'' }))}>
                      <option value="">Select room/area</option>
                      {(masters.areas||[]).filter((a)=>a.department_uid===form.department_uid).map((a)=><option key={a.id} value={a.id}>{a.area_name}</option>)}
                    </select>
                  </IconField>

                  <IconField icon="eqp" label="Equipment" colSpan>
                    <select value={form.equipment_uid}
                      onChange={(e)=>setForm((x)=>({ ...x, equipment_uid:e.target.value }))}>
                      <option value="">Select equipment (code — name)</option>
                      {(masters.equipment||[])
                        .filter((r)=>r.area_uid===form.area_uid && (r.status??'Active')==='Active')
                        .map((r)=>(
                          <option key={r.id} value={r.id}>
                            {(r.equipment_code||'').trim()} — {r.equipment_name}
                          </option>
                        ))}
                    </select>
                  </IconField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <IconField icon="severity" label="Severity">
                    <select value={form.severity} onChange={(e)=>setForm((x)=>({ ...x, severity:e.target.value }))}>
                      {['Critical','Major','Minor'].map((s)=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </IconField>
                  <IconField icon="priority" label="Priority">
                    <select value={form.priority} onChange={(e)=>setForm((x)=>({ ...x, priority:e.target.value }))}>
                      {['P1','P2','P3'].map((s)=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </IconField>
                  <div className="flex items-end">
                    <div className="text-xs text-slate-500">
                      SLA due in <b>{SLA_HOURS_BY_SEVERITY[form.severity]||24}h</b>
                    </div>
                  </div>
                </div>

                <IconField icon="desc" label="Description" colSpan>
                  <textarea rows={4}
                    placeholder="Symptoms, alarms, unusual sounds/smell, operating phase, product/batch (if applicable)…"
                    value={form.description} onChange={(e)=>setForm((x)=>({ ...x, description:e.target.value }))} />
                </IconField>

                <IconField icon="action" label="Immediate Action" colSpan>
                  <textarea rows={3}
                    placeholder="Safety: LOTO applied? Isolation steps taken? Who was notified? Interim controls?"
                    value={form.immediate_action} onChange={(e)=>setForm((x)=>({ ...x, immediate_action:e.target.value }))} />
                </IconField>

                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={onFiles}/>
                  <Button onClick={onPickFiles} variant="outline" className="gap-1"><Paperclip size={16}/>Attach files</Button>
                  <div className="text-xs text-slate-600 truncate">{(form.attachments||[]).map((f)=>f.name).join(', ')}</div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={createTicket} className="gap-1"><Plus size={16}/>Create Ticket</Button>
                  <Button onClick={()=>setForm({ plant_uid:'', subplant_uid:'', department_uid:'', area_uid:'', equipment_uid:'',
                    severity:'Critical', priority:'P1', description:'', immediate_action:'', attachments:[] })}
                    variant="outline"><RefreshCw size={16}/>Reset</Button>
                </div>
              </>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-slate-500"/>
              <input className="border rounded p-2 w-full" placeholder="Search tickets (id, description, severity, priority, status)"
                value={filters.q} onChange={(e)=>setFilters((x)=>({ ...x, q:e.target.value }))}/>
            </div>

            {/* KPI tiles */}
            <div className="grid sm:grid-cols-2 gap-2">
              <Card className="p-3 flex items-center justify-between">
                <div><div className="text-xs text-slate-500">MTTR</div><div className="text-xl font-semibold">{mttrAvg} h</div></div>
                <Clock4 className="text-emerald-600"/>
              </Card>
              <Card className="p-3 flex items-center justify-between">
                <div><div className="text-xs text-slate-500">MTBF</div><div className="text-xl font-semibold">{mtbfAvg} h</div></div>
                <TrendingUp className="text-indigo-600"/>
              </Card>
              <Card className="p-3 flex items-center justify-between">
                <div><div className="text-xs text-slate-500">Critical Open</div><div className="text-xl font-semibold">{criticalOpen}</div></div>
                <ShieldAlert className="text-rose-600"/>
              </Card>
              <Card className="p-3 flex items-center justify-between">
                <div><div className="text-xs text-slate-500">SLA &lt; 2h</div><div className="text-xl font-semibold">{dueSoon}</div></div>
                <BarChart3 className="text-amber-600"/>
              </Card>
            </div>

            <div className="text-xs text-slate-500">Tip: Critical & P1 create a 2h SLA by default.</div>
          </Card>
        </div>
      )}

      {/* Queue */}
      {tab==='Queue' && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-3 space-y-2 md:col-span-2">
            <div className="flex gap-2 flex-wrap items-center">
              <select className="border rounded p-2" value={filters.severity} onChange={(e)=>setFilters((x)=>({ ...x, severity:e.target.value }))}><option value="">All severities</option><option>Critical</option><option>Major</option><option>Minor</option></select>
              <select className="border rounded p-2" value={filters.priority} onChange={(e)=>setFilters((x)=>({ ...x, priority:e.target.value }))}><option value="">All priorities</option><option>P1</option><option>P2</option><option>P3</option></select>
              <select className="border rounded p-2" value={filters.status} onChange={(e)=>setFilters((x)=>({ ...x, status:e.target.value }))}><option value="">All statuses</option>{['Open','Acknowledged','In-Progress','Restored','Closed','Cancelled'].map((s)=><option key={s}>{s}</option>)}</select>
              <div className="ml-auto text-xs text-slate-500">
                {ticketsLoading ? '—' : filteredTickets.length} tickets
              </div>
            </div>

            <div className="divide-y border rounded">
              {ticketsLoading ? (
                <div className="p-3"><SkeletonBlock rows={6}/></div>
              ) : filteredTickets.map((t)=>(
                <div key={t.id} className="p-3 hover:bg-slate-50 cursor-pointer" onClick={()=>openTicket(t)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-indigo-600"/>
                      <b>{t.ticket_no || t.id}</b>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        {Critical:'bg-rose-100 text-rose-700 border-rose-300',Major:'bg-amber-100 text-amber-700 border-amber-300',Minor:'bg-emerald-100 text-emerald-700 border-emerald-300'}[t.severity] || 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>{t.severity}/{t.priority}</span>
                      <StatusBadge status={t.status}/>
                    </div>
                    <div className="text-xs text-slate-500">{fmt(t.created_at)}</div>
                  </div>
                  <div className="text-sm text-slate-700 line-clamp-1">{t.description}</div>
                  <div className="text-xs text-slate-500">SLA: {t.sla_due_at?new Date(t.sla_due_at).toLocaleString():''}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            {active ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{active.ticket_no || active.id}</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={active.status}/>
                    <Button size="sm" variant="outline" disabled={active.status!=='Closed'}
                      onClick={()=>toast.promise(printTicketReport(active),{loading:'Preparing report…',success:'Report ready (print dialog should open)',error:(e)=>e?.message||'Report failed'})}
                      className="gap-1"><Printer size={16}/>Report</Button>
                  </div>
                </div>
                <div className="text-sm">{active.description}</div>
                <div className="text-xs text-slate-500">Created: {fmt(active.created_at)}</div>

                <div className="flex flex-wrap gap-2">
                  {active.status==='Open' && (
                    <Button onClick={()=>updateTicketStatus(active.id,{status:'Acknowledged',acknowledged_at:new Date().toISOString(),acknowledged_by:user?.id},'Acknowledging')} className="gap-1"><CheckCircle2 size={16}/>Acknowledge</Button>
                  )}
                  {['Open','Acknowledged'].includes(active.status) && (
                    <Button onClick={()=>updateTicketStatus(active.id,{status:'In-Progress',work_started_at:new Date().toISOString(),work_started_by:user?.id},'Starting work')} variant="outline" className="gap-1"><Play size={16}/>Start</Button>
                  )}
                  {active.status==='In-Progress' && (
                    <Button onClick={()=>updateTicketStatus(active.id,{status:'Restored',restored_at:new Date().toISOString(),restored_by:user?.id},'Restoring')} variant="outline" className="gap-1"><StopCircle size={16}/>Restore</Button>
                  )}
                  {['Restored'].includes(active.status) && (
                    <Button onClick={()=>updateTicketStatus(active.id,{status:'Closed',closed_at:new Date().toISOString(),closed_by:user?.id},'Closing')} variant="outline" className="gap-1"><CheckCircle2 size={16}/>Close</Button>
                  )}
                  {active.status!=='Closed' && (
                    <Button onClick={()=>updateTicketStatus(active.id,{status:'Cancelled'},'Cancelling')} variant="ghost" className="gap-1 text-rose-600"><XCircle size={16}/>Cancel</Button>
                  )}
                </div>

                {/* Attachments */}
                <div className="pt-2 border-t">
                  <div className="font-semibold text-sm mb-1">Attachments</div>
                  <TicketAttachments ticketId={active.id}/>
                </div>

                {/* Spares */}
                <div className="pt-2 border-t space-y-2">
                  <div className="font-semibold text-sm">Spares Used</div>
                  <SparesSelector ticketId={active.id} currentUserId={user?.id} onAdded={()=>setSparesRefresh((n)=>n+1)}/>
                  <TicketSpares ticketId={active.id} refreshKey={sparesRefresh}/>
                </div>

                {/* RCA + CAPA */}
                {(['Restored','Closed'].includes(active.status))&&(
                  <div className="pt-2 border-t space-y-3">
                    <div className="font-semibold text-sm">RCA (5Why/Fishbone)</div>
                    <div className="grid md:grid-cols-2 gap-2">
                      <IconField icon="desc" label="Method">
                        <select value={rca.method} onChange={(e)=>setRca((x)=>({ ...x, method:e.target.value }))}><option>5WHY</option><option>Fishbone</option></select>
                      </IconField>
                      <IconField icon="desc" label="Root Cause">
                        <input value={rca.root_cause} onChange={(e)=>setRca((x)=>({ ...x, root_cause:e.target.value }))} placeholder="Final root cause"/>
                      </IconField>
                    </div>

                    {rca.method==='5WHY' ? (
                      <div className="grid md:grid-cols-2 gap-2">
                        {['why1','why2','why3','why4','why5'].map((k)=>(
                          <input key={k} className="border rounded p-2" placeholder={k.toUpperCase()} value={rca[k]} onChange={(e)=>setRca((x)=>({ ...x, [k]:e.target.value }))}/>
                        ))}
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-3 gap-2">
                        {['fishbone_man','fishbone_machine','fishbone_method','fishbone_material','fishbone_measurement','fishbone_environment'].map((k)=>(
                          <input key={k} className="border rounded p-2" placeholder={k.replace('fishbone_','')} value={rca[k]} onChange={(e)=>setRca((x)=>({ ...x, [k]:e.target.value }))}/>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2"><Button onClick={()=>addRCA(active.id,rca)} className="gap-1"><Save size={16}/>Save RCA</Button></div>

                    <div className="font-semibold text-sm mt-2">CAPA</div>
                    <div className="grid md:grid-cols-2 gap-2">
                      <select className="border rounded p-2" value={capa.action_type} onChange={(e)=>setCapa((x)=>({ ...x, action_type:e.target.value }))}><option>Preventive</option><option>Corrective</option></select>
                      <input className="border rounded p-2" placeholder="Action Title" value={capa.action_title} onChange={(e)=>setCapa((x)=>({ ...x, action_title:e.target.value }))}/>
                      <input className="border rounded p-2" placeholder="Owner Email" value={capa.owner_email} onChange={(e)=>setCapa((x)=>({ ...x, owner_email:e.target.value }))}/>
                      <input className="border rounded p-2" type="date" value={capa.due_date} onChange={(e)=>setCapa((x)=>({ ...x, due_date:e.target.value }))}/>
                      <textarea className="border rounded p-2 md:col-span-2" rows={2} placeholder="Action Detail" value={capa.action_detail} onChange={(e)=>setCapa((x)=>({ ...x, action_detail:e.target.value }))}/>
                    </div>
                    <div className="flex gap-2"><Button onClick={()=>addCAPA(active.id,capa)} className="gap-1"><Save size={16}/>Add CAPA</Button></div>
                    <TicketCAPA ticketId={active.id}/>
                  </div>
                )}
              </>
            ) : ticketsLoading ? <SkeletonBlock rows={8}/> : <div className="text-sm text-slate-500">Select a ticket to view details</div>}
          </Card>
        </div>
      )}

      {/* Analytics (full page) */}
      {tab==='Analytics' && (
  <div className="space-y-4">
    {/* KPI tiles */}
    <div className="grid md:grid-cols-4 gap-3">
      <ValueTile label="MTTR" value={`${mttrAvg} h`} Icon={()=><Clock4 className="text-emerald-600" />} />
      <ValueTile label="MTBF" value={`${mtbfAvg} h`} Icon={()=><TrendingUp className="text-indigo-600" />} />
      <ValueTile label="Critical Open" value={criticalOpen} Icon={()=><ShieldAlert className="text-rose-600" />} />
      <ValueTile label="SLA < 2h" value={dueSoon} Icon={()=><PieChart className="text-amber-600" />} />
    </div>

    {/* MTTR by Department */}
    <ChartCard title="MTTR by Department" subtitle="Average repair hours (last 500 tickets)">
      <ResponsiveContainer>
        <BarChart data={mttrByDept} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <ChartDefs />
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={50}/>
          <YAxis />
          <Tooltip content={<TooltipBox/>} />
          <Bar dataKey="value" name="Hours" fill="url(#gPrimary)" radius={[6,6,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>

    {/* MTTR by Area */}
    <ChartCard title="MTTR by Area" subtitle="Average repair hours">
      <ResponsiveContainer>
        <BarChart data={mttrByArea} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <ChartDefs />
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={50}/>
          <YAxis />
          <Tooltip content={<TooltipBox/>} />
          <Bar dataKey="value" name="Hours" fill="url(#gEmerald)" radius={[6,6,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>

    {/* Top 5 recurring equipment */}
    <ChartCard title="Top 5 Recurring Equipment" subtitle="Tickets in the last 90 days">
      <ResponsiveContainer>
        <BarChart data={topEquip90} layout="vertical" margin={{ top: 8, right: 16, left: 80, bottom: 8 }}>
          <ChartDefs />
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={280}/>
          <Tooltip content={<TooltipBox/>} />
          <Bar dataKey="value" name="Tickets" fill="url(#gIndigo)" radius={[6,6,6,6]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>

    {/* Ageing + SLA */}
    <div className="grid md:grid-cols-2 gap-3">
      <ChartCard title="Ageing (Open Tickets)" subtitle="How long tickets have been open" height={220}>
        <ResponsiveContainer>
          <BarChart
            data={[
              {bucket:'0–2h', value:ageingBuckets.b0_2},
              {bucket:'2–8h', value:ageingBuckets.b2_8},
              {bucket:'8–24h', value:ageingBuckets.b8_24},
              {bucket:'>24h', value:ageingBuckets.b24p},
            ]}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <ChartDefs />
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis allowDecimals={false}/>
            <Tooltip content={<TooltipBox/>} />
            <Bar dataKey="value" name="Open" fill="url(#gAmber)" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">SLA Compliance</div>
          <div className="text-xs text-slate-500">{slaCompliance.ontime}/{slaCompliance.total} closed on time</div>
        </div>
        <div className="text-5xl font-extrabold text-indigo-600">{slaCompliance.pct}%</div>
      </Card>
    </div>

    {/* Weekly trend */}
    <ChartCard title="Tickets per Week" subtitle="Grouped by ISO week">
      <ResponsiveContainer>
        <LineChart data={weeklyTrend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <ChartDefs />
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start" />
          <YAxis allowDecimals={false} />
          <Tooltip content={<TooltipBox/>} />
          <Line type="monotone" dataKey="tickets" name="Tickets" stroke="#2563eb" strokeWidth={3} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>

    {/* Export */}
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2">Tickets (export)</div>
      <Button variant="outline" onClick={()=>{
        if(!filteredTickets.length){toast.error('No rows');return;}
        const rows=filteredTickets.map((t)=>({ticket_no:t.ticket_no,severity:t.severity,priority:t.priority,status:t.status,created_at:t.created_at,restored_at:t.restored_at,mttr_h:diffHrs(t.work_started_at,t.restored_at)||''}));
        const hdr=Object.keys(rows[0]||{}).join(','); 
        const body=rows.map(r=>Object.values(r).map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
        const blob=new Blob([hdr+'\n'+body],{type:'text/csv'});
        const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='breakdowns.csv'; a.click(); URL.revokeObjectURL(url);
      }} className="gap-1"><FileDown size={16}/>CSV</Button>
    </Card>
  </div>
)}


      {/* SOP */}
      {tab==='SOP' && (
        <Card className="p-4 space-y-3" id="sopDiv">
          <div className="flex items-center gap-2"><FileText className="text-emerald-600"/><b>Sample SOP: Breakdown Handling & Escalation</b></div>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li><b>Immediate Reporting:</b> Operator logs issue in the Breakdown module and informs Shift Engineer.</li>
            <li><b>Classification:</b> Shift Engineer sets Severity (Critical/Major/Minor) and Priority (P1/P2/P3).</li>
            <li><b>Isolation & Safety:</b> Lockout/Tagout as needed; record Immediate Action.</li>
            <li><b>Response:</b> Maintenance acknowledges ticket and starts work within SLA (Critical&lt;2h, Major&lt;8h, Minor&lt;24h).</li>
            <li><b>Restore & Verification:</b> Upon restoration, QA performs GMP checks; if acceptable, status→Closed.</li>
            <li><b>RCA & CAPA:</b> For Critical & repeated failures, complete 5-Why or Fishbone and log CAPA with due dates.</li>
            <li><b>Review:</b> Weekly triage and Monthly review of MTTR/MTBF trends; update Critical Spares list.</li>
            <li><b>Records:</b> Preserve digital log, attachments, and approvals for audits (FDA/WHO/GMP).</li>
          </ol>
          <div className="flex gap-2">
            <Button onClick={()=>window.print()} variant="outline"><Printer size={16}/>Print SOP</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ==================================================== */
/* ================= Attachments List ================= */
/* ==================================================== */

function TicketAttachments({ ticketId }) {
  const [rows,setRows]=useState([]);
  useEffect(()=>{(async()=>{
    const {data}=await supabase.from('breakdown_attachment').select('*').eq('ticket_id',ticketId).order('created_at',{ascending:false});
    setRows(data||[]);
  })();},[ticketId]);
  const urlFor=async(path)=>{const {data}=await supabase.storage.from('breakdowns').createSignedUrl(path,60*10); return data?.signedUrl||''};
  return (
    <div className="space-y-2">
      {rows.map((r)=> <AttachmentRow key={r.id} row={r} urlFor={urlFor}/>) }
      {!rows.length&&<div className="text-xs text-slate-500">No attachments</div>}
    </div>
  );
}
function AttachmentRow({ row, urlFor }) {
  const [url,setUrl]=useState('');
  useEffect(()=>{(async()=>{setUrl(await urlFor(row.file_path));})();},[row.file_path]);
  return (
    <div className="flex items-center justify-between text-sm border rounded p-2">
      <div className="truncate">{row.file_path}</div>
      <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Open</a>
    </div>
  );
}

/* ==================================================== */
/* ================ Spares Selector/List ============== */
/* ==================================================== */

function SparesSelector({ ticketId, onAdded, currentUserId }) {
  const [q,setQ]=useState('');
  const [qty,setQty]=useState(1);
  const [options,setOptions]=useState([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(null);

  useEffect(()=>{
    const t=setTimeout(async ()=>{
      const term=(q||'').trim();
      if(term.length<2){ setOptions([]); setOpen(false); setSelected(null); return; }
      const {data,error}=await supabase
        .from('part_master')
        .select('id,part_code,part_name')
        .or(`part_code.ilike.%${term}%,part_name.ilike.%${term}%`)
        .order('part_code')
        .limit(25);
      if(!error){ setOptions(data||[]); }
      setOpen(true); setSelected(null);
    },250);
    return ()=>clearTimeout(t);
  },[q]);

  const addSpare=async ()=>{
    if(!ticketId){ toast.error('No ticket selected'); return; }
    if(!selected?.id){ toast.error('Pick a spare from the list'); return; }
    const qtyNum=Number.isFinite(Number(qty))&&Number(qty)>0?Number(qty):1;
    const payload={ticket_id:ticketId,part_uid:selected.id,qty_used:qtyNum,added_by:currentUserId||null};

    const run = async ()=>{
      const { error } = await supabase.from('breakdown_spares_used').insert(payload);
      if (error) throw error;
      setQ(''); setQty(1); setOptions([]); setOpen(false); setSelected(null);
      onAdded?.();
      return 'Spare added';
    };
    await toast.promise(run(), { loading:'Adding spare…', success:(m)=>m, error:(e)=>e?.message||'Add spare failed' });
  };

  return (
    <div className="flex items-start gap-2 relative">
      <div className="relative flex-1">
        <input
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setOpen(true); }}
          onFocus={()=>{ if(options.length) setOpen(true); }}
          placeholder="Search part code/name (min 2 chars)"
          className="border rounded p-2 w-full"
        />
        {open&&(
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto z-50">
            {options.length>0?(
              options.map((opt)=>(
                <button
                  key={opt.id}
                  type="button"
                  onClick={()=>setSelected(opt)}
                  className={`w-full text-left px-2 py-1 text-sm hover:bg-slate-50 ${selected?.id===opt.id?'bg-slate-100':''}`}
                >
                  {opt.part_code} — {opt.part_name}
                </button>
              ))
            ):(
              (q.trim().length>=2)&&(
                <div className="px-2 py-2 text-sm text-slate-500">No matching parts</div>
              )
            )}
          </div>
        )}
      </div>

      <input
        type="number"
        min={1}
        step={1}
        value={qty}
        onChange={(e)=>setQty(parseInt(e.target.value||'1',10))}
        className="border rounded p-2 w-20"
      />

      <Button type="button" variant="outline" disabled={busy||!selected?.id} onClick={addSpare}>
        {busy?'Adding…':'Add'}
      </Button>
    </div>
  );
}

function TicketSpares({ ticketId, refreshKey }) {
  const [rows,setRows]=useState([]);
  useEffect(()=>{(async()=>{
    const {data,error}=await supabase
      .from('breakdown_spares_used')
      .select('id,qty_used,part_master(part_code,part_name)')
      .eq('ticket_id',ticketId)
      .order('created_at',{ascending:false});
    if(!error){ setRows(data||[]); }
  })();},[ticketId,refreshKey]);
  return (
    <div className="border rounded">
      {rows.map((r)=>(
        <div key={r.id} className="p-2 flex items-center justify-between text-sm">
          <div>{r.part_master?.part_code} — {r.part_master?.part_name}</div>
          <div>Qty: {r.qty_used}</div>
        </div>
      ))}
      {!rows.length&&<div className="p-2 text-xs text-slate-500">No spares recorded</div>}
    </div>
  );
}

/* ==================================================== */
/* ===================== CAPA List ==================== */
/* ==================================================== */

function TicketCAPA({ ticketId }) {
  const [rows,setRows]=useState([]);
  useEffect(()=>{(async()=>{
    const {data}=await supabase.from('breakdown_capa').select('*').eq('ticket_id',ticketId).order('created_at',{ascending:false});
    setRows(data||[]);
  })();},[ticketId]);
  return (
    <div className="border rounded">
      {rows.map((r)=>(
        <div key={r.id} className="p-2 text-sm space-y-1 border-b">
          <div className="flex items-center justify-between"><b>{r.action_type}</b><span className="text-xs text-slate-500">Due: {r.due_date}</span></div>
          <div className="font-medium">{r.action_title}</div>
          <div className="text-xs text-slate-600">Owner: {r.owner_email}</div>
          <div className="text-xs text-slate-600">Status: {r.status}</div>
        </div>
      ))}
      {!rows.length&&<div className="p-2 text-xs text-slate-500">No CAPA yet</div>}
    </div>
  );
}
