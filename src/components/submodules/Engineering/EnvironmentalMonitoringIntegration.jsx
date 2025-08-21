// src/components/submodules/Engineering/EnvironmentalMonitoringIntegration.jsx
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {Button} from '@/components/ui/button.jsx';
import {
  Activity,Plus,Save,Edit3,Search,Upload,Download,CheckCircle2,AlertTriangle,
  Hash,Ruler,FileText,Building2,Layers,Briefcase,MapPin,ArrowDown,ArrowUp,Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import {Skeleton} from '@/components/ui/skeleton.tsx';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog.tsx';
import {Label} from '@/components/ui/label.jsx';
import {Input} from '@/components/ui/input.jsx';
import logo from '../../../assets/logo.png';

/* ----------------- helpers ----------------- */
const downloadText=(filename,text,mime='text/csv')=>{
  const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
};
const csvLine=(arr)=>arr.map((v)=>String(v??'').replace(/"/g,'""')).map((v)=>/[,\"\n]/.test(v)?`"${v}"`:v).join(',');
const downloadEMSTagTemplate=()=>{
  const headers=['tag_code','description','unit','plant_id','subplant_id','department_id','area_id','hi_limit','lo_limit','active'];
  const sample=['CR1-T','Cleanroom 1 Temp','°C','PLANT1','SPL-01','DEP-PRD','CR1',22,18,true];
  const csv=[csvLine(headers),csvLine(sample)].join('\n');
  downloadText('ems_tags_template.csv',csv);
};

/* minimal sparkline */
const Sparkline=({data,width=300,height=80})=>{
  if(!data?.length){ return <svg width={width} height={height}/>; }
  const min=Math.min(...data); const max=Math.max(...data);
  const norm=(v)=>{ if(max===min){ return height/2; } return height-((v-min)/(max-min))*height; };
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${norm(v)}`).join(' ');
  return <svg width={width} height={height} style={{display:'block'}}><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
};

/* shadcn skeleton helpers */
const TableRowSkeleton=()=>(
  <tr className="border-t">
    <td className="p-2"><Skeleton className="h-4 w-28"/></td>
    <td className="p-2"><Skeleton className="h-4 w-40"/></td>
    <td className="p-2"><Skeleton className="h-4 w-56"/></td>
    <td className="p-2"><Skeleton className="h-4 w-24"/></td>
  </tr>
);
const ReadingRowSkeleton=()=>(
  <tr className="border-t">
    <td className="p-2"><Skeleton className="h-4 w-28"/></td>
    <td className="p-2"><Skeleton className="h-4 w-16"/></td>
    <td className="p-2"><Skeleton className="h-4 w-32"/></td>
    <td className="p-2"><Skeleton className="h-4 w-20"/></td>
    <td className="p-2"><Skeleton className="h-5 w-20 rounded-full"/></td>
    <td className="p-2"><Skeleton className="h-8 w-24 rounded"/></td>
  </tr>
);

const EnvironmentalMonitoringIntegration=()=>{
  /* ---------- state ---------- */
  const [tags,setTags]=useState([]);
  const [now,setNow]=useState([]);
  const [alarms,setAlarms]=useState({});
  const [q,setQ]=useState('');
  const [editing,setEditing]=useState(false);
  const [selected,setSelected]=useState(null);
  const [trend,setTrend]=useState([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);

  /* cascading FK option lists */
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);

  /* form captures UUIDs directly */
  const emptyForm={id:null,tag_code:'',description:'',unit:'',plant_uid:'',subplant_uid:'',department_uid:'',area_uid:'',hi_limit:'',lo_limit:''};
  const [form,setForm]=useState(emptyForm);

  const fileRef=useRef(null);
  const pollRef=useRef(null);
  const isDev=typeof import.meta!=='undefined' && import.meta.env && import.meta.env.DEV;

  /* ---------- boot fetch ---------- */
  const fetchAll=async()=>{
    setLoading(true);
    const t=await supabase.from('ems_tag').select(`
      id,tag_code,description,unit,hi_limit,lo_limit,active,
      plant_uid,subplant_uid,department_uid,area_uid,
      plant:plant_master!ems_tag_plant_uid_fkey(id,plant_id,plant_name),
      subplant:subplant_master!ems_tag_subplant_uid_fkey(id,subplant_id,subplant_name),
      department:department_master!ems_tag_department_uid_fkey(id,department_id,department_name),
      area:area_master!ems_tag_area_uid_fkey(id,area_id,area_name)
    `).order('tag_code');

    const c=await supabase.from('vw_ems_current').select('*');
    const a=await supabase.from('ems_alarm').select('tag_uid,status').in('status',['Open','Acknowledged']);
    const p=await supabase.from('plant_master').select('id,plant_id,plant_name').order('plant_name');

    if(!t.error){ setTags(t.data||[]); }
    if(!c.error){ setNow(c.data||[]); }
    if(!a.error){ const map={}; (a.data||[]).forEach((x)=>{ map[x.tag_uid]=x.status; }); setAlarms(map); }
    if(!p.error){ setPlants(p.data||[]); }
    setLoading(false);
  };
  useEffect(()=>{ fetchAll(); },[]);

  /* ---------- dependent dropdown loading ---------- */
  const loadSubplants=async(plant_uid)=>{
    if(!plant_uid){ setSubplants([]); return; }
    const r=await supabase.from('subplant_master').select('id,subplant_id,subplant_name,plant_uid').eq('plant_uid',plant_uid).order('subplant_name');
    if(!r.error){ setSubplants(r.data||[]); }
  };
  const loadDepartments=async(subplant_uid)=>{
    if(!subplant_uid){ setDepartments([]); return; }
    const r=await supabase.from('department_master').select('id,department_id,department_name,subplant_uid').eq('subplant_uid',subplant_uid).order('department_name');
    if(!r.error){ setDepartments(r.data||[]); }
  };
  const loadAreas=async(department_uid)=>{
    if(!department_uid){ setAreas([]); return; }
    const r=await supabase.from('area_master').select('id,area_id,area_name,department_uid').eq('department_uid',department_uid).order('area_name');
    if(!r.error){ setAreas(r.data||[]); }
  };

  useEffect(()=>{ loadSubplants(form.plant_uid); setForm((f)=>({...f,subplant_uid:'',department_uid:'',area_uid:''})); },[form.plant_uid]);
  useEffect(()=>{ loadDepartments(form.subplant_uid); setForm((f)=>({...f,department_uid:'',area_uid:''})); },[form.subplant_uid]);
  useEffect(()=>{ loadAreas(form.department_uid); setForm((f)=>({...f,area_uid:''})); },[form.department_uid]);

  /* ---------- search/filter ---------- */
  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase();
    if(!s){ return tags; }
    return tags.filter((r)=>{
      const names=[r.tag_code,r.description,r?.plant?.plant_name,r?.subplant?.subplant_name,r?.department?.department_name,r?.area?.area_name].map((x)=>String(x||'').toLowerCase());
      return names.some((x)=>x.includes(s));
    });
  },[tags,q]);

  /* ---------- trend polling ---------- */
  const loadTrend=async(tag_uid)=>{
    const r=await supabase.from('ems_reading').select('value,ts').eq('tag_uid',tag_uid).order('ts',{ascending:false}).limit(50);
    if(!r.error){ setTrend((r.data||[]).map((x)=>Number(x.value)).reverse()); }
  };
  useEffect(()=>{
    if(!selected){ return; }
    loadTrend(selected.id);
    clearInterval(pollRef.current);
    pollRef.current=setInterval(()=>loadTrend(selected.id),10000);
    return ()=>clearInterval(pollRef.current);
  },[selected]);

  /* ---------- upsert tag (toast.promise) ---------- */
  const upsert=()=>toast.promise((async()=>{
    const payload={
      tag_code:form.tag_code,
      description:form.description,
      unit:form.unit,
      plant_uid:form.plant_uid||null,
      subplant_uid:form.subplant_uid||null,
      department_uid:form.department_uid||null,
      area_uid:form.area_uid||null,
      hi_limit:form.hi_limit!==''?Number(form.hi_limit):null,
      lo_limit:form.lo_limit!==''?Number(form.lo_limit):null,
      active:true
    };
    if(!payload.tag_code){ throw new Error('Tag code is required'); }
    setBusy(true);
    if(form.id){
      const {error}=await supabase.from('ems_tag').update(payload).eq('id',form.id);
      if(error){ throw error; }
    }else{
      const {error}=await supabase.from('ems_tag').insert([payload]);
      if(error){ throw error; }
    }
    setEditing(false); setForm(emptyForm);
    await fetchAll();
  })(),{loading:'Saving tag…',success:'Tag saved',error:(e)=>e?.message||'Save failed'}).finally(()=>setBusy(false));

  /* ---------- delete tag (toast.promise) ---------- */
  const deleteTag=(id,tag_code)=>toast.promise((async()=>{
    setBusy(true);
    const {error}=await supabase.from('ems_tag').delete().eq('id',id);
    if(error){ throw error; }
    if(selected?.id===id){ setSelected(null); setTrend([]); }
    await fetchAll();
  })(),{loading:`Deleting ${tag_code}…`,success:'Tag deleted',error:(e)=>e?.message||'Delete failed'}).finally(()=>setBusy(false));

  /* ---------- CSV import (toast.promise) ---------- */
  const parseCSV=(text)=>{
    const lines=text.split(/\r?\n/).filter((l)=>l!=null&&String(l).trim().length>0);
    if(!lines.length){ return []; }
    const headers=lines[0].split(',').map((h)=>h.trim());
    return lines.slice(1).map((line)=>{
      const cols=line.split(','); const obj={}; headers.forEach((h,i)=>{ obj[h]=cols[i]?cols[i].trim():''; }); return obj;
    });
  };
  const mapCodesToUids=async(row)=>{
    let plant_uid=row.plant_uid||null;
    let subplant_uid=row.subplant_uid||null;
    let department_uid=row.department_uid||null;
    let area_uid=row.area_uid||null;
    if(!plant_uid && row.plant_id){
      const p=await supabase.from('plant_master').select('id').eq('plant_id',row.plant_id).maybeSingle();
      plant_uid=p.data?.id||null;
    }
    if(!subplant_uid && row.subplant_id){
      const sp=await supabase.from('subplant_master').select('id').eq('subplant_id',row.subplant_id).maybeSingle();
      subplant_uid=sp.data?.id||null;
    }
    if(!department_uid && row.department_id){
      const d=await supabase.from('department_master').select('id').eq('department_id',row.department_id).maybeSingle();
      department_uid=d.data?.id||null;
    }
    if(!area_uid && row.area_id){
      const a=await supabase.from('area_master').select('id').eq('area_id',row.area_id).maybeSingle();
      area_uid=a.data?.id||null;
    }
    return {plant_uid,subplant_uid,department_uid,area_uid};
  };
  const importCSV=(e)=>{
    const file=e.target.files?.[0]; if(!file){ return; }
    toast.promise((async()=>{
      setBusy(true);
      const text=await file.text(); const rows=parseCSV(text);
      for(const r of rows){
        const {plant_uid,subplant_uid,department_uid,area_uid}=await mapCodesToUids(r);
        const payload={
          tag_code:r.tag_code,description:r.description,unit:r.unit,
          plant_uid,subplant_uid,department_uid,area_uid,
          hi_limit:r.hi_limit?Number(r.hi_limit):null,lo_limit:r.lo_limit?Number(r.lo_limit):null,
          active:String(r.active).toLowerCase()!=='false'
        };
        const exist=await supabase.from('ems_tag').select('id').eq('tag_code',r.tag_code).maybeSingle();
        if(exist.data?.id){
          const upd=await supabase.from('ems_tag').update(payload).eq('id',exist.data.id);
          if(upd.error){ throw upd.error; }
        }else{
          const ins=await supabase.from('ems_tag').insert([payload]);
          if(ins.error){ throw ins.error; }
        }
      }
      if(fileRef.current){ fileRef.current.value=''; }
      await fetchAll();
    })(),{loading:'Importing CSV…',success:'CSV import complete',error:(err)=>err?.message||'Import failed'}).finally(()=>setBusy(false));
  };

  /* ---------- Acknowledge button ---------- */
  const acknowledge=(tag_uid)=>toast.promise((async()=>{
    const {data:row,error:selErr}=await supabase
      .from('ems_alarm').select('id').eq('tag_uid',tag_uid).eq('status','Open')
      .order('opened_at',{ascending:false}).limit(1).maybeSingle();
    if(selErr){ throw selErr; }
    if(!row?.id){ throw new Error('No Open alarm to acknowledge'); }
    const {error:updErr}=await supabase.from('ems_alarm').update({status:'Acknowledged'}).eq('id',row.id);
    if(updErr){ throw updErr; }
    const a=await supabase.from('ems_alarm').select('tag_uid,status').in('status',['Open','Acknowledged']);
    if(!a.error){ const map={}; (a.data||[]).forEach((x)=>{ map[x.tag_uid]=x.status; }); setAlarms(map); }
    await fetchAll();
  })(),{loading:'Acknowledging…',success:'Alarm acknowledged',error:(e)=>e?.message||'Acknowledge failed'});

  /* ---------- Simulate Reading (DEV only) ---------- */
  const genOkValue=(lo,hi)=>{
    if(lo!=null && hi!=null){ return Number(lo)+(Number(hi)-Number(lo))*0.5+(Math.random()-0.5)*0.4; }
    if(hi!=null){ return Number(hi)-1-(Math.random()*0.5); }
    if(lo!=null){ return Number(lo)+1+(Math.random()*0.5); }
    return 20+(Math.random()-0.5);
  };
  const genAlarmValue=(lo,hi)=>{
    if(hi!=null){ return Number(hi)+0.8+(Math.random()*0.7); }
    if(lo!=null){ return Number(lo)-0.8-(Math.random()*0.7); }
    return 999;
  };
  const simulateReading=(tag_uid,type='OK')=>toast.promise((async()=>{
    if(!tag_uid){ throw new Error('Select a tag first'); }
    const {data:tag,error:tErr}=await supabase.from('ems_tag').select('id,hi_limit,lo_limit').eq('id',tag_uid).maybeSingle();
    if(tErr||!tag){ throw tErr||new Error('Tag not found'); }
    const v=type==='ALARM'?genAlarmValue(tag.lo_limit,tag.hi_limit):genOkValue(tag.lo_limit,tag.hi_limit);
    const {error:insErr}=await supabase.from('ems_reading').insert([{tag_uid,ts:new Date().toISOString(),value:v}]);
    if(insErr){ throw insErr; }
    await fetchAll();
    if(selected?.id===tag_uid){ await loadTrend(tag_uid); }
  })(),{loading:`Simulating ${type}…`,success:`${type} reading inserted`,error:(e)=>e?.message||'Simulation failed'});

  /* ---------- helpers for status styling ---------- */
  const breach=(r)=>{
    if(r.value==null){ return false; }
    const v=Number(r.value);
    const hi=r.hi_limit!=null?Number(r.hi_limit):null;
    const lo=r.lo_limit!=null?Number(r.lo_limit):null;
    if(hi!=null && v>hi){ return true; }
    if(lo!=null && v<lo){ return true; }
    return false;
  };
  const rowClass=(r)=>{
    const isAlarm=breach(r) || (alarms[r.tag_uid]==='Open');
    const isAck=alarms[r.tag_uid]==='Acknowledged';
    if(isAlarm){ return 'bg-red-50 text-red-800'; }
    if(isAck){ return 'bg-amber-50 text-amber-800'; }
    return '';
  };
  const statusBadge=(r)=>{
    const isAlarm=breach(r) || (alarms[r.tag_uid]==='Open');
    const isAck=alarms[r.tag_uid]==='Acknowledged';
    if(isAlarm){ return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800"><AlertTriangle size={14}/>ALARM</span>; }
    if(isAck){ return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Acknowledged</span>; }
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800"><CheckCircle2 size={14}/>OK</span>;
  };

  /* ---------- iconized input helpers using shadcn Input ---------- */
  const IconInput=({icon:Icon,placeholder,value,onChange,type='text',id})=>(
    <div className="space-y-1">
      {id&&(<Label htmlFor={id} className="text-xs text-gray-600">{placeholder}</Label>)}
      <div className="relative">
        <Icon size={16} className="absolute left-2 top-2.5 text-indigo-600"/>
        <Input id={id} className="pl-8" placeholder={placeholder} value={value} onChange={onChange} type={type}/>
      </div>
    </div>
  );
  const IconSelect=({icon:Icon,label,value,onChange,children,disabled=false,id})=>(
    <div className="space-y-1">
      {label&&(<Label htmlFor={id} className="text-xs text-gray-600">{label}</Label>)}
      <div className="relative">
        <Icon size={16} className="absolute left-2 top-2.5 text-indigo-600"/>
        <select id={id} className="border p-2 pl-8 rounded w-full disabled:bg-gray-100" value={value} onChange={onChange} disabled={disabled}>
          {children}
        </select>
      </div>
    </div>
  );

  /* ---------- UI ---------- */
  return (
    <div className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2"><Activity size={18}/> Environmental Monitoring</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 opacity-60"/>
            <input className="border rounded pl-7 pr-2 py-1 text-sm" placeholder="Search tag/area/plant" value={q} onChange={(e)=>setQ(e.target.value)}/>
          </div>
          <label className="inline-flex items-center gap-1 cursor-pointer text-sm border px-2 py-1 rounded">
            <Upload size={16}/> Import CSV
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCSV} disabled={busy}/>
          </label>
          <Button variant="outline" onClick={downloadEMSTagTemplate}><Download size={16} className="mr-1"/>Template</Button>
          <Button onClick={()=>{ setEditing(true); setForm(emptyForm); }} disabled={busy}><Plus size={16} className="mr-1"/>New Tag</Button>
        </div>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${busy?'opacity-60 pointer-events-none':''}`}>
        {/* left: tags list */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50">Tags</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Tag</th>
                  <th className="p-2 text-left">Desc</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading?(
                  Array.from({length:5}).map((_,i)=>(<TableRowSkeleton key={`skl-${i}`}/>))
                ):filtered.map((r)=>(
                  <tr key={r.id} className={`border-t ${selected?.id===r.id?'bg-blue-50':''}`} onClick={()=>setSelected(r)}>
                    <td className="p-2">{r.tag_code}</td>
                    <td className="p-2">{r.description||'-'}</td>
                    <td className="p-2">
                      <div className="text-xs text-gray-700">
                        {(r.plant?.plant_name||r.plant?.plant_id)||'-'} ▸ {(r.subplant?.subplant_name||r.subplant?.subplant_id)||'-'} ▸ {(r.department?.department_name||r.department?.department_id)||'-'} ▸ {(r.area?.area_name||r.area?.area_id)||'-'}
                      </div>
                    </td>
                    <td className="p-2 flex gap-1">
                      <Button variant="ghost" onClick={(e)=>{ e.stopPropagation(); setForm({
                        id:r.id,tag_code:r.tag_code,description:r.description||'',unit:r.unit||'',
                        plant_uid:r.plant_uid||'',subplant_uid:r.subplant_uid||'',department_uid:r.department_uid||'',area_uid:r.area_uid||'',
                        hi_limit:r.hi_limit??'',lo_limit:r.lo_limit??''
                      }); setEditing(true); }}><Edit3 size={16}/></Button>
                      <Button variant="ghost" onClick={(e)=>{ e.stopPropagation(); deleteTag(r.id,r.tag_code); }}><Trash2 size={16} className="text-red-600"/></Button>
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length&&(<tr><td className="p-2 text-gray-500" colSpan={4}>No tags.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {/* right: current + trend */}
        <div className="border rounded">
          <div className="px-3 py-2 font-semibold bg-gray-50 flex items-center justify-between">
            <span>Current Readings & Trend</span>
            {isDev && selected?.id&&(
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={()=>simulateReading(selected.id,'OK')}>Sim OK</Button>
                <Button size="sm" variant="outline" onClick={()=>simulateReading(selected.id,'ALARM')}>Sim Alarm</Button>
              </div>
            )}
          </div>

          {selected?(
            <div className="p-3">
              <div className="text-sm font-semibold mb-1">{selected.tag_code} — {selected.description||'-'}</div>
              <div className="text-xs mb-2 text-gray-600">Limits: {selected.lo_limit??'-'} / {selected.hi_limit??'-'} {selected.unit||''}</div>
              {loading? <Skeleton className="h-20 w-full rounded"/> : <Sparkline data={trend}/>}
            </div>
          ):(<div className="p-3 text-sm text-gray-600">Select a tag to view trend.</div>)}

          <div className="px-3 pb-3 overflow-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Tag</th>
                  <th className="p-2 text-left">Value</th>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-left">Limits</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading?(
                  Array.from({length:6}).map((_,i)=>(<ReadingRowSkeleton key={`rs-${i}`}/>))
                ):now.map((r)=>{
                  const isAlarm=breach(r) || (alarms[r.tag_uid]==='Open');
                  const isAck=alarms[r.tag_uid]==='Acknowledged';
                  return (
                    <tr key={r.tag_uid} className={`border-t ${rowClass(r)}`}>
                      <td className="p-2">{r.tag_code}</td>
                      <td className="p-2">{r.value??'-'} {r.unit||''}</td>
                      <td className="p-2">{r.ts?new Date(r.ts).toLocaleString(): '-'}</td>
                      <td className="p-2">{r.lo_limit??'-'} / {r.hi_limit??'-'}</td>
                      <td className="p-2">{statusBadge(r)}</td>
                      <td className="p-2">
                        {(isAlarm||isAck)&&(<Button size="sm" variant="outline" onClick={()=>acknowledge(r.tag_uid)}>Acknowledge</Button>)}
                      </td>
                    </tr>
                  );
                })}
                {!loading && !now.length&&(<tr><td className="p-2 text-gray-500" colSpan={6}>No readings yet.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* modal: shadcn Dialog for New/Edit Tag */}
      <Dialog open={editing} onOpenChange={(v)=>{ if(!v){ setEditing(false); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img src={logo} alt="logo" className="h-6"/>
              {form.id?'Edit':'New'} EMS Tag
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <IconInput id="tag_code" icon={Hash} placeholder="Tag Code" value={form.tag_code} onChange={(e)=>setForm({...form,tag_code:e.target.value})}/>
            <IconInput id="unit" icon={Ruler} placeholder="Unit (°C,%RH,Pa)" value={form.unit} onChange={(e)=>setForm({...form,unit:e.target.value})}/>
            <div className="md:col-span-2">
              <IconInput id="desc" icon={FileText} placeholder="Description" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/>
            </div>

            <IconSelect id="plant" icon={Building2} label="Plant" value={form.plant_uid} onChange={(e)=>setForm({...form,plant_uid:e.target.value})}>
              <option value="">Select Plant</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_name||p.plant_id}</option>))}
            </IconSelect>

            <IconSelect id="subplant" icon={Layers} label="Subplant" value={form.subplant_uid} onChange={(e)=>setForm({...form,subplant_uid:e.target.value})} disabled={!form.plant_uid}>
              <option value="">{form.plant_uid?'Select Subplant':'Select Plant first'}</option>
              {subplants.map((sp)=>(<option key={sp.id} value={sp.id}>{sp.subplant_name||sp.subplant_id}</option>))}
            </IconSelect>

            <IconSelect id="department" icon={Briefcase} label="Department" value={form.department_uid} onChange={(e)=>setForm({...form,department_uid:e.target.value})} disabled={!form.subplant_uid}>
              <option value="">{form.subplant_uid?'Select Department':'Select Subplant first'}</option>
              {departments.map((d)=>(<option key={d.id} value={d.id}>{d.department_name||d.department_id}</option>))}
            </IconSelect>

            <IconSelect id="area" icon={MapPin} label="Area" value={form.area_uid} onChange={(e)=>setForm({...form,area_uid:e.target.value})} disabled={!form.department_uid}>
              <option value="">{form.department_uid?'Select Area':'Select Department first'}</option>
              {areas.map((a)=>(<option key={a.id} value={a.id}>{a.area_name||a.area_id}</option>))}
            </IconSelect>

            <IconInput id="lo" icon={ArrowDown} placeholder="Lo Limit" value={form.lo_limit} onChange={(e)=>setForm({...form,lo_limit:e.target.value})} type="number"/>
            <IconInput id="hi" icon={ArrowUp} placeholder="Hi Limit" value={form.hi_limit} onChange={(e)=>setForm({...form,hi_limit:e.target.value})} type="number"/>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={()=>{ setEditing(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={upsert} disabled={busy}><Save size={16} className="mr-1"/>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnvironmentalMonitoringIntegration;
