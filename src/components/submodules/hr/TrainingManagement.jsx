import React,{useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "../../../utils/supabaseClient";
import {useAuth} from "../../../contexts/AuthContext";
import toast,{Toaster} from "react-hot-toast";

import {Card} from "../../ui/card";
import Button from "../../ui/button";
import {Skeleton} from "../../ui/skeleton";
import Input from "../../ui/Input";

import logo from "../../../assets/logo.png";

import {
  GraduationCap,ClipboardList,ShieldCheck,User2,Building2,MapPin,
  CalendarClock,Clock3,Presentation,Globe2,Video,FileText,UploadCloud,
  Download,Edit,Trash2,Search,RotateCcw,Mail,Users
} from "lucide-react";

/* ───────── constants ───────── */
const BUCKET="training_materials";
const MODES=["classroom","online","on-the-job"];
const STATUSES=["Planned","Scheduled","In Progress","Completed","Cancelled"];
const TYPES=["Induction","SOP","GMP","GDP","GLP","Safety","Equipment","Cleaning Validation","Data Integrity","CAPA","Deviation","Other"];
const COMPLIANCE=["GMP","GDP","GLP","EHS","Data Integrity","Other"];

const PILL={
  planned:"bg-white text-slate-700 border-slate-200",
  scheduled:"bg-white text-indigo-700 border-indigo-200",
  running:"bg-white text-amber-700 border-amber-200",
  completed:"bg-white text-emerald-700 border-emerald-200",
  cancelled:"bg-white text-rose-700 border-rose-200",
  neutral:"bg-white text-blue-700 border-blue-200"
};
const Pill=({tone="neutral",children})=>(
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${PILL[tone]}`}>{children}</span>
);

const initialForm={
  id:null,title:"",type:"",compliance_area:"",description:"",
  trainer_name:"",trainer_org:"",location:"",mode:"classroom",status:"Planned",
  start_at:"",end_at:"",max_seats:"",
  audience_scope:"employees",dept_ids:[],employee_ids:[],
  tags:"",file:null
};

const companyName="DigitizerX Pharmaceuticals";

/* ───────── component ───────── */
export default function TrainingManagement(){
  const {session}=useAuth();
  const email=session?.user?.email||"";
  const fileRef=useRef(null);

  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const [programs,setPrograms]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [departments,setDepartments]=useState([]);

  const [form,setForm]=useState(initialForm);

  // filters
  const [searchQ,setSearchQ]=useState("");
  const [statusF,setStatusF]=useState("");
  const [typeF,setTypeF]=useState("");
  const [deptF,setDeptF]=useState("");
  const [modeF,setModeF]=useState("");

  // email panel
  const [mailOpen,setMailOpen]=useState(false);
  const [mailSubject,setMailSubject]=useState("");
  const [mailBody,setMailBody]=useState("");

  // employee picker helpers
  const [empSearch,setEmpSearch]=useState("");
  const [empDeptFilter,setEmpDeptFilter]=useState("");

  useEffect(()=>{(async()=>{
    setLoading(true);
    try{
      const [p,e,d]=await Promise.all([
        supabase.from("training_program").select("*").order("start_at",{ascending:false}),
        supabase.from("vw_user_management_ext").select("id,employee_id,first_name,last_name,email,status,department_uid").order("employee_id",{ascending:true}),
        supabase.from("department_master").select("id,department_id,department_name").order("department_id",{ascending:true})
      ]);
      if(p.error) throw p.error;
      if(e.error) throw e.error;
      if(d.error) throw d.error;
      setPrograms(p.data||[]);
      setEmployees((e.data||[]).filter((x)=>x.status==="Active"));
      setDepartments(d.data||[]);
    }catch(err){ console.error(err); toast.error("Failed to load trainings"); }
    finally{ setLoading(false); }
  })();},[]);

  const reload=async()=>{
    const {data,error}=await supabase.from("training_program").select("*").order("start_at",{ascending:false});
    if(error){ toast.error("Reload failed"); return; }
    setPrograms(data||[]);
  };

  const empLabel=(e)=>e?`${e.employee_id} — ${e.first_name} ${e.last_name}`:"—";
  const deptLabel=(d)=>d?`${d.department_id} — ${d.department_name}`:"—";
  const empMap=useMemo(()=>{const m=new Map(); for(const e of employees) m.set(e.id,e); return m;},[employees]);
  const deptMap=useMemo(()=>{const m=new Map(); for(const d of departments) m.set(d.id,d); return m;},[departments]);

  const filtered=useMemo(()=>{
    let list=[...(programs||[])];
    if(statusF) list=list.filter((r)=>r.status===statusF);
    if(typeF) list=list.filter((r)=>r.type===typeF);
    if(modeF) list=list.filter((r)=>r.mode===modeF);
    if(deptF) list=list.filter((r)=>r.audience_scope!=="dept"?false:(r.dept_ids||[]).includes(deptF));
    if(searchQ.trim()){
      const q=searchQ.toLowerCase();
      list=list.filter((r)=>(
        (r.title||"").toLowerCase().includes(q)||
        (r.description||"").toLowerCase().includes(q)||
        (r.trainer_name||"").toLowerCase().includes(q)
      ));
    }
    return list;
  },[programs,statusF,typeF,modeF,deptF,searchQ]);

  const onPickFile=(e)=>setForm((f)=>({...f,file:e.target.files?.[0]||null}));

  const reset=()=>{
    setForm(initialForm);
    setMailOpen(false);
    if(fileRef.current) fileRef.current.value="";
  };

  const uploadMaterial=async(programId)=>{
    if(!form.file) return null;
    const safe=form.file.name.replace(/[^\w.\-]+/g,"_");
    const key=`${programId}/${Date.now()}_${safe}`;
    const up=await supabase.storage.from(BUCKET).upload(key,form.file,{upsert:false});
    if(up.error) throw up.error;
    const ins=await supabase.from("training_material").insert([{program_id:programId,storage_path:key,file_name:form.file.name,uploaded_by:email}]).select("id").single();
    if(ins.error) throw ins.error;
    return key;
  };

  const save=(e)=>{
    e?.preventDefault?.();
    if(!form.title.trim()) return toast.error("Title is required");
    if(!form.type) return toast.error("Select a training type");
    if(!form.status) return toast.error("Select a status");
    if(!form.start_at) return toast.error("Start date/time required");
    if(form.audience_scope==="dept"&&(!form.dept_ids||form.dept_ids.length===0)) return toast.error("Pick at least one department");
    if(form.audience_scope==="employees"&&(!form.employee_ids||form.employee_ids.length===0)) return toast.error("Pick at least one employee");

    const runner=async()=>{
      const payload={
        title:form.title.trim(),
        type:form.type,
        compliance_area:form.compliance_area||null,
        description:form.description||"",
        trainer_name:form.trainer_name||"",
        trainer_org:form.trainer_org||"",
        location:form.location||"",
        mode:form.mode||"classroom",
        status:form.status||"Planned",
        start_at:new Date(form.start_at).toISOString(),
        end_at:form.end_at?new Date(form.end_at).toISOString():null,
        max_seats:form.max_seats?Number(form.max_seats):null,
        audience_scope:form.audience_scope||"employees",
        dept_ids:form.audience_scope==="dept"?form.dept_ids:[],
        employee_ids:form.audience_scope==="employees"?form.employee_ids:[],
        tags:(form.tags||"").split(",").map((t)=>t.trim()).filter(Boolean),
        created_by:session?.user?.id||null
      };

      let id=form.id;
      if(!form.id){
        const ins=await supabase.from("training_program").insert([payload]).select("id").single();
        if(ins.error) throw ins.error;
        id=ins.data.id;

        if(payload.employee_ids?.length){
          const rows=payload.employee_ids.map((uid)=>({program_id:id,employee_uid:uid,status:"assigned"}));
          await supabase.from("training_assignment").insert(rows);
        }
      }else{
        const upd=await supabase.from("training_program").update(payload).eq("id",form.id);
        if(upd.error) throw upd.error;

        if(payload.audience_scope==="employees"){
          await supabase.from("training_assignment").delete().eq("program_id",form.id);
          if(payload.employee_ids?.length){
            const rows=payload.employee_ids.map((uid)=>({program_id:form.id,employee_uid:uid,status:"assigned"}));
            await supabase.from("training_assignment").insert(rows);
          }
        }else{
          await supabase.from("training_assignment").delete().eq("program_id",form.id);
        }
        id=form.id;
      }

      await uploadMaterial(id).catch(()=>{/* material optional */});
      setMailSubject(`Training: ${payload.title} (${payload.type})`);
      setMailBody(`Dear Colleagues,\n\nYou are invited to the training:\n\nTitle: ${payload.title}\nType: ${payload.type}\nCompliance: ${payload.compliance_area||"-"}\nWhen: ${new Date(payload.start_at).toLocaleString()}${payload.end_at?` — ${new Date(payload.end_at).toLocaleString()}`:""}\nMode: ${payload.mode}\nLocation: ${payload.location||"-"}\n\n${payload.description||""}\n\nRegards,\n${companyName}`);
      setMailOpen(true);

      await reload();
      return true;
    };

    toast.promise(runner(),{loading:form.id?"Updating…":"Saving…",success:form.id?"Training updated":"Training created",error:(e)=>e?.message||"Save failed"});
  };

  const editRow=(r)=>{
    setForm({
      id:r.id,title:r.title||"",type:r.type||"",compliance_area:r.compliance_area||"",
      description:r.description||"",trainer_name:r.trainer_name||"",trainer_org:r.trainer_org||"",
      location:r.location||"",mode:r.mode||"classroom",status:r.status||"Planned",
      start_at:r.start_at?new Date(r.start_at).toISOString().slice(0,16):"",
      end_at:r.end_at?new Date(r.end_at).toISOString().slice(0,16):"",
      max_seats:r.max_seats||"",
      audience_scope:r.audience_scope||"employees",
      dept_ids:r.dept_ids||[],employee_ids:r.employee_ids||[],
      tags:(r.tags||[]).join(", "),file:null
    });
    if(fileRef.current) fileRef.current.value="";
    setMailOpen(false);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const delRow=(id)=>{
    const runner=async()=>{
      const {error}=await supabase.from("training_program").delete().eq("id",id);
      if(error) throw error;
      await reload();
      if(form.id===id) reset();
      return true;
    };
    toast.promise(runner(),{loading:"Deleting…",success:"Deleted",error:(e)=>e?.message||"Delete failed"});
  };

  const openMaterial=async(row)=>{
    const {data,error}=await supabase.from("training_material").select("storage_path").eq("program_id",row.id).order("uploaded_at",{ascending:false}).limit(1).single();
    if(error||!data?.storage_path){ toast.error("No materials"); return; }
    const sig=await supabase.storage.from(BUCKET).createSignedUrl(data.storage_path,60);
    if(sig.error){ toast.error("Open failed"); return; }
    window.open(sig.data.signedUrl,"_blank");
  };

  /* ───── employee selection utilities ───── */
  const filteredEmployees=useMemo(()=>{
    let list=[...(employees||[])];
    if(empDeptFilter) list=list.filter((e)=>e.department_uid===empDeptFilter);
    if(empSearch.trim()){
      const q=empSearch.toLowerCase();
      list=list.filter((e)=>empLabel(e).toLowerCase().includes(q));
    }
    return list;
  },[employees,empDeptFilter,empSearch]);

  const addDeptEmployees=()=>{
    if(!form.dept_ids?.length){ toast.error("Pick departments"); return; }
    const ids=new Set(form.employee_ids||[]);
    for(const e of employees){
      if(form.dept_ids.includes(e.department_uid)) ids.add(e.id);
    }
    setForm((F)=>({...F,employee_ids:Array.from(ids)}));
    toast.success("Employees added from departments");
  };

  const selectAllFiltered=()=>{
    const ids=new Set(form.employee_ids||[]);
    for(const e of filteredEmployees) ids.add(e.id);
    setForm((F)=>({...F,employee_ids:Array.from(ids)}));
  };
  const clearSelected=()=>setForm((F)=>({...F,employee_ids:[]}));

  /* ───── email send ───── */
  const resolveRecipients=()=>{
    if(form.audience_scope==="all"){
      return employees.map((e)=>e.email).filter(Boolean);
    }
    if(form.audience_scope==="dept"){
      const set=new Set(form.dept_ids);
      return employees.filter((e)=>set.has(e.department_uid)).map((e)=>e.email).filter(Boolean);
    }
    const set=new Set(form.employee_ids||[]);
    return employees.filter((e)=>set.has(e.id)).map((e)=>e.email).filter(Boolean);
  };

  const sendEmail=()=>{
    const runner=async()=>{
      const emails=resolveRecipients();
      if(!emails.length) throw new Error("No recipients");
      try{
        // If you deployed an Edge Function named 'send_training_email'
        const r=await supabase.functions.invoke("send_training_email",{body:{subject:mailSubject,body:mailBody,recipients:emails}});
        if(r.error) throw r.error;
        return "sent";
      }catch{
        // Fallback: open default client (chunk bcc into groups)
        const chunk=(arr,n)=>arr.length? [arr.slice(0,n),...chunk(arr.slice(n),n)]:[];
        for(const group of chunk(emails,30)){
          const url=`mailto:?bcc=${encodeURIComponent(group.join(","))}&subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
          window.open(url,"_blank");
        }
        return "opened";
      }
    };
    toast.promise(runner(),{loading:"Sending…",success:"Email flow triggered",error:(e)=>e?.message||"Send failed"});
  };

  /* ───── PDF report ───── */
  const generatePdf=()=>{
    const runner=async()=>{
      // collect data
      const selected=resolveRecipients();
      const chosen=employees.filter((e)=>selected.includes(e.email));
      // try jsPDF
      try{
        const {jsPDF}=await import("jspdf");
        const dataUrl=await imgToDataUrl(logo);
        const doc=new jsPDF({unit:"pt",format:"a4"});
        let y=40;

        // header
        doc.addImage(dataUrl,"PNG",40,y,48,48); 
        doc.setFontSize(18); doc.text(companyName,100,y+18);
        doc.setFontSize(12); doc.text("Training Report",100,y+36);
        y+=70;

        // program details
        const L=(k,v)=>{doc.setFont(undefined,"bold");doc.text(`${k}:`,40,y);doc.setFont(undefined,"normal");doc.text(String(v||"-"),140,y); y+=18;};
        L("Title",form.title||"—");
        L("Type",form.type||"—");
        L("Compliance",form.compliance_area||"—");
        L("When",form.start_at?new Date(form.start_at).toLocaleString():"—");
        L("Mode",form.mode||"—");
        L("Location",form.location||"—");
        y+=6; doc.text("Participants:",40,y); y+=16;

        // participants list
        doc.setFontSize(11);
        let idx=1;
        for(const e of chosen){
          if(y>780){doc.addPage(); y=40;}
          doc.text(`${idx}. ${e.employee_id} — ${e.first_name} ${e.last_name}`,60,y);
          const d=deptMap.get(e.department_uid);
          if(d) doc.text(`${d.department_name}`,360,y);
          y+=16; idx++;
        }
        doc.save(`Training_${(form.title||"report").replace(/\s+/g,"_")}.pdf`);
        return true;
      }catch{
        // fallback: printable HTML
        const w=window.open("","_blank","width=900,height=700");
        if(!w) throw new Error("Popup blocked");
        const when=form.start_at?new Date(form.start_at).toLocaleString():"—";
        const rows=chosen.map((e)=>`<tr><td>${e.employee_id}</td><td>${e.first_name} ${e.last_name}</td><td>${deptLabel(deptMap.get(e.department_uid))}</td></tr>`).join("");
        w.document.write(`
          <html><head><title>Training Report</title>
          <style>
            body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu; padding:24px;}
            h1{margin:0 0 4px 0;color:#1e3a8a}
            table{border-collapse:collapse;width:100%}
            th,td{border:1px solid #ddd;padding:6px;font-size:12px}
            th{background:#f1f5f9}
          </style></head><body>
          <div style="display:flex;align-items:center;gap:12px">
            <img src="${logo}" style="height:48px"/>
            <div>
              <h1>${companyName}</h1>
              <div>Training Report</div>
            </div>
          </div>
          <hr/>
          <p><b>Title:</b> ${form.title||"-"}<br/>
          <b>Type:</b> ${form.type||"-"} &nbsp; <b>Compliance:</b> ${form.compliance_area||"-"}<br/>
          <b>When:</b> ${when} &nbsp; <b>Mode:</b> ${form.mode||"-"} &nbsp; <b>Location:</b> ${form.location||"-"}</p>
          <table><thead><tr><th>Emp ID</th><th>Name</th><th>Department</th></tr></thead>
          <tbody>${rows||"<tr><td colspan='3'>No participants</td></tr>"}</tbody></table>
          <script>window.print();</script>
          </body></html>`);
        w.document.close();
        return true;
      }
    };
    toast.promise(runner(),{loading:"Generating PDF…",success:"Report ready",error:(e)=>e?.message||"PDF failed"});
  };

  const statusTone=(s)=>{
    const v=String(s||"").toLowerCase();
    if(v==="planned") return "planned";
    if(v==="scheduled") return "scheduled";
    if(v==="in progress") return "running";
    if(v==="completed") return "completed";
    if(v==="cancelled") return "cancelled";
    return "neutral";
  };

  return(
    <div className="p-3 space-y-4">
      <Toaster position="top-right"/>

      {/* Gradient header */}
      <div className="rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <GraduationCap className="h-5 w-5 text-white/90"/>
            <span>Training Management</span>
          </div>
          <div className="ml-auto flex gap-2">
            <Pill tone="planned">Planned</Pill>
            <Pill tone="scheduled">Scheduled</Pill>
            <Pill tone="running">In Progress</Pill>
            <Pill tone="completed">Completed</Pill>
            <Pill tone="cancelled">Cancelled</Pill>
          </div>
        </div>
      </div>

      {/* Create/Edit form */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold mb-1">{form.id?"Edit Training":"New Training"}</div>
        <form onSubmit={save} className="space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Labeled icon={Presentation} label="Title *">
              <input className="border rounded w-full p-2 pl-9 text-sm" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g., GMP Refresher 2025" required/>
            </Labeled>
            <Labeled icon={ClipboardList} label="Type *">
              <select className="border rounded w-full p-2 pl-9 text-sm" value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})} required>
                <option value="">Select Type</option>{TYPES.map((t)=><option key={t} value={t}>{t}</option>)}
              </select>
            </Labeled>
            <Labeled icon={ShieldCheck} label="Compliance Area">
              <select className="border rounded w-full p-2 pl-9 text-sm" value={form.compliance_area} onChange={(e)=>setForm({...form,compliance_area:e.target.value})}>
                <option value="">Select</option>{COMPLIANCE.map((t)=><option key={t} value={t}>{t}</option>)}
              </select>
            </Labeled>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Labeled icon={Globe2} label="Mode *">
              <select className="border rounded w-full p-2 pl-9 text-sm" value={form.mode} onChange={(e)=>setForm({...form,mode:e.target.value})} required>
                {MODES.map((m)=><option key={m} value={m}>{m}</option>)}
              </select>
            </Labeled>
            <Labeled icon={Video} label="Status *">
              <select className="border rounded w-full p-2 pl-9 text-sm" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} required>
                {STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
              </select>
            </Labeled>
            <Labeled icon={Clock3} label="Max Seats">
              <input type="number" min="1" className="border rounded w-full p-2 pl-9 text-sm" value={form.max_seats} onChange={(e)=>setForm({...form,max_seats:e.target.value})}/>
            </Labeled>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Labeled icon={CalendarClock} label="Start *">
              <input type="datetime-local" className="border rounded w-full p-2 pl-9 text-sm" value={form.start_at} onChange={(e)=>setForm({...form,start_at:e.target.value})} required/>
            </Labeled>
            <Labeled icon={CalendarClock} label="End">
              <input type="datetime-local" className="border rounded w-full p-2 pl-9 text-sm" value={form.end_at} onChange={(e)=>setForm({...form,end_at:e.target.value})}/>
            </Labeled>
            <Labeled icon={MapPin} label="Location">
              <input className="border rounded w-full p-2 pl-9 text-sm" value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})} placeholder="Training room, Zoom link…"/>
            </Labeled>
          </div>

          {/* Audience & Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Labeled icon={ClipboardList} label="Audience *">
              <select className="border rounded w-full p-2 pl-9 text-sm" value={form.audience_scope} onChange={(e)=>setForm({...form,audience_scope:e.target.value})}>
                <option value="all">All Employees</option>
                <option value="dept">Departments</option>
                <option value="employees">Selected Employees</option>
              </select>
            </Labeled>

            {form.audience_scope==="dept"&&(
              <div className="sm:col-span-2">
                <Labeled icon={Users} label="Departments">
                  <select multiple className="border rounded w-full p-2 pl-9 text-sm h-24" value={form.dept_ids} onChange={(e)=>setForm({...form,dept_ids:Array.from(e.target.selectedOptions).map((o)=>o.value)})}>
                    {departments.map((d)=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
                  </select>
                </Labeled>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="secondary" onClick={addDeptEmployees}>Add dept employees to list</Button>
                  <span className="text-xs text-slate-600">This merges into “Selected Employees” below.</span>
                </div>
              </div>
            )}
          </div>

          {/* Selected Employees picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="text-xs font-medium mb-1">Selected Employees ({form.employee_ids?.length||0})</div>
              <div className="border rounded p-2">
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {(form.employee_ids||[]).map((id)=>(
                    <span key={id} className="px-2 py-0.5 rounded border text-[11px] bg-white">
                      {empLabel(empMap.get(id))}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="outline" onClick={clearSelected}>Clear</Button>
                </div>
              </div>
            </div>

            {/* finder */}
            <div>
              <div className="text-xs font-medium mb-1">Add Employees</div>
              <div className="space-y-2 border rounded p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-blue-600"/>
                  <input className="border rounded w-full pl-8 pr-2 py-1.5 text-sm" placeholder="Search name/id…" value={empSearch} onChange={(e)=>setEmpSearch(e.target.value)}/>
                </div>
                <select className="border rounded w-full p-1.5 text-sm" value={empDeptFilter} onChange={(e)=>setEmpDeptFilter(e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map((d)=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
                </select>
                <div className="max-h-40 overflow-auto border rounded">
                  {filteredEmployees.length===0?(
                    <div className="text-xs text-center text-slate-500 py-2">No matches</div>
                  ):(
                    filteredEmployees.map((u)=>(
                      <label key={u.id} className="flex items-center gap-2 px-2 py-1 text-sm border-b last:border-b-0">
                        <input type="checkbox" checked={(form.employee_ids||[]).includes(u.id)} onChange={(e)=>{
                          const set=new Set(form.employee_ids||[]);
                          e.target.checked?set.add(u.id):set.delete(u.id);
                          setForm((F)=>({...F,employee_ids:Array.from(set)}));
                        }}/>
                        <span>{empLabel(u)}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={selectAllFiltered}>Select all filtered</Button>
                </div>
              </div>
            </div>
          </div>

          {/* Description + material */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Labeled icon={FileText} label="Description">
                <textarea rows={3} className="border rounded w-full p-2 pl-9 text-sm" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} placeholder="Learning objectives, SOP references, assessment method…"/>
              </Labeled>
            </div>
            <div>
              <Labeled icon={UploadCloud} label="Attach Material (PDF/PPT/etc.)">
                <input ref={fileRef} type="file" className="block w-full border rounded p-2 pl-9 text-sm" onChange={onPickFile}/>
              </Labeled>
            </div>
          </div>

          <Input placeholder="tags (comma separated)" value={form.tags} onChange={(e)=>setForm({...form,tags:e.target.value})}/>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={saving} className="inline-flex items-center gap-2">{form.id?<><Edit className="h-4 w-4"/>Update</>:<><UploadCloud className="h-4 w-4"/>Save</>}</Button>
            {form.id&&(
              <>
                <Button type="button" variant="outline" onClick={reset} className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4"/>Clear</Button>
                <Button type="button" variant="secondary" onClick={()=>setMailOpen((v)=>!v)} className="inline-flex items-center gap-2"><Mail className="h-4 w-4"/>Notify by Email</Button>
                <Button type="button" variant="secondary" onClick={generatePdf} className="inline-flex items-center gap-2"><Download className="h-4 w-4"/>Training Report</Button>
              </>
            )}
          </div>
        </form>

        {/* Email composer (collapsible) */}
        {mailOpen&&(
          <div className="mt-4 border rounded p-3 bg-blue-50/30">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-700"/> Email Notification
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium mb-1">Subject</label>
                <input className="border rounded w-full p-2 text-sm" value={mailSubject} onChange={(e)=>setMailSubject(e.target.value)}/>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium mb-1">Message</label>
                <textarea rows={5} className="border rounded w-full p-2 text-sm" value={mailBody} onChange={(e)=>setMailBody(e.target.value)}/>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button type="button" onClick={sendEmail} className="inline-flex items-center gap-2"><Mail className="h-4 w-4"/>Send</Button>
              <span className="text-xs text-slate-600">Uses Edge Function <code>send_training_email</code> if present, otherwise opens your mail client with BCC.</span>
            </div>
          </div>
        )}
      </Card>

      {/* Filter bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600"/>
            <input className="border rounded pl-9 pr-2 py-1.5 text-sm w-64" placeholder="Search title/trainer…" value={searchQ} onChange={(e)=>setSearchQ(e.target.value)}/>
          </div>
          <select className="border rounded px-2 py-1 text-sm" value={statusF} onChange={(e)=>setStatusF(e.target.value)}>
            <option value="">All Status</option>{STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={typeF} onChange={(e)=>setTypeF(e.target.value)}>
            <option value="">All Types</option>{TYPES.map((t)=><option key={t} value={t}>{t}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={modeF} onChange={(e)=>setModeF(e.target.value)}>
            <option value="">All Modes</option>{MODES.map((m)=><option key={m} value={m}>{m}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={deptF} onChange={(e)=>setDeptF(e.target.value)}>
            <option value="">All Depts</option>{departments.map((d)=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-2 text-left border">Title</th>
              <th className="p-2 text-left border">Type</th>
              <th className="p-2 text-left border">Compliance</th>
              <th className="p-2 text-left border">Audience</th>
              <th className="p-2 text-left border">Schedule</th>
              <th className="p-2 text-left border">Mode</th>
              <th className="p-2 text-left border">Status</th>
              <th className="p-2 text-left border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading?(
              Array.from({length:6}).map((_,i)=>(
                <tr key={`sk-${i}`} className="border-t">
                  {Array.from({length:8}).map((__,j)=><td key={j} className="p-2"><Skeleton className="h-4 w-full"/></td>)}
                </tr>
              ))
            ):filtered.length?(
              filtered.map((r)=>(
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 border">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-gray-600">{r.trainer_name}{r.trainer_org?` • ${r.trainer_org}`:""}</div>
                  </td>
                  <td className="p-2 border">{r.type||"—"}</td>
                  <td className="p-2 border">{r.compliance_area||"—"}</td>
                  <td className="p-2 border">
                    {r.audience_scope==="all"&&<Pill>All</Pill>}
                    {r.audience_scope==="dept"&&(
                      <div className="flex flex-wrap gap-1">
                        {(r.dept_ids||[]).map((id)=><Pill key={id}>{deptLabel(deptMap.get(id))}</Pill>)}
                      </div>
                    )}
                    {r.audience_scope==="employees"&&(
                      <div className="flex flex-wrap gap-1">
                        {(r.employee_ids||[]).slice(0,3).map((id)=><Pill key={id}>{empLabel(empMap.get(id))}</Pill>)}
                        {(r.employee_ids||[]).length>3&&<Pill>+{(r.employee_ids||[]).length-3}</Pill>}
                      </div>
                    )}
                  </td>
                  <td className="p-2 border text-xs">
                    <div className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-blue-600"/>{r.start_at?new Date(r.start_at).toLocaleString():"—"}</div>
                    <div className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-blue-600"/>{r.end_at?new Date(r.end_at).toLocaleString():"—"}</div>
                  </td>
                  <td className="p-2 border capitalize">{r.mode}</td>
                  <td className="p-2 border"><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                  <td className="p-2 border whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-emerald-50 hover:border-emerald-300" onClick={()=>openMaterial(r)}><Download className="h-3.5 w-3.5 text-emerald-600"/>Material</button>
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50 hover:border-blue-300" onClick={()=>editRow(r)}><Edit className="h-3.5 w-3.5 text-blue-600"/>Edit</button>
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300" onClick={()=>delRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            ):(
              <tr><td colSpan={8} className="p-4 text-center text-gray-500">No trainings</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ───────── small ui helpers ───────── */
const Labeled=({icon:Icon,label,children})=>(
  <div>
    <label className="block text-xs font-medium mb-1">{label}</label>
    <div className="relative">
      <Icon className="absolute left-3 top-3 h-4 w-4 text-blue-600 pointer-events-none"/>
      {children}
    </div>
  </div>
);

async function imgToDataUrl(src){
  const res=await fetch(src);
  const blob=await res.blob();
  return await new Promise((resolve)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.readAsDataURL(blob);
  });
}
