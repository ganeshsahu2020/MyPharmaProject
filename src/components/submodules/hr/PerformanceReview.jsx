// src/components/submodules/hr/PerformanceReview.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "../../../utils/supabaseClient";
import {useAuth} from "../../../contexts/AuthContext";
import toast from "react-hot-toast";
import Button from "../../ui/button";
import {Card} from "../../ui/card";
import {Skeleton} from "../../ui/skeleton";
import {
  FolderOpen,Search,User2,UserCheck,Calendar,ClipboardList,TrendingUp,
  Plus,Edit,Save,Trash2,CheckCircle2,RefreshCcw,Filter
} from "lucide-react";

const STATUS_COLORS={Draft:"bg-blue-50 text-blue-700 border-blue-200", "In Review":"bg-amber-50 text-amber-700 border-amber-200", Finalized:"bg-emerald-50 text-emerald-700 border-emerald-200", Approved:"bg-indigo-50 text-indigo-700 border-indigo-200", Rejected:"bg-rose-50 text-rose-700 border-rose-200"};
const Badge=({s})=>(<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${STATUS_COLORS[s]||"bg-slate-50 text-slate-700 border-slate-200"}`}>{s||"—"}</span>);
const fmt=(d)=>d?new Date(d).toLocaleDateString(): "—";
const empLabel=(e)=>e?`${e.employee_id} — ${e.first_name} ${e.last_name}`:"—";

const emptyForm={
  id:null,
  employee_uid:"",
  reviewer_uid:"",
  period_from:"",
  period_to:"",
  review_date:"",
  reviewer:"",
  role:"",
  gmp_compliance:0,
  sop_adherence:0,
  deviations_count:0,
  training_score:0,
  attendance_score:0,
  competency_json:{competency_safety:0,competency_sop:0,competency_quality:0,competency_teamwork:0,competency_ownership:0},
  goals:"",
  achievements:"",
  manager_notes:"",
  status:"Draft"
};

export default function PerformanceReview(){
  const {session}=useAuth();
  const [me,setMe]=useState(null); // current user_management row
  const [employees,setEmployees]=useState([]);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState(emptyForm);

  const [q,setQ]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [empFilter,setEmpFilter]=useState("");
  const [periodFilter,setPeriodFilter]=useState("");

  const periodFromRef=useRef(null);
  const periodToRef=useRef(null);

  useEffect(()=>{(async()=>{
    try{
      setLoading(true);

      // whoami → user_management row by auth.uid() (fallback to email)
      let who=null;
      try{
        const r=await supabase.rpc("app_whoami");
        if(!r.error && Array.isArray(r.data) && r.data.length) who=r.data[0];
      }catch{ /* ignore */ }
      if(!who){
        const r=await supabase.from("user_management").select("*").eq("email",session?.user?.email||"").maybeSingle();
        if(!r.error) who=r.data;
      }
      setMe(who||null);

      const emps=await supabase.from("user_management").select("id,employee_id,first_name,last_name,status,department_uid").order("employee_id",{ascending:true});
      if(emps.error) throw emps.error;
      setEmployees((emps.data||[]).filter((e)=>e.status!=="Inactive"));

      await loadReviews();
    }catch(err){
      console.error(err);
      toast.error("Failed to load Performance Reviews");
    }finally{ setLoading(false); }
  })();},[]);

  const loadReviews=async()=>{
    const sel="id,employee_uid,reviewer_uid,period_from,period_to,review_date,reviewer,role,gmp_compliance,sop_adherence,deviations_count,training_score,attendance_score,competency_json,goals,achievements,manager_notes,overall_score,rating,status,created_at,updated_at";
    const r=await supabase.from("vw_performance_review_ext").select(`${sel},employee_code,employee_first_name,employee_last_name,reviewer_code,reviewer_first_name,reviewer_last_name`).order("created_at",{ascending:false});
    if(r.error){
      // fallback to base table
      const b=await supabase.from("performance_review").select(sel).order("created_at",{ascending:false});
      if(b.error) throw b.error;
      setRows(b.data||[]);
    }else{
      setRows(r.data||[]);
    }
  };

  const empById=useMemo(()=>{const m=new Map(); for(const e of employees) m.set(e.id,e); return m;},[employees]);

  const filtered=useMemo(()=>{
    let list=[...(rows||[])];
    if(empFilter) list=list.filter((r)=>r.employee_uid===empFilter);
    if(statusFilter) list=list.filter((r)=>r.status===statusFilter);
    if(periodFilter==="current"){
      const now=new Date(); list=list.filter((r)=>new Date(r.period_from)<=now && now<=new Date(r.period_to));
    }
    if(q.trim()){
      const s=q.toLowerCase();
      list=list.filter((r)=>{
        const e=empById.get(r.employee_uid);
        return (r.reviewer||"").toLowerCase().includes(s)
          || (r.role||"").toLowerCase().includes(s)
          || (r.goals||"").toLowerCase().includes(s)
          || (r.achievements||"").toLowerCase().includes(s)
          || (r.manager_notes||"").toLowerCase().includes(s)
          || (e?empLabel(e).toLowerCase().includes(s):false);
      });
    }
    return list;
  },[rows,empFilter,statusFilter,periodFilter,q,empById]);

  const startNew=()=>{
    setForm({
      ...emptyForm,
      reviewer_uid:me?.id||"",
      reviewer:me?`${me.first_name||""} ${me.last_name||""}`.trim():""
    });
    periodFromRef.current?.focus?.();
  };

  const edit=(row)=>{
    setForm({
      id:row.id,
      employee_uid:row.employee_uid,
      reviewer_uid:row.reviewer_uid,
      period_from:row.period_from,
      period_to:row.period_to,
      review_date:row.review_date,
      reviewer:row.reviewer||"",
      role:row.role||"",
      gmp_compliance:row.gmp_compliance||0,
      sop_adherence:row.sop_adherence||0,
      deviations_count:row.deviations_count||0,
      training_score:row.training_score||0,
      attendance_score:row.attendance_score||0,
      competency_json:row.competency_json||{competency_safety:0,competency_sop:0,competency_quality:0,competency_teamwork:0,competency_ownership:0},
      goals:row.goals||"",
      achievements:row.achievements||"",
      manager_notes:row.manager_notes||"",
      status:row.status||"Draft"
    });
    periodFromRef.current?.focus?.();
  };

  const resetForm=()=>setForm((_)=>emptyForm);

  const save=async(e)=>{
    e?.preventDefault?.();
    if(!form.employee_uid) return toast.error("Select employee");
    if(!form.reviewer_uid) return toast.error("Reviewer missing");
    if(!form.period_from || !form.period_to) return toast.error("Select period");
    if(new Date(form.period_from)>new Date(form.period_to)) return toast.error("Period From cannot be after Period To");

    const payload={...form};
    delete payload.id;

    const p=form.id
      ? supabase.from("performance_review").update(payload).eq("id",form.id)
      : supabase.from("performance_review").insert([payload]);

    await toast.promise(p,{
      loading: form.id?"Updating review…":"Creating review…",
      success: "Saved",
      error: (err)=>err?.message||"Save failed"
    });

    resetForm();
    await loadReviews();
  };

  const finalize=async(row)=>{
    const p=supabase.from("performance_review").update({status:"Finalized"}).eq("id",row.id);
    await toast.promise(p,{loading:"Finalizing…",success:"Finalized",error:(e)=>e?.message||"Failed"});
    await loadReviews();
  };

  const remove=async(row)=>{
    if(!window.confirm("Delete this review?")) return;
    const p=supabase.from("performance_review").delete().eq("id",row.id);
    await toast.promise(p,{loading:"Deleting…",success:"Deleted",error:(e)=>e?.message||"Delete failed"});
    if(form.id===row.id) resetForm();
    await loadReviews();
  };

  const CompetencyInput=({k,label})=>{
    const v=Number(form.competency_json?.[k]??0);
    return(
      <div>
        <label className="block text-xs font-medium mb-1">{label}</label>
        <input type="number" min={0} max={5} step="0.1" className="border rounded w-full p-2 text-sm"
          value={v}
          onChange={(e)=>setForm((F)=>({...F,competency_json:{...(F.competency_json||{}),[k]:Number(e.target.value)}}))}
        />
      </div>
    );
  };

  return(
    <div className="p-3 space-y-4">
      {/* Brand header */}
      <div className="rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 py-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <FolderOpen className="h-5 w-5 text-white/90"/>
            Performance Review
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-blue-900 bg-white/95 px-2 py-0.5 rounded-full text-xs font-medium">Draft</span>
            <span className="text-amber-900 bg-white/95 px-2 py-0.5 rounded-full text-xs font-medium">In Review</span>
            <span className="text-emerald-900 bg-white/95 px-2 py-0.5 rounded-full text-xs font-medium">Finalized</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-gray-500 absolute left-2 top-2.5"/>
            <input className="border rounded pl-8 pr-2 py-1.5 text-sm w-64" placeholder="Search reviewer/notes/goals"
              value={q} onChange={(e)=>setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600"/>
            <select className="border rounded px-2 py-1.5 text-sm" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              {["Draft","In Review","Finalized","Approved","Rejected"].map((s)=><option key={s} value={s}>{s}</option>)}
            </select>
            <select className="border rounded px-2 py-1.5 text-sm" value={empFilter} onChange={(e)=>setEmpFilter(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map((e)=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select>
            <select className="border rounded px-2 py-1.5 text-sm" value={periodFilter} onChange={(e)=>setPeriodFilter(e.target.value)}>
              <option value="">Any Period</option>
              <option value="current">Current Period</option>
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={startNew} className="inline-flex items-center gap-2"><Plus className="h-4 w-4"/>New</Button>
            <Button variant="outline" onClick={()=>loadReviews()} className="inline-flex items-center gap-2"><RefreshCcw className="h-4 w-4"/>Refresh</Button>
          </div>
        </div>
      </Card>

      {/* Form */}
      <Card className="p-4 space-y-3">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Employee *</label>
              <div className="relative">
                <User2 className="h-4 w-4 text-indigo-600 absolute left-2 top-2.5"/>
                <select className="border rounded w-full pl-8 p-2 text-sm"
                  value={form.employee_uid}
                  onChange={(e)=>setForm({...form,employee_uid:e.target.value})} required>
                  <option value="">Select employee</option>
                  {employees.map((e)=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Reviewer *</label>
              <div className="relative">
                <UserCheck className="h-4 w-4 text-blue-600 absolute left-2 top-2.5"/>
                <select className="border rounded w-full pl-8 p-2 text-sm"
                  value={form.reviewer_uid}
                  onChange={(e)=>setForm({...form,reviewer_uid:e.target.value})} required>
                  <option value="">Select reviewer</option>
                  {employees.map((e)=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Role (Snapshot)</label>
              <input className="border rounded w-full p-2 text-sm" value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})} placeholder="QA Associate"/>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Period From *</label>
              <div className="relative">
                <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-2.5"/>
                <input ref={periodFromRef} type="date" className="border rounded w-full pl-8 p-2 text-sm"
                  value={form.period_from} onChange={(e)=>setForm({...form,period_from:e.target.value})} required/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Period To *</label>
              <div className="relative">
                <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-2.5"/>
                <input ref={periodToRef} type="date" className="border rounded w-full pl-8 p-2 text-sm"
                  value={form.period_to} onChange={(e)=>setForm({...form,period_to:e.target.value})} required/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Review Date</label>
              <div className="relative">
                <Calendar className="h-4 w-4 text-blue-600 absolute left-2 top-2.5"/>
                <input type="date" className="border rounded w-full pl-8 p-2 text-sm"
                  value={form.review_date||""} onChange={(e)=>setForm({...form,review_date:e.target.value})}/>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Num label="GMP Compliance" v={form.gmp_compliance} set={(v)=>setForm({...form,gmp_compliance:v})}/>
            <Num label="SOP Adherence" v={form.sop_adherence} set={(v)=>setForm({...form,sop_adherence:v})}/>
            <Num label="Deviations" v={form.deviations_count} set={(v)=>setForm({...form,deviations_count:v})} min={0} max={999}/>
            <Num label="Training Score" v={form.training_score} set={(v)=>setForm({...form,training_score:v})}/>
            <Num label="Attendance Score" v={form.attendance_score} set={(v)=>setForm({...form,attendance_score:v})}/>
          </div>

          {/* Competencies */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <CompetencyInput k="competency_safety" label="Safety (0-5)"/>
            <CompetencyInput k="competency_sop" label="SOP (0-5)"/>
            <CompetencyInput k="competency_quality" label="Quality (0-5)"/>
            <CompetencyInput k="competency_teamwork" label="Teamwork (0-5)"/>
            <CompetencyInput k="competency_ownership" label="Ownership (0-5)"/>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TA label="Goals" v={form.goals} set={(v)=>setForm({...form,goals:v})}/>
            <TA label="Achievements" v={form.achievements} set={(v)=>setForm({...form,achievements:v})}/>
            <TA label="Manager Notes" v={form.manager_notes} set={(v)=>setForm({...form,manager_notes:v})}/>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving} className="inline-flex items-center gap-2">
              {form.id? <><Save className="h-4 w-4"/>Update</> : <><Save className="h-4 w-4"/>Save</>}
            </Button>
            {form.id && <Button type="button" variant="secondary" onClick={resetForm} className="inline-flex items-center gap-2"><RefreshCcw className="h-4 w-4"/>Reset</Button>}
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border text-left">Employee</th>
              <th className="p-2 border text-left">Period</th>
              <th className="p-2 border text-left">Reviewer</th>
              <th className="p-2 border text-left">KPI</th>
              <th className="p-2 border text-left">Competency</th>
              <th className="p-2 border text-left">Overall</th>
              <th className="p-2 border text-left">Status</th>
              <th className="p-2 border text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading?(
              Array.from({length:6}).map((_,i)=>(
                <tr key={`sk-${i}`} className="animate-pulse">
                  {Array.from({length:8}).map((__,j)=>(
                    <td key={j} className="p-2 border"><Skeleton className="h-4 w-32"/></td>
                  ))}
                </tr>
              ))
            ):filtered.length?(
              filtered.map((r)=>(
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 border">
                    <div className="inline-flex items-center gap-1">
                      <User2 className="h-3.5 w-3.5 text-indigo-600"/>
                      {empLabel(empById.get(r.employee_uid))}
                    </div>
                  </td>
                  <td className="p-2 border">{fmt(r.period_from)} → {fmt(r.period_to)}</td>
                  <td className="p-2 border">{r.reviewer||empLabel(empById.get(r.reviewer_uid))}</td>
                  <td className="p-2 border">
                    <div className="text-xs">
                      GMP {r.gmp_compliance}% • SOP {r.sop_adherence}% • DEV {r.deviations_count} • TRN {r.training_score}% • ATT {r.attendance_score}%
                    </div>
                  </td>
                  <td className="p-2 border">
                    <div className="text-xs">
                      {["competency_safety","competency_sop","competency_quality","competency_teamwork","competency_ownership"].map((k)=>(
                        <span key={k} className="mr-2">{(r.competency_json?.[k]??0).toFixed(1)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 border">
                    <div className="inline-flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600"/>
                      <b>{Number(r.overall_score||0).toFixed(1)}</b> (★{r.rating})
                    </div>
                  </td>
                  <td className="p-2 border"><Badge s={r.status}/></td>
                  <td className="p-2 border">
                    <div className="inline-flex gap-2">
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50 hover:border-blue-300" onClick={()=>edit(r)}><Edit className="h-3.5 w-3.5 text-blue-600"/>Edit</button>
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-emerald-50 hover:border-emerald-300" onClick={()=>finalize(r)} disabled={r.status==="Finalized"}><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>Finalize</button>
                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300" onClick={()=>remove(r)}><Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            ):(
              <tr><td colSpan={8} className="p-4 text-center text-gray-500">No reviews</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Num({label,v,set,min=0,max=100}){
  return(
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <div className="relative">
        <ClipboardList className="h-4 w-4 text-blue-600 absolute left-2 top-2.5"/>
        <input type="number" className="border rounded w-full pl-8 p-2 text-sm" value={v} min={min} max={max} onChange={(e)=>set(Number(e.target.value)||0)}/>
      </div>
    </div>
  );
}
function TA({label,v,set}){
  return(
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <textarea rows={3} className="border rounded w-full p-2 text-sm" value={v} onChange={(e)=>set(e.target.value)}/>
    </div>
  );
}
