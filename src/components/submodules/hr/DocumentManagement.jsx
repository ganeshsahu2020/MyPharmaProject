// src/components/submodules/hr/DocumentManagement.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "../../../utils/supabaseClient";
import {useAuth} from "../../../contexts/AuthContext";
import toast,{Toaster} from "react-hot-toast";
import Button from "../../ui/button";
import {Card} from "../../ui/card";
import {Skeleton} from "../../ui/skeleton";
import {
  FolderOpen,Search,UploadCloud,Download,Trash2,Edit,Save,RotateCcw,User2,Tags,
  Briefcase,Banknote,CalendarDays,FileText,Shield,ShieldCheck,Star,UserCheck,MessageSquare,UserPlus
} from "lucide-react";

/* ───────────────────────── constants ───────────────────────── */
const BUCKET="hr_docs";
const DOC_TYPES=["Contract","Policy","Payslip","Appraisal","Offer Letter","Other"];

const FIELDS_BY_TYPE={
  "Contract":[
    {key:"designation",label:"Designation",type:"text",req:true,icon:Briefcase},
    {key:"salary",label:"Salary (CTC)",type:"text",req:true,icon:Banknote,inputMode:"decimal"},
    {key:"contract_start",label:"Start Date",type:"date",req:true,icon:CalendarDays},
    {key:"contract_end",label:"End Date",type:"date",req:false,icon:CalendarDays},
    {key:"terms",label:"Key Terms",type:"textarea",req:false,icon:FileText},
  ],
  "Policy":[
    {key:"policy_name",label:"Policy Name",type:"text",req:true,icon:Shield},
    {key:"policy_version",label:"Version",type:"text",req:false,icon:ShieldCheck},
    {key:"effective_date",label:"Effective Date",type:"date",req:true,icon:CalendarDays},
    {key:"summary",label:"Summary",type:"textarea",req:false,icon:FileText},
  ],
  "Payslip":[
    {key:"period_from",label:"Period From",type:"date",req:true,icon:CalendarDays},
    {key:"period_to",label:"Period To",type:"date",req:true,icon:CalendarDays},
    {key:"basic",label:"Basic Pay",type:"number",req:true,icon:Banknote,inputMode:"decimal"},
    {key:"allowances",label:"Allowances",type:"number",req:false,icon:Banknote,inputMode:"decimal"},
    {key:"deductions",label:"Deductions",type:"number",req:false,icon:Banknote,inputMode:"decimal"},
    {key:"net",label:"Net Pay",type:"number",req:true,icon:Banknote,inputMode:"decimal"},
  ],
  "Appraisal":[
    {key:"period_from",label:"Period From",type:"date",req:true,icon:CalendarDays},
    {key:"period_to",label:"Period To",type:"date",req:true,icon:CalendarDays},
    {key:"rating",label:"Rating (1-5)",type:"number",req:true,icon:Star,inputMode:"numeric"},
    {key:"reviewer",label:"Reviewer",type:"text",req:false,icon:UserCheck},
    {key:"remarks",label:"Remarks",type:"textarea",req:false,icon:MessageSquare},
  ],
  "Offer Letter":[
    {key:"candidate_name",label:"Candidate Name",type:"text",req:true,icon:UserPlus},
    {key:"position",label:"Position",type:"text",req:true,icon:Briefcase},
    {key:"offered_salary",label:"Offered Salary",type:"text",req:true,icon:Banknote,inputMode:"decimal"},
    {key:"joining_date",label:"Joining Date",type:"date",req:true,icon:CalendarDays},
    {key:"notes",label:"Notes",type:"textarea",req:false,icon:FileText},
  ],
  "Other":[
    {key:"description",label:"Description",type:"textarea",req:false,icon:FileText},
  ],
};

const empLabel=(e)=>e?`${e.employee_id} — ${e.first_name} ${e.last_name}`:"—";
const fmtDate=(iso)=>iso?new Date(iso).toLocaleString():"—";

/* visibility/status chips */
const PILL={
  all:"bg-white text-blue-700 border-blue-200",
  dept:"bg-white text-amber-700 border-amber-200",
  employee:"bg-white text-emerald-700 border-emerald-200",
  neutral:"bg-white text-slate-700 border-slate-200"
};
const Pill=({tone="neutral",children})=>(
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${PILL[tone]}`}>{children}</span>
);

const initialForm={
  id:null,title:"",doc_type:"",
  visibility:"employee",employee_uid:"",
  tags:"",form:{},
  file:null,file_name:"",storage_path:"",
  current_version_no:1
};

/* ───────────────────────── component ───────────────────────── */
export default function DocumentManagement(){
  const {session}=useAuth();
  const email=session?.user?.email||"";
  const fileRef=useRef(null);

  const [employees,setEmployees]=useState([]);
  const [docs,setDocs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("");
  const [employeeFilter,setEmployeeFilter]=useState("");
  const [tagFilter,setTagFilter]=useState("");

  const [form,setForm]=useState(initialForm);
  const [supportsFormJson,setSupportsFormJson]=useState(true);

  /* boot */
  useEffect(()=>{(async()=>{
    try{
      const probe=await supabase.from("hr_document").select("id,form_json").limit(1);
      if(probe.error&&String(probe.error.code)==="42703") setSupportsFormJson(false);
    }catch{ setSupportsFormJson(false); }

    try{
      const emps=await supabase
        .from("vw_user_management_ext")
        .select("id,employee_id,first_name,last_name,status")
        .order("employee_id",{ascending:true});
      if(emps.error) throw emps.error;
      setEmployees((emps.data||[]).filter((x)=>x.status==="Active"));
    }catch(err){ console.error(err); toast.error("Failed to load employees"); }
    await reloadDocs();
  })();},[]);

  const reloadDocs=async()=>{
    setLoading(true);
    try{
      const sel=supportsFormJson
        ?"id,title,doc_type,visibility,employee_uid,tags,form_json,storage_path,file_name,current_version_no,uploaded_by,uploaded_at"
        :"id,title,doc_type,visibility,employee_uid,tags,storage_path,file_name,current_version_no,uploaded_by,uploaded_at";
      const {data,error}=await supabase.from("hr_document").select(sel).order("uploaded_at",{ascending:false});
      if(error) throw error;
      setDocs((data||[]).map((r)=>({...r,form_json:r.form_json||null})));
    }catch(err){ console.error(err); toast.error(err.message||"Failed to load documents"); }
    finally{ setLoading(false); }
  };

  /* helpers */
  const onPickFile=(e)=>setForm((f)=>({...f,file:e.target.files?.[0]||null}));
  const resetForm=()=>{ setForm(initialForm); if(fileRef.current) fileRef.current.value=""; };
  const empById=useMemo(()=>{const m=new Map(); for(const e of employees) m.set(e.id,e); return m;},[employees]);
  const allTags=useMemo(()=>Array.from(new Set(docs.flatMap((d)=>d.tags||[]))).sort(),[docs]);

  const filtered=useMemo(()=>{
    let list=[...(docs||[])];
    if(typeFilter) list=list.filter((d)=>d.doc_type===typeFilter);
    if(employeeFilter) list=list.filter((d)=>d.employee_uid===employeeFilter);
    if(tagFilter) list=list.filter((d)=>(d.tags||[]).includes(tagFilter));
    if(search.trim()){
      const q=search.toLowerCase();
      list=list.filter((d)=>(d.title||"").toLowerCase().includes(q)||(d.file_name||"").toLowerCase().includes(q)||(d.tags||[]).some((t)=>t.toLowerCase().includes(q)));
    }
    return list;
  },[docs,typeFilter,employeeFilter,tagFilter,search]);

  const currentFields=useMemo(()=>FIELDS_BY_TYPE[form.doc_type]||[],[form.doc_type]);

  const uploadIfNeeded=async(currentPath)=>{
    if(!form.file) return {storage_path:currentPath,file_name:form.file_name||""};
    const safe=form.file.name.replace(/[^\w.\-]+/g,"_");
    const scope=form.employee_uid||"general";
    const key=`${scope}/${Date.now()}_${safe}`;
    const up=await supabase.storage.from(BUCKET).upload(key,form.file,{upsert:false});
    if(up.error) throw up.error;
    return {storage_path:key,file_name:form.file.name};
  };

  /* CRUD with toast.promise */
  const save=async(e)=>{
    e?.preventDefault?.();
    if(!form.title.trim()) return toast.error("Title is required");
    if(!form.doc_type) return toast.error("Pick a document type");
    if(!form.employee_uid) return toast.error("Select an employee");
    for(const f of currentFields){ if(f.req&&!String(form.form?.[f.key]||"").trim()) return toast.error(`${f.label} is required`); }

    setSaving(true);
    const runner=async()=>{
      const tagsArr=(form.tags||"").split(",").map((s)=>s.trim()).filter(Boolean);
      const up=await uploadIfNeeded(form.storage_path);
      const base={
        title:form.title.trim(),
        doc_type:form.doc_type,
        visibility:"employee",
        employee_uid:form.employee_uid,
        tags:tagsArr,
        storage_path:up.storage_path||form.storage_path||null,
        file_name:up.file_name||form.file_name||null,
        current_version_no:(up.file_name&&up.storage_path!==form.storage_path)?Number(form.current_version_no||1)+1:Number(form.current_version_no||1),
        uploaded_by:email||form.uploaded_by||""
      };
      const payload=supportsFormJson?{...base,form_json:form.form||{}}:{...base,tags:[...tagsArr,...Object.entries(form.form||{}).map(([k,v])=>`${k}:${v}`)]};
      if(!form.id){ const ins=await supabase.from("hr_document").insert([payload]); if(ins.error) throw ins.error; }
      else{ const upd=await supabase.from("hr_document").update(payload).eq("id",form.id); if(upd.error) throw upd.error; }
      resetForm();
      await reloadDocs();
      return true;
    };

    await toast.promise(runner(),{loading:form.id?"Updating…":"Saving…",success:form.id?"Updated":"Saved",error:(err)=>err?.message||"Failed"});
    setSaving(false);
  };

  const del=async(row)=>{
    const runner=async()=>{ const r=await supabase.from("hr_document").delete().eq("id",row.id); if(r.error) throw r.error; if(form.id===row.id) resetForm(); await reloadDocs(); return true; };
    await toast.promise(runner(),{loading:"Deleting…",success:"Deleted",error:(err)=>err?.message||"Delete failed"});
  };

  const download=async(row)=>{
    const runner=async()=>{
      if(!row.storage_path) throw new Error("No file attached");
      const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path,60);
      if(error) throw error;
      window.open(data.signedUrl,"_blank");
      return true;
    };
    await toast.promise(runner(),{loading:"Preparing download…",success:"Download ready",error:(err)=>err?.message||"Download failed"});
  };

  /* input with icon (no overlap) */
  const InputWrap=({Icon,children})=>(
    <div className="relative">
      {Icon&&<Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600 pointer-events-none" />}
      {children}
    </div>
  );

  /* dynamic field renderer with themed icon + mobile grid */
  const renderField=(cfg)=>{
    const v=form.form?.[cfg.key]??"";
    const setVal=(val)=>setForm((F)=>({...F,form:{...(F.form||{}),[cfg.key]:val}}));
    const Icon=cfg.icon||FileText;
    if(cfg.type==="textarea"){
      return(
        <div key={cfg.key} className="sm:col-span-2">
          <label className="block text-xs font-medium mb-1">{cfg.label}{cfg.req&&" *"}</label>
          <div className="relative">
            <Icon className="absolute left-3 top-3 h-4 w-4 text-blue-600 pointer-events-none"/>
            <textarea rows={3} className="border rounded w-full p-2 pl-9 text-sm" value={v} onChange={(e)=>setVal(e.target.value)} required={cfg.req}/>
          </div>
        </div>
      );
    }
    return(
      <div key={cfg.key}>
        <label className="block text-xs font-medium mb-1">{cfg.label}{cfg.req&&" *"}</label>
        <InputWrap Icon={Icon}>
          <input type={cfg.type||"text"} inputMode={cfg.inputMode} className="border rounded w-full p-2 pl-9 text-sm" value={v} onChange={(e)=>setVal(e.target.value)} required={cfg.req}/>
        </InputWrap>
      </div>
    );
  };

  return(
    <div className="p-3 space-y-4">
      <Toaster position="top-right" />

      {/* gradient header (aligned with other modules) */}
      <div className="rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 py-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FolderOpen className="h-5 w-5 text-white/90"/><span>HR Document Management</span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Pill tone="all">All</Pill>
            <Pill tone="dept">Dept</Pill>
            <Pill tone="employee">Employee</Pill>
          </div>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <InputWrap Icon={Search}>
            <input className="border rounded w-full p-2 pl-9 text-sm" placeholder="Search title/tags/file" value={search} onChange={(e)=>setSearch(e.target.value)} enterKeyHint="search" />
          </InputWrap>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full md:w-auto">
          <InputWrap Icon={FileText}>
            <select className="border rounded p-2 pl-9 text-sm w-full" value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}>
              <option value="">All Types</option>{DOC_TYPES.map((t)=><option key={t} value={t}>{t}</option>)}
            </select>
          </InputWrap>
          <InputWrap Icon={User2}>
            <select className="border rounded p-2 pl-9 text-sm w-full" value={employeeFilter} onChange={(e)=>setEmployeeFilter(e.target.value)}>
              <option value="">All Employees</option>{employees.map((e)=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select>
          </InputWrap>
          <InputWrap Icon={Tags}>
            <select className="border rounded p-2 pl-9 text-sm w-full" value={tagFilter} onChange={(e)=>setTagFilter(e.target.value)}>
              <option value="">All Tags</option>{Array.from(new Set(docs.flatMap((d)=>d.tags||[]))).map((t)=><option key={t} value={t}>{t}</option>)}
            </select>
          </InputWrap>
        </div>
      </div>

      {/* form card */}
      <Card className="p-4 space-y-3">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Employee *</label>
              <InputWrap Icon={User2}>
                <select className="border rounded w-full p-2 pl-9 text-sm" value={form.employee_uid} onChange={(e)=>setForm({...form,employee_uid:e.target.value})} required>
                  <option value="">Select Employee</option>
                  {employees.map((e)=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                </select>
              </InputWrap>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Type *</label>
              <InputWrap Icon={FileText}>
                <select className="border rounded w-full p-2 pl-9 text-sm" value={form.doc_type} onChange={(e)=>{setForm({...form,doc_type:e.target.value,form:{}});}} required>
                  <option value="">Select Type</option>{DOC_TYPES.map((t)=><option key={t} value={t}>{t}</option>)}
                </select>
              </InputWrap>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Title *</label>
              <InputWrap Icon={FileText}>
                <input className="border rounded w-full p-2 pl-9 text-sm" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="e.g., Contract 2025" required/>
              </InputWrap>
            </div>
          </div>

          {/* dynamic fields (mobile friendly grid) */}
          {currentFields.length>0&&(
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{currentFields.map(renderField)}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1">Tags (comma separated)</label>
              <InputWrap Icon={Tags}>
                <input className="border rounded w-full p-2 pl-9 text-sm" value={form.tags} onChange={(e)=>setForm({...form,tags:e.target.value})} placeholder="policy, FY2025"/>
              </InputWrap>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Attach File (optional)</label>
              <input ref={fileRef} type="file" className="block w-full text-sm border rounded p-2" onChange={onPickFile}/>
              {form.file_name&&<div className="text-xs text-gray-600 mt-1">Current: <b>{form.file_name}</b> <Pill tone="neutral">v{form.current_version_no}</Pill></div>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving} className="inline-flex items-center gap-2">
              {form.id?<><Save className="h-4 w-4"/>Update</>:<><UploadCloud className="h-4 w-4"/>Save</>}
            </Button>
            {form.id&&(
              <Button type="button" variant="secondary" onClick={resetForm} className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4"/>Reset
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* table */}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-2 border text-left">Title</th>
              <th className="p-2 border text-left">Type</th>
              <th className="p-2 border text-left">Visibility</th>
              <th className="p-2 border text-left">Employee</th>
              <th className="p-2 border text-left">Key Fields</th>
              <th className="p-2 border text-left">Tags</th>
              <th className="p-2 border text-left">Version</th>
              <th className="p-2 border text-left">File</th>
              <th className="p-2 border text-left">Uploaded By</th>
              <th className="p-2 border text-left">Uploaded At</th>
              <th className="p-2 border text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading?(
              Array.from({length:6}).map((_,i)=>(
                <tr key={`sk-${i}`} className="border-t">
                  {Array.from({length:11}).map((__,j)=>(
                    <td key={j} className="p-2"><Skeleton className="h-4 w-full"/></td>
                  ))}
                </tr>
              ))
            ):filtered.length?(
              filtered.map((row)=>(
                <tr key={row.id} className="border-t align-top">
                  <td className="p-2 border">{row.title}</td>
                  <td className="p-2 border">{row.doc_type}</td>
                  <td className="p-2 border">
                    {row.visibility==="employee"&&<Pill tone="employee">Employee</Pill>}
                    {row.visibility==="dept"&&<Pill tone="dept">Dept</Pill>}
                    {row.visibility==="all"&&<Pill tone="all">All</Pill>}
                  </td>
                  <td className="p-2 border">
                    <span className="inline-flex items-center gap-1">
                      <User2 className="h-3.5 w-3.5 text-blue-600"/>
                      {empLabel(empById.get(row.employee_uid))}
                    </span>
                  </td>
                  <td className="p-2 border">
                    {renderSummaryPills(row.doc_type,row.form_json||parseKeyValueTags(row.tags))}
                  </td>
                  <td className="p-2 border">
                    {(row.tags||[]).length?(
                      <div className="flex flex-wrap gap-1">
                        {row.tags.map((t)=><span key={`${row.id}-${t}`} className="px-2 py-0.5 rounded border text-[10px] bg-white">{t}</span>)}
                      </div>
                    ):"—"}
                  </td>
                  <td className="p-2 border"><Pill tone="neutral">v{row.current_version_no||1}</Pill></td>
                  <td className="p-2 border">{row.file_name||"—"}</td>
                  <td className="p-2 border">{row.uploaded_by||"—"}</td>
                  <td className="p-2 border">{fmtDate(row.uploaded_at)}</td>
                  <td className="p-2 border">
                    <div className="inline-flex gap-2">
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50 hover:border-blue-300" onClick={()=>setForm({
                        id:row.id,title:row.title||"",doc_type:row.doc_type||"",visibility:"employee",employee_uid:row.employee_uid||"",
                        tags:(row.tags||[]).join(", "),form:row.form_json||parseKeyValueTags(row.tags),file:null,file_name:row.file_name||"",
                        storage_path:row.storage_path||"",current_version_no:row.current_version_no||1
                      })}><Edit className="h-3.5 w-3.5 text-indigo-600"/>Edit</button>
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300" onClick={()=>del(row)}><Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete</button>
                      <button disabled={!row.storage_path} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50" onClick={()=>download(row)}><Download className="h-3.5 w-3.5 text-emerald-600"/>Download</button>
                    </div>
                  </td>
                </tr>
              ))
            ):(
              <tr><td colSpan={11} className="p-4 text-center text-gray-500">No documents</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */
function parseKeyValueTags(tags){
  const m={};
  for(const t of tags||[]){ const i=String(t).indexOf(":"); if(i>0){ const k=t.slice(0,i); const v=t.slice(i+1); m[k]=v; } }
  return m;
}
function renderSummaryPills(type,formObj){
  const fields=(FIELDS_BY_TYPE[type]||[]).map((f)=>f.key);
  const pairs=Object.entries(formObj||{}).filter(([k])=>fields.includes(k)).slice(0,4);
  if(!pairs.length) return "—";
  return(
    <div className="flex flex-wrap gap-1">
      {pairs.map(([k,v])=>(
        <span key={k} className="px-2 py-0.5 rounded border text-[10px] bg-white">{k}: {String(v)}</span>
      ))}
    </div>
  );
}
