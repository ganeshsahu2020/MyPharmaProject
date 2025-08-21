// src/components/submodules/hr/ShiftScheduleManagement.jsx
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {useAuth} from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  Calendar,Save,Send,CheckCircle2,XCircle,Copy,RotateCw,Loader2,ShieldCheck,Users,
  Factory,Building2,MapPin,Printer,FileDown
} from 'lucide-react';
import {Button} from '../../ui/button';
import {Card} from '../../ui/card';
import logo from '../../../assets/logo.png';

/*
  ShiftScheduleManagement.jsx
  - Views: vw_user_management_ext_v2, vw_department_hierarchy_v2
  - Tables: shift_master, shift_schedule, shift_schedule_employee
  - Dev tweak: any logged-in user can approve (canApprove=!!authUid)
*/

/* ---------- date helpers ---------- */
const fmtDate=(d)=>{const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10);};
const startOfWeek=(iso)=>{const d=new Date(iso||new Date()); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return fmtDate(d);};
const addDays=(iso,days)=>{const d=new Date(iso); d.setDate(d.getDate()+days); return fmtDate(d);};
const weekDates=(weekOf)=>[0,1,2,3,4,5,6].map((i)=>addDays(weekOf,i));
const dowName=(iso)=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(new Date(iso).getDay()+6)%7];
const fmtDT=(s)=>s? new Date(s).toLocaleString() : '';

const ShiftScheduleManagement=()=>{
  const {session}=useAuth();
  const email=session?.user?.email||'';
  const authUid=session?.user?.id||null;

  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);

  const [hier,setHier]=useState([]);
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);

  const [plantUid,setPlantUid]=useState('');
  const [subplantUid,setSubplantUid]=useState('');
  const [departmentUid,setDepartmentUid]=useState('');

  const [templates,setTemplates]=useState([]);
  const [userRow,setUserRow]=useState(null);

  const [weekOf,setWeekOf]=useState(()=>startOfWeek(new Date()));
  const [rows,setRows]=useState([]);

  const [employeeOptions,setEmployeeOptions]=useState([]);
  const [empMap,setEmpMap]=useState({});
  const [assignOpen,setAssignOpen]=useState(false);
  const [assignDate,setAssignDate]=useState(null);
  const [empSearch,setEmpSearch]=useState('');

  const [banner,setBanner]=useState(null);

  const lastLoadRef=useRef({dept:null,week:null});

  /* ---------- roles & permissions ---------- */
  const roles=useMemo(()=>Array.isArray(userRow?.roles)?userRow.roles:[],[userRow]);
  const isAdmin=useMemo(()=>roles.some((r)=>/^(admin|super admin)$/i.test(r)),[roles]);
  const isHR=useMemo(()=>roles.some((r)=>/^(hr|human resources|human resource|hr manager)$/i.test(r)),[roles]);
  const isManager=useMemo(()=>roles.some((r)=>/^(manager|supervisor)$/i.test(r)),[roles]);
  const isManagerOfSelected=useMemo(()=>isManager&&userRow?.department_uid&&departmentUid&&(userRow.department_uid===departmentUid),[isManager,userRow,departmentUid]);
  const isSameUnitHR=useMemo(()=>isHR&&userRow?.plant_uid===plantUid&&userRow?.subplant_uid===subplantUid&&userRow?.department_uid===departmentUid,[isHR,userRow,plantUid,subplantUid,departmentUid]);

  // DEV MODE: allow any logged-in user to approve
  const canApprove=useMemo(()=>!!authUid,[authUid]);

  const batchStatusVal=useMemo(()=>{if(!rows.length) return 'Draft'; const s=new Set(rows.map((r)=>r.status||'Draft')); return s.size===1?[...s][0]:'Mixed';},[rows]);

  const inputsDisabled=useMemo(()=>{
    if(isAdmin) return false;
    if(batchStatusVal==='Approved') return true;
    if(isHR) return false;
    return !isManagerOfSelected;
  },[isAdmin,isHR,batchStatusVal,isManagerOfSelected]);

  /* ---------- initial loads ---------- */
  useEffect(()=>{(async()=>{
    setLoading(true);
    try{
      if(email||authUid){
        const {data:uData}=await supabase
          .from('vw_user_management_ext_v2')
          .select('*')
          .or(`email.eq.${email},auth_uid.eq.${authUid}`)
          .limit(1)
          .maybeSingle();
        if(uData){setUserRow(uData);}
      }
      const {data:h}=await supabase.from('vw_department_hierarchy_v2').select('*');
      if(h){
        setHier(h);
        const pMap=new Map(); h.forEach((r)=>{pMap.set(r.plant_uid,{id:r.plant_uid,name:r.plant_name});});
        setPlants(Array.from(pMap.values()));
      }
      const {data:tpl}=await supabase
        .from('shift_master')
        .select('shift_code,start_time,end_time,break_mins,status')
        .eq('status','Active')
        .order('shift_code');
      if(tpl){setTemplates(tpl);}
    }finally{setLoading(false);}
  })();},[email,authUid]);

  useEffect(()=>{if(userRow&&hier.length){const d=hier.find((x)=>x.department_uid===userRow.department_uid); if(d){setPlantUid(d.plant_uid); setSubplantUid(d.subplant_uid); setDepartmentUid(d.department_uid);}}},[userRow,hier]);

  useEffect(()=>{
    const subs=hier.filter((r)=>plantUid? r.plant_uid===plantUid : true)
      .reduce((acc,r)=>{acc.set(r.subplant_uid,{id:r.subplant_uid,name:r.subplant_name,plant_uid:r.plant_uid}); return acc;},new Map());
    setSubplants(Array.from(subs.values()));
    if(subplantUid&&!subs.has(subplantUid)){setSubplantUid('');}
  },[plantUid,hier]);

  useEffect(()=>{
    const depts=hier.filter((r)=>{if(plantUid&&r.plant_uid!==plantUid) return false; if(subplantUid&&r.subplant_uid!==subplantUid) return false; return true;})
      .reduce((acc,r)=>{acc.set(r.department_uid,{id:r.department_uid,name:r.department_name}); return acc;},new Map());
    setDepartments(Array.from(depts.values()));
    if(departmentUid&&!depts.has(departmentUid)){setDepartmentUid('');}
  },[plantUid,subplantUid,hier]);

  useEffect(()=>{(async()=>{
    if(!departmentUid) return;
    const {data,e}=await supabase
      .from('vw_user_management_ext_v2')
      .select('user_id,full_name,email,department_uid')
      .eq('department_uid',departmentUid)
      .order('full_name');
    if(e){toast.error('Failed to load employees'); setEmployeeOptions([]); return;}
    setEmployeeOptions(data||[]);
  })();},[departmentUid]);

  /* ---------- load week (rows + assignments) ---------- */
  useEffect(()=>{(async()=>{
    if(!departmentUid||!weekOf) return;
    const last=lastLoadRef.current; if(last.dept===departmentUid&&last.week===weekOf) return;
    setLoading(true);
    try{
      const days=weekDates(weekOf);
      const {data,error}=await supabase
        .from('shift_schedule')
        .select('id,plant_uid,subplant_uid,department_uid,schedule_date,shift_code,start_time,end_time,break_mins,notes,status,prepared_by_email,prepared_by_uid,prepared_at,approved_by_email,approved_by_uid,approved_at')
        .eq('department_uid',departmentUid)
        .gte('schedule_date',days[0])
        .lte('schedule_date',days[6])
        .order('schedule_date',{ascending:true});
      if(error){toast.error('Failed to load schedule'); return;}
      const map=new Map((data||[]).map((r)=>[r.schedule_date,r]));
      const merged=days.map((d)=>map.get(d)||{id:null,plant_uid:plantUid,subplant_uid:subplantUid,department_uid:departmentUid,schedule_date:d,shift_code:'',start_time:'',end_time:'',break_mins:0,notes:'',status:'Draft',prepared_by_email:email,prepared_by_uid:userRow?.user_id||null});
      setRows(merged);

      const ids=(data||[]).map((r)=>r.id).filter(Boolean);
      if(ids.length){
        const {data:asns,error:asnErr}=await supabase
          .from('shift_schedule_employee')
          .select('schedule_id,employee_uid')
          .in('schedule_id',ids);
        if(asnErr){toast.error('Failed to load assignments');}
        const schedById=new Map((data||[]).map((r)=>[r.id,r.schedule_date]));
        const m={};
        (asns||[]).forEach((a)=>{const d=schedById.get(a.schedule_id); if(!d) return; if(!m[d]) m[d]=new Set(); m[d].add(a.employee_uid);});
        setEmpMap(m);
      }else{
        setEmpMap({});
      }
      lastLoadRef.current={dept:departmentUid,week:weekOf};
    }finally{setLoading(false);}
  })();},[departmentUid,weekOf,plantUid,subplantUid,email,userRow]);

  /* ---------- helpers ---------- */
  const setCell=(date,field,value)=>{setRows((prev)=>prev.map((r)=>r.schedule_date===date?{...r,[field]:value}:r));};

  const assignedNames=(date,limit=2)=>{const s=empMap[date]; if(!s||!s.size) return ''; const ids=[...s]; const names=ids.map((id)=>employeeOptions.find((e)=>e.user_id===id)?.full_name).filter(Boolean); if(names.length>limit){return names.slice(0,limit).join(', ')+' +'+(names.length-limit);} return names.join(', ');};

  const applyTemplate=(code)=>{const tpl=templates.find((t)=>t.shift_code===code); if(!tpl){toast.error('Template not found'); return;} setRows((prev)=>prev.map((r)=>({...r,shift_code:code,start_time:tpl.start_time,end_time:tpl.end_time,break_mins:tpl.break_mins})));};

  const generateWeek=()=>{const tpl=templates[0]||{shift_code:'G',start_time:'09:00',end_time:'17:00',break_mins:60}; const fresh=weekDates(weekOf).map((d)=>({id:null,plant_uid:plantUid,subplant_uid:subplantUid,department_uid:departmentUid,schedule_date:d,shift_code:tpl.shift_code,start_time:tpl.start_time,end_time:tpl.end_time,break_mins:tpl.break_mins,notes:'',status:'Draft',prepared_by_email:email,prepared_by_uid:userRow?.user_id||null})); setRows(fresh); setEmpMap({});};

  const copyLastWeek=async()=>{if(!departmentUid){toast.error('Select department'); return;} const srcWeek=startOfWeek(addDays(weekOf,-7)); const srcDays=weekDates(srcWeek); const {data,error}=await supabase.from('shift_schedule').select('id,schedule_date,shift_code,start_time,end_time,break_mins').eq('department_uid',departmentUid).gte('schedule_date',srcDays[0]).lte('schedule_date',srcDays[6]).order('schedule_date',{ascending:true}); if(error){toast.error('Failed to copy last week'); return;} if(!data?.length){toast('No data in previous week'); return;} const fresh=weekDates(weekOf).map((d,i)=>({id:null,plant_uid:plantUid,subplant_uid:subplantUid,department_uid:departmentUid,schedule_date:d,shift_code:data[i]?.shift_code||'',start_time:data[i]?.start_time||'',end_time:data[i]?.end_time||'',break_mins:data[i]?.break_mins||0,notes:'',status:'Draft',prepared_by_email:email,prepared_by_uid:userRow?.user_id||null})); setRows(fresh); setEmpMap({});};

  /* ---------- ensure week exists (for Submit/Approve) ---------- */
  const ensureWeekSaved=async()=>{
    const needSave=rows.some((r)=>!r.id);
    if(!needSave){return true;}
    for(const r of rows){if(!r.shift_code||!r.start_time||!r.end_time){toast.error(`Missing fields for ${r.schedule_date}`); return false;}}
    const payload=rows.map((r)=>({
      id:r.id||undefined,
      plant_uid:plantUid,subplant_uid:subplantUid,department_uid:departmentUid,
      schedule_date:r.schedule_date,shift_code:r.shift_code,start_time:r.start_time,end_time:r.end_time,break_mins:r.break_mins,
      notes:r.notes||'',status:r.status||'Draft',
      prepared_by_email:r.prepared_by_email||email,prepared_by_uid:r.prepared_by_uid||userRow?.user_id||null
    }));
    const {data,error}=await supabase.from('shift_schedule').upsert(payload,{onConflict:'department_uid,schedule_date'}).select('id,schedule_date');
    if(error){toast.error(error.message); return false;}
    if(data?.length){
      const idByDate=new Map(data.map((r)=>[r.schedule_date,r.id]));
      setRows((prev)=>prev.map((r)=>({...r,id:idByDate.get(r.schedule_date)||r.id})));
    }
    return true;
  };

  /* ---------- persistence ---------- */
  const validateRows=()=>{for(const r of rows){if(!r.shift_code||!r.start_time||!r.end_time){toast.error(`Missing fields for ${r.schedule_date}`); return false;}} return true;};

  const saveDraft=async()=>{
    if(!departmentUid){toast.error('Select department'); return;}
    if(!validateRows()) return;
    setSaving(true);
    try{
      const payload=rows.map((r)=>({
        id:r.id||undefined,
        plant_uid:plantUid,subplant_uid:subplantUid,department_uid:departmentUid,
        schedule_date:r.schedule_date,shift_code:r.shift_code,start_time:r.start_time,end_time:r.end_time,break_mins:r.break_mins,
        notes:r.notes||'',status:r.status||'Draft',
        prepared_by_email:r.prepared_by_email||email,prepared_by_uid:r.prepared_by_uid||userRow?.user_id||null
      }));
      const {data,error}=await supabase.from('shift_schedule').upsert(payload,{onConflict:'department_uid,schedule_date'}).select('id,schedule_date');
      if(error){toast.error(error.message); return;}
      if(data?.length){
        const idByDate=new Map(data.map((r)=>[r.schedule_date,r.id]));
        setRows((prev)=>prev.map((r)=>({...r,id:idByDate.get(r.schedule_date)||r.id})));
      }
      toast.success('Week saved as Draft.');
      setBanner({type:'success',msg:'Week saved as Draft.'});
    }finally{setSaving(false);}
  };

  const setBatchStatus=async(next)=>{
    if(!departmentUid){toast.error('Select department'); return;}
    if(next==='Submitted'||next==='Approved'||next==='Rejected'){
      const ok=await ensureWeekSaved(); if(!ok) return;
    }
    setSaving(true);
    try{
      const days=weekDates(weekOf);
      const patch={status:next};
      if(next==='Submitted'){Object.assign(patch,{approved_by_email:null,approved_by_uid:null,approved_at:null});}
      if(next==='Approved'||next==='Rejected'){
        Object.assign(patch,{
          approved_by_email:email,
          approved_by_uid:userRow?.user_id??authUid,
          approved_at:new Date().toISOString()
        });
      }
      const {error}=await supabase
        .from('shift_schedule')
        .update(patch)
        .eq('department_uid',departmentUid)
        .gte('schedule_date',days[0])
        .lte('schedule_date',days[6]);
      if(error){toast.error(error.message); return;}
      const msg=next==='Submitted'?'Week submitted for HR approval.':(next==='Approved'?'Week approved.':'Week rejected.');
      toast.success(msg);
      setBanner({type:'success',msg});
      lastLoadRef.current={dept:null,week:null};
      setWeekOf((w)=>w);
    }finally{setSaving(false);}
  };

  /* ---------- export helpers (company header + log) ---------- */
  const companyName=useMemo(()=>userRow?.company_name||'DigitizerX',[userRow]);
  const plantName=useMemo(()=>plants.find((p)=>p.id===plantUid)?.name||'',[plants,plantUid]);
  const subplantName=useMemo(()=>subplants.find((s)=>s.id===subplantUid)?.name||'',[subplants,subplantUid]);
  const departmentName=useMemo(()=>departments.find((d)=>d.id===departmentUid)?.name||'',[departments,departmentUid]);

  const weekStart=useMemo(()=>weekDates(weekOf)[0],[weekOf]);
  const weekEnd=useMemo(()=>weekDates(weekOf)[6],[weekOf]);

  const firstPrepared=useMemo(()=>{
    let pick=null;
    for(const r of rows){if(r.prepared_at&&(!pick||new Date(r.prepared_at)<new Date(pick.prepared_at))) pick=r;}
    return pick;
  },[rows]);

  const lastApproved=useMemo(()=>{
    let pick=null;
    for(const r of rows){if(r.approved_at&&(!pick||new Date(r.approved_at)>new Date(pick.approved_at))) pick=r;}
    return pick;
  },[rows]);

  const csvEscape=(s)=>{const v=(s??'').toString(); return /[",\n]/.test(v)? `"${v.replace(/"/g,'""')}"` : v;};

  /* ---------- Print/Preview: now ALWAYS enabled ---------- */
  const handlePrintPreview=()=>{
    const printableRows=rows||[];
    const rowsHtml=printableRows.map((r)=>`
      <tr>
        <td style="padding:6px;border:1px solid #e5e7eb;">${r.schedule_date}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${dowName(r.schedule_date)}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${r.shift_code||''}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${r.start_time||''}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${r.end_time||''}</td>
        <td style="padding:6px;border:1px solid #e5e7eb; text-align:right;">${r.break_mins||0}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${
          (empMap[r.schedule_date]? [...empMap[r.schedule_date]]:[])
            .map((id)=>employeeOptions.find((e)=>e.user_id===id)?.full_name||id)
            .join(', ')
        }</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${(r.status||'Draft')}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;">${(r.notes||'').replace(/</g,'&lt;')}</td>
      </tr>
    `).join('');

    const html=`
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Shift Schedule — ${departmentName||'-'} — ${weekStart} to ${weekEnd}</title>
          <style>
            @media print {.no-print{display:none}}
            body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Noto Sans',sans-serif; color:#111827;}
            .muted{color:#6b7280}
            .title{font-weight:700; font-size:18px}
            .hdr{margin-bottom:8px; display:flex; align-items:center; gap:10px;}
            table{border-collapse:collapse; width:100%;}
            th{background:#f3f4f6; text-align:left; padding:6px; border:1px solid #e5e7eb;}
            td{font-size:12px;}
            .section{margin-top:12px}
            img{height:28px}
          </style>
        </head>
        <body>
          <div class="hdr">
            <img src="${logo}" alt="Logo"/>
            <div class="title">${companyName}</div>
          </div>
          <div class="hdr" style="margin-bottom:4px;">Shift Schedule — <b>${departmentName||'-'}</b> (${plantName||'-'} / ${subplantName||'-'})</div>
          <div class="muted">Week: ${weekStart} to ${weekEnd} • Status: ${batchStatusVal}</div>

          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Day</th><th>Shift</th><th>Start</th><th>End</th><th>Break</th><th>Employees</th><th>Status</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>

          <div class="section">
            <div class="title" style="font-size:14px;">Log</div>
            <div class="muted">Prepared by: <b>${firstPrepared?.prepared_by_email||'-'}</b> at ${fmtDT(firstPrepared?.prepared_at)||'-'}</div>
            <div class="muted">Last approval: <b>${lastApproved?.approved_by_email||'-'}</b> at ${fmtDT(lastApproved?.approved_at)||'-'}</div>
          </div>

          <div class="section muted">Generated on ${new Date().toLocaleString()}</div>

          <div class="no-print" style="margin-top:12px;">
            <button onclick="window.print()">Print</button>
          </div>
        </body>
      </html>
    `;
    const w=window.open('','_blank');
    if(!w){toast.error('Popup blocked — allow popups to print.'); return;}
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setBanner({type:'success',msg:'Print preview opened.'});
  };

  const handleDownloadCSV=()=>{
    if(batchStatusVal!=='Approved'){toast.error('Only Approved weeks can be exported.'); return;}
    const header=[
      'Company','Plant','Subplant','Department','Week Start','Week End',
      'Date','Day','Shift Code','Start Time','End Time','Break (min)','Employees','Notes',
      'Prepared By','Prepared At','Approved By','Approved At'
    ];
    const lines=[header.join(',')];
    rows.filter((r)=>r.status==='Approved').forEach((r)=>{
      const emps=(empMap[r.schedule_date]? [...empMap[r.schedule_date]]:[])
        .map((id)=>employeeOptions.find((e)=>e.user_id===id)?.full_name||id).join('; ');
      const row=[
        companyName,plantName,subplantName,departmentName,weekStart,weekEnd,
        r.schedule_date,dowName(r.schedule_date),r.shift_code||'',r.start_time||'',r.end_time||'',
        r.break_mins||0,emps,r.notes||'',
        r.prepared_by_email||'',fmtDT(r.prepared_at),r.approved_by_email||'',fmtDT(r.approved_at)
      ].map(csvEscape).join(',');
      lines.push(row);
    });
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');
    const fname=`ShiftSchedule_${departmentName||'Dept'}_${weekStart}_approved.csv`;
    a.href=URL.createObjectURL(blob);
    a.download=fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setBanner({type:'success',msg:`CSV downloaded (${fname}).`});
  };

  /* ---------- assignments ---------- */
  const toggleEmp=(date,uid)=>{setEmpMap((prev)=>{const s=new Set(prev[date]? [...prev[date]]:[]); if(s.has(uid)){s.delete(uid);} else {s.add(uid);} return {...prev,[date]:s};});};
  const openAssign=(date)=>{setAssignDate(date); setAssignOpen(true); setEmpSearch('');};

  const ensureRowIdForDate=async(date)=>{
    const r=rows.find((x)=>x.schedule_date===date);
    if(r?.id) return r.id;
    const payload={
      id:r?.id||undefined, plant_uid:plantUid, subplant_uid:subplantUid, department_uid:departmentUid, schedule_date:r.schedule_date,
      shift_code:r?.shift_code||'G', start_time:r?.start_time||'09:00', end_time:r?.end_time||'17:00', break_mins:r?.break_mins||60, notes:r?.notes||'',
      status:r?.status||'Draft', prepared_by_email:r?.prepared_by_email||email, prepared_by_uid:r?.prepared_by_uid||userRow?.user_id||null
    };
    const {data,error}=await supabase.from('shift_schedule').upsert(payload,{onConflict:'department_uid,schedule_date'}).select('id,schedule_date').maybeSingle();
    if(error){throw error;}
    const id=data?.id; if(id){setRows((prev)=>prev.map((x)=>x.schedule_date===date?{...x,id}:x));}
    return id;
  };

  const saveAssignments=async(date)=>{
    try{
      const scheduleId=await ensureRowIdForDate(date);
      if(!scheduleId){toast.error('Could not resolve schedule row'); return;}
      const selectedSet=empMap[date]||new Set();
      const {data:existing,error:e1}=await supabase.from('shift_schedule_employee').select('employee_uid').eq('schedule_id',scheduleId);
      if(e1){toast.error('Failed to read existing assignments'); return;}
      const existingIds=new Set((existing||[]).map((x)=>x.employee_uid));
      const toAdd=[...selectedSet].filter((id)=>!existingIds.has(id)).map((uid)=>({schedule_id:scheduleId,employee_uid:uid}));
      const toRemove=[...existingIds].filter((id)=>!selectedSet.has(id));
      if(toAdd.length){
        const {error:e2}=await supabase.from('shift_schedule_employee').upsert(toAdd,{onConflict:'schedule_id,employee_uid'});
        if(e2){toast.error('Failed to add employees'); return;}
      }
      if(toRemove.length){
        const {error:e3}=await supabase.from('shift_schedule_employee').delete().eq('schedule_id',scheduleId).in('employee_uid',toRemove);
        if(e3){toast.error('Failed to remove employees'); return;}
      }
      toast.success('Assignments saved.');
      setBanner({type:'success',msg:`Assignments saved for ${date}.`});
      setAssignOpen(false);
    }catch(err){toast.error(err.message||'Failed to save assignments');}
  };

  /* ---------- UI ---------- */
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 text-2xl font-semibold">
        <img src={logo} alt="Logo" className="h-7 w-auto"/>
        <ShieldCheck className="w-6 h-6"/>
        <span>Shift Schedule Management</span>
      </div>

      {banner&&(
        <div className={`border rounded px-3 py-2 ${banner.type==='success'?'bg-green-50 border-green-200 text-green-700':'bg-red-50 border-red-200 text-red-700'}`}>
          <div className="flex items-center justify-between">
            <span>{banner.msg}</span>
            <button onClick={()=>setBanner(null)} className="text-xs underline">dismiss</button>
          </div>
        </div>
      )}

      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-sm font-medium flex items-center gap-1"><Factory className="w-4 h-4"/>Plant</label>
            <select className="mt-1 w-full border rounded p-2" value={plantUid} onChange={(e)=>setPlantUid(e.target.value)}>
              <option value="">Select...</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium flex items-center gap-1"><Building2 className="w-4 h-4"/>SubPlant</label>
            <select className="mt-1 w-full border rounded p-2" value={subplantUid} onChange={(e)=>setSubplantUid(e.target.value)}>
              <option value="">Select...</option>
              {subplants.map((s)=>(<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium flex items-center gap-1"><MapPin className="w-4 h-4"/>Department</label>
            <select className="mt-1 w-full border rounded p-2" value={departmentUid} onChange={(e)=>setDepartmentUid(e.target.value)}>
              <option value="">Select...</option>
              {departments.map((d)=>(<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Week of (Mon)</label>
            <input type="date" className="mt-1 w-full border rounded p-2" value={weekOf} onChange={(e)=>setWeekOf(startOfWeek(e.target.value))}/>
          </div>
          <div className="flex flex-wrap gap-2 justify-end md:justify-start">
            <Button onClick={()=>saveDraft()} disabled={saving||!departmentUid||inputsDisabled} className="gap-1 shrink-0">
              <Save className="w-4 h-4"/>{saving?'Saving...':'Save'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mt-3">
          <div className="md:col-span-3">
            <label className="text-sm font-medium">Apply template shift</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select className="w-full md:w-auto flex-1 min-w-[12rem] border rounded p-2" onChange={(e)=>applyTemplate(e.target.value)} defaultValue="">
                <option value="" disabled>Choose shift...</option>
                {templates.map((t)=>(<option key={t.shift_code} value={t.shift_code}>{t.shift_code} ({t.start_time}-{t.end_time})</option>))}
              </select>
              <Button type="button" onClick={()=>generateWeek()} className="gap-1 shrink-0"><RotateCw className="w-4 h-4"/>Reset</Button>
              <Button type="button" onClick={()=>copyLastWeek()} variant="outline" className="gap-1 shrink-0"><Copy className="w-4 h-4"/>Copy prev</Button>
            </div>
          </div>

          <div className="md:col-span-3 flex flex-wrap items-center justify-end gap-2 min-w-0">
            <div className="text-sm text-gray-600 flex items-center gap-2 mr-2 whitespace-nowrap min-w-0">
              <Users className="w-4 h-4"/>
              <span className="truncate max-w-[22ch]">Prepared by: {email}</span>
              <span className="mx-2">•</span>
              <span className="whitespace-nowrap">Status: <b>{batchStatusVal}</b></span>
            </div>

            <Button onClick={()=>setBatchStatus('Submitted')}
              disabled={!departmentUid||inputsDisabled||!(batchStatusVal==='Draft'||batchStatusVal==='Rejected')||saving}
              className="gap-1 shrink-0">
              <Send className="w-4 h-4"/>Submit
            </Button>

            <Button onClick={()=>setBatchStatus('Approved')}
              disabled={!departmentUid||!canApprove||batchStatusVal!=='Submitted'||saving}
              className="gap-1 shrink-0">
              <CheckCircle2 className="w-4 h-4"/>Approve
            </Button>

            <Button onClick={()=>setBatchStatus('Rejected')}
              disabled={!departmentUid||!canApprove||batchStatusVal!=='Submitted'||saving}
              variant="destructive"
              className="gap-1 shrink-0">
              <XCircle className="w-4 h-4"/>Reject
            </Button>

            {/* Print/Preview is ALWAYS enabled now */}
            <Button onClick={()=>handlePrintPreview()} variant="outline" className="gap-1 shrink-0">
              <Printer className="w-4 h-4"/>Print / Preview
            </Button>
            {/* CSV export remains Approved-only */}
            <Button onClick={()=>handleDownloadCSV()} disabled={batchStatusVal!=='Approved'} variant="outline" className="gap-1 shrink-0">
              <FileDown className="w-4 h-4"/>Download CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <div className="mt-1 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">#</th>
                <th className="p-2">Date</th>
                <th className="p-2">Day</th>
                <th className="p-2">Shift</th>
                <th className="p-2">Start</th>
                <th className="p-2">End</th>
                <th className="p-2">Break</th>
                <th className="p-2">Employees</th>
                <th className="p-2">Notes</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,idx)=>(
                <tr key={r.schedule_date} className="border-b">
                  <td className="p-2">{idx+1}</td>
                  <td className="p-2 whitespace-nowrap flex items-center gap-2"><Calendar className="w-4 h-4"/>{r.schedule_date}</td>
                  <td className="p-2">{dowName(r.schedule_date)}</td>
                  <td className="p-2">
                    <input className="border rounded p-1 w-24" value={r.shift_code||''} onChange={(e)=>setCell(r.schedule_date,'shift_code',e.target.value)} disabled={inputsDisabled}/>
                  </td>
                  <td className="p-2"><input type="time" className="border rounded p-1 w-24" value={r.start_time||''} onChange={(e)=>setCell(r.schedule_date,'start_time',e.target.value)} disabled={inputsDisabled}/></td>
                  <td className="p-2"><input type="time" className="border rounded p-1 w-24" value={r.end_time||''} onChange={(e)=>setCell(r.schedule_date,'end_time',e.target.value)} disabled={inputsDisabled}/></td>
                  <td className="p-2"><input type="number" className="border rounded p-1 w-20" value={r.break_mins||0} onChange={(e)=>setCell(r.schedule_date,'break_mins',parseInt(e.target.value||'0',10))} disabled={inputsDisabled}/></td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">{(empMap[r.schedule_date]?.size)||0} selected</span>
                      {assignedNames(r.schedule_date)&&<span className="text-xs text-gray-500 italic">({assignedNames(r.schedule_date)})</span>}
                      <Button size="sm" variant="outline" onClick={()=>{setAssignDate(r.schedule_date); setAssignOpen(true); setEmpSearch('');}} disabled={inputsDisabled}>Manage</Button>
                    </div>
                  </td>
                  <td className="p-2"><input className="border rounded p-1 w-56" value={r.notes||''} onChange={(e)=>setCell(r.schedule_date,'notes',e.target.value)} disabled={inputsDisabled}/></td>
                  <td className="p-2"><span className="px-2 py-1 rounded text-xs bg-gray-100">{r.status||'Draft'}</span></td>
                </tr>
              ))}
              {!rows.length&&(
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">
                    {departmentUid?(
                      <div className="flex items-center gap-2 justify-center">
                        {loading?<Loader2 className="w-4 h-4 animate-spin"/>:<>
                          <span>No rows. Generate a week</span>
                          <Button onClick={()=>generateWeek()} className="ml-2">Generate</Button>
                        </>}
                      </div>
                    ):(<span>Select plant/subplant/department to begin</span>)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Assign modal */}
      {assignOpen&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-[680px] max-h-[80vh] overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Assign Employees — {assignDate} ({dowName(assignDate)})</div>
              <Button variant="ghost" onClick={()=>setAssignOpen(false)}>Close</Button>
            </div>
            <div className="p-4">
              <input type="text" placeholder="Search employees..." className="w-full border rounded p-2 mb-3" value={empSearch} onChange={(e)=>setEmpSearch(e.target.value)}/>
              <div className="border rounded max-h-[48vh] overflow-auto">
                {(employeeOptions||[])
                  .filter((e)=>!empSearch||e.full_name?.toLowerCase().includes(empSearch.toLowerCase())||e.email?.toLowerCase().includes(empSearch.toLowerCase()))
                  .map((e)=>{const sel=empMap[assignDate]?.has(e.user_id); return (
                    <label key={e.user_id} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0">
                      <input type="checkbox" checked={!!sel} onChange={()=>toggleEmp(assignDate,e.user_id)} disabled={inputsDisabled}/>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{e.full_name||e.email}</div>
                        <div className="text-xs text-gray-500">{e.email}</div>
                      </div>
                    </label>
                  );})}
                {(!employeeOptions?.length)&&(<div className="p-3 text-sm text-gray-500">No employees found for this department.</div>)}
              </div>
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setAssignOpen(false)}>Cancel</Button>
              <Button onClick={()=>saveAssignments(assignDate)} disabled={inputsDisabled}>Save Assignees</Button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        <div>Managers draft/submit; any logged-in user can approve in dev mode. Approved weeks read-only. Print/Preview is available for any status; CSV export is restricted to Approved status.</div>
      </div>
    </div>
  );
};

export default ShiftScheduleManagement;
