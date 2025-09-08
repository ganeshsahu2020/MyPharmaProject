// src/components/submodules/hr/Announcements.jsx
import React,{useEffect,useMemo,useState,useRef} from "react";
import {supabase} from "../../../utils/supabaseClient";
import toast,{Toaster} from "react-hot-toast";
import {Card} from "../../ui/card";
import Button from "../../ui/button";
import {Skeleton} from "../../ui/skeleton";
import Input from "../../ui/Input";

import {
  Megaphone,FileText,User2,Building2,Tags as TagsIcon,Mail,Image as ImageIcon,Paperclip,Search,Trash2,Edit,Save,RotateCcw
} from "lucide-react";

/* storage for attachments (create in Supabase > Storage) */
const BUCKET="hr_announcements";

/* helpers */
const csvToArr=(s)=>(s||"").split(",").map((t)=>t.trim()).filter(Boolean);
const findTagValue=(tags,prefix)=>{
  for(const t of tags||[]){ const i=t.indexOf(":"); if(i>0&&t.slice(0,i)===prefix) return t.slice(i+1); }
  return "";
};

/* UI chips */
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
  id:null,
  title:"",
  message:"",
  scope:"all",            // all | dept | employee
  department_uid:"",
  employee_uid:"",
  tags:"",
  imageFile:null,
  attachFile:null,
  sendEmail:false
};

export default function Announcements(){
  const [rows,setRows]=useState([]);
  const [form,setForm]=useState(initialForm);
  const [departments,setDepartments]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const imgRef=useRef(null);
  const fileRef=useRef(null);

  useEffect(()=>{(async()=>{
    setLoading(true);
    try{
      const [a,d,e]=await Promise.all([
        supabase.from("hr_announcement").select("*").order("created_at",{ascending:false}),
        supabase.from("department_master").select("id,department_id,department_name").order("department_id",{ascending:true}),
        supabase.from("vw_user_management_ext").select("id,employee_id,first_name,last_name,status").order("employee_id",{ascending:true})
      ]);
      if(a.error) throw a.error; if(d.error) throw d.error; if(e.error) throw e.error;
      setRows(a.data||[]);
      setDepartments(d.data||[]);
      setEmployees((e.data||[]).filter((x)=>x.status==="Active"));
    }catch(err){ console.error(err); toast.error("Failed to load announcements"); }
    finally{ setLoading(false); }
  })();},[]);

  const scopedEmployees=useMemo(()=>employees,[employees]);

  const reload=async()=>{
    const {data,error}=await supabase.from("hr_announcement").select("*").order("created_at",{ascending:false});
    if(error){ toast.error("Reload failed"); return; }
    setRows(data||[]);
  };

  /* uploads — return uploaded storage keys (or empty strings) */
  const uploadAttachments=async(id)=>{
    let image_path="", attachment_path="", attachment_name="";
    try{
      if(form.imageFile){
        const safe=form.imageFile.name.replace(/[^\w.\-]+/g,"_");
        const key=`${id}/image_${Date.now()}_${safe}`;
        const up=await supabase.storage.from(BUCKET).upload(key,form.imageFile,{upsert:false});
        if(!up.error) image_path=key;
      }
      if(form.attachFile){
        const safe=form.attachFile.name.replace(/[^\w.\-]+/g,"_");
        const key=`${id}/file_${Date.now()}_${safe}`;
        const up=await supabase.storage.from(BUCKET).upload(key,form.attachFile,{upsert:false});
        if(!up.error){ attachment_path=key; attachment_name=form.attachFile.name; }
      }
    }catch(e){ /* non-fatal */ }
    return {image_path,attachment_path,attachment_name};
  };

  /* try update extra columns if schema has them; else fallback to tags */
  const persistAttachmentColumns=async(id,{image_path,attachment_path,attachment_name})=>{
    if(!image_path&&!attachment_path) return;
    try{
      const payload={};
      if(image_path) payload.image_path=image_path;
      if(attachment_path) payload.attachment_path=attachment_path;
      if(attachment_name) payload.attachment_name=attachment_name;
      const r=await supabase.from("hr_announcement").update(payload).eq("id",id);
      if(r.error&&String(r.error.code)==="42703"){
        // columns missing: stash keys in tags
        const cur=rows.find((r)=>r.id===id);
        const base=cur?.tags||[];
        const extra=[
          image_path?`image:${image_path}`:null,
          attachment_path?`file:${attachment_path}`:null,
          attachment_name?`filename:${attachment_name}`:null
        ].filter(Boolean);
        await supabase.from("hr_announcement").update({tags:[...base,...extra]}).eq("id",id);
      }else if(r.error){ throw r.error; }
    }catch(e){ /* ignore */ }
  };

  const clearPickers=()=>{
    if(imgRef.current) imgRef.current.value="";
    if(fileRef.current) fileRef.current.value="";
  };

  const save=(e)=>{
    e?.preventDefault?.();

    if(!form.title.trim()||!form.message.trim()){ toast.error("Title and Message are required"); return; }
    if(form.scope==="dept"&&!form.department_uid){ toast.error("Select a Department"); return; }
    if(form.scope==="employee"&&!form.employee_uid){ toast.error("Select an Employee"); return; }

    setSaving(true);
    const runner=async()=>{
      const payload={
        title:form.title.trim(),
        message:form.message.trim(),
        scope:form.scope,
        department_uid:form.scope==="dept"?form.department_uid||null:null,
        employee_uid:form.scope==="employee"?form.employee_uid||null:null,
        tags:csvToArr(form.tags)
      };

      let id=form.id;
      if(!form.id){
        const ins=await supabase.from("hr_announcement").insert([payload]).select("id").single();
        if(ins.error) throw ins.error;
        id=ins.data.id;
      }else{
        const upd=await supabase.from("hr_announcement").update(payload).eq("id",form.id);
        if(upd.error) throw upd.error;
      }

      // attachments (optional, non-fatal)
      const keys=await uploadAttachments(id);
      await persistAttachmentColumns(id,keys);

      // optional email blast via Edge Function "send-announcement"
      if(form.sendEmail){
        try{
          await supabase.functions.invoke("send-announcement",{body:{id,...payload}});
        }catch(err){ /* surfacing separately below */ throw new Error(`Saved but email failed: ${err.message||"Edge Function unavailable"}`); }
      }

      setForm(initialForm);
      clearPickers();
      await reload();
      return true;
    };

    toast.promise(runner(),{loading:form.id?"Updating…":"Saving…",success:form.id?"Announcement updated":"Announcement created",error:(err)=>err?.message||"Save failed"})
      .finally(()=>setSaving(false));
  };

  const edit=(r)=>{
    setForm({
      id:r.id,
      title:r.title||"",
      message:r.message||"",
      scope:r.scope||"all",
      department_uid:r.department_uid||"",
      employee_uid:r.employee_uid||"",
      tags:(r.tags||[]).join(", "),
      imageFile:null,
      attachFile:null,
      sendEmail:false
    });
    clearPickers();
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const del=(id)=>{
    const runner=async()=>{
      const {error}=await supabase.from("hr_announcement").delete().eq("id",id);
      if(error) throw error;
      setRows((prev)=>prev.filter((r)=>r.id!==id));
      if(form.id===id) setForm(initialForm);
      return true;
    };
    toast.promise(runner(),{loading:"Deleting…",success:"Deleted",error:(err)=>err?.message||"Delete failed"});
  };

  /* open signed URL helper */
  const openSigned=async(key)=>{
    try{
      const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(key,60);
      if(error) throw error;
      window.open(data.signedUrl,"_blank");
    }catch(err){ toast.error("Open failed"); }
  };

  /* icon-input wrapper (no overlap) */
  const InputWrap=({Icon,children})=>(
    <div className="relative">
      {Icon&&<Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600 pointer-events-none"/>}
      {children}
    </div>
  );

  return (
    <div className="p-3 space-y-4">
      <Toaster position="top-right"/>

      {/* gradient header */}
      <div className="rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 py-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Megaphone className="h-5 w-5 text-white/90"/><span>HR Announcements</span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Pill tone="all">All</Pill>
            <Pill tone="dept">Dept</Pill>
            <Pill tone="employee">Employee</Pill>
          </div>
        </div>
      </div>

      {/* composer */}
      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">{form.id?"Edit Announcement":"New Announcement"}</div>
        <form onSubmit={save} className="space-y-3">
          <Input
            placeholder="Title"
            value={form.title}
            onChange={(e)=>setForm({...form,title:e.target.value})}
            required
          />

          {/* message + attachments */}
          <div>
            <label className="block text-xs font-medium mb-1">Message</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-blue-600 pointer-events-none"/>
              <textarea
                className="border rounded w-full p-2 pl-9 text-sm"
                rows={3}
                placeholder="Type your announcement…"
                value={form.message}
                onChange={(e)=>setForm({...form,message:e.target.value})}
                required
              />
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Add image (optional)</label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-blue-600 pointer-events-none"/>
                  <input ref={imgRef} type="file" accept="image/*" className="block w-full border rounded p-2 pl-9 text-sm" onChange={(e)=>setForm({...form,imageFile:e.target.files?.[0]||null})}/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Attach file (optional)</label>
                <div className="relative">
                  <Paperclip className="absolute left-3 top-3 h-4 w-4 text-blue-600 pointer-events-none"/>
                  <input ref={fileRef} type="file" className="block w-full border rounded p-2 pl-9 text-sm" onChange={(e)=>setForm({...form,attachFile:e.target.files?.[0]||null})}/>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {/* scope */}
            <div>
              <label className="block text-xs font-medium mb-1">Scope</label>
              <InputWrap Icon={TagsIcon}>
                <select
                  className="border rounded p-2 pl-9 text-sm w-full"
                  value={form.scope}
                  onChange={(e)=>setForm({
                    ...form,
                    scope:e.target.value,
                    department_uid:e.target.value==="dept"?form.department_uid:"",
                    employee_uid:e.target.value==="employee"?form.employee_uid:""
                  })}
                >
                  <option value="all">All</option>
                  <option value="dept">Department</option>
                  <option value="employee">Employee</option>
                </select>
              </InputWrap>
            </div>

            {/* department */}
            <div>
              <label className="block text-xs font-medium mb-1">Department</label>
              <InputWrap Icon={Building2}>
                <select
                  className="border rounded p-2 pl-9 text-sm w-full"
                  value={form.department_uid}
                  onChange={(e)=>setForm({...form,department_uid:e.target.value})}
                  disabled={form.scope!=="dept"}
                >
                  <option value="">Select Department</option>
                  {departments.map((d)=>(
                    <option key={d.id} value={d.id}>{d.department_id} — {d.department_name}</option>
                  ))}
                </select>
              </InputWrap>
            </div>

            {/* employee */}
            <div>
              <label className="block text-xs font-medium mb-1">Employee</label>
              <InputWrap Icon={User2}>
                <select
                  className="border rounded p-2 pl-9 text-sm w-full"
                  value={form.employee_uid}
                  onChange={(e)=>setForm({...form,employee_uid:e.target.value})}
                  disabled={form.scope!=="employee"}
                >
                  <option value="">Select Employee</option>
                  {scopedEmployees.map((u)=>(
                    <option key={u.id} value={u.id}>{u.employee_id} — {u.first_name} {u.last_name}</option>
                  ))}
                </select>
              </InputWrap>
            </div>
          </div>

          <Input
            placeholder="tags (comma separated)"
            value={form.tags}
            onChange={(e)=>setForm({...form,tags:e.target.value})}
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sendEmail} onChange={(e)=>setForm({...form,sendEmail:e.target.checked})}/>
            <Mail className="h-4 w-4 text-blue-600"/> Also send via email (Edge Function)
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={saving} className="inline-flex items-center gap-2">{form.id?<><Save className="h-4 w-4"/>Update</>:<><Megaphone className="h-4 w-4"/>Publish</>}</Button>
            {form.id&&(
              <Button type="button" variant="outline" onClick={()=>{setForm(initialForm); clearPickers();}} className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4"/>Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* list */}
      <Card className="p-0 overflow-x-auto">
        <div className="p-3 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600"/>
            <input className="border rounded pl-9 pr-2 py-1.5 text-sm w-full" placeholder="Search title/tags…" onChange={()=>{}}/>
          </div>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-2 text-left border">Title</th>
              <th className="p-2 text-left border">Scope</th>
              <th className="p-2 text-left border">Tags</th>
              <th className="p-2 text-left border">Attachments</th>
              <th className="p-2 text-left border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading?(
              Array.from({length:5}).map((_,i)=>(
                <tr key={`sk-${i}`} className="border-t">
                  {Array.from({length:5}).map((__,j)=>(
                    <td key={j} className="p-2"><Skeleton className="h-4 w-full"/></td>
                  ))}
                </tr>
              ))
            ):rows.length===0?(
              <tr><td colSpan={5} className="p-3 text-center text-gray-500">No announcements</td></tr>
            ):(
              rows.map((r)=>(
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-gray-600 whitespace-pre-wrap">{r.message}</div>
                  </td>
                  <td className="p-2 capitalize">
                    {r.scope==="all"&&<Pill tone="all">All</Pill>}
                    {r.scope==="dept"&&<Pill tone="dept">Dept</Pill>}
                    {r.scope==="employee"&&<Pill tone="employee">Employee</Pill>}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.tags||[]).map((t)=>(
                        <span key={t} className="px-2 py-0.5 rounded border text-[10px] bg-white">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {/* Prefer columns; else look for tag tokens image:/file: */}
                      {(()=>{const k=r.image_path||findTagValue(r.tags,"image"); return k?<button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50" onClick={()=>openSigned(k)}><ImageIcon className="h-3.5 w-3.5 text-blue-600"/>Image</button>:null;})()}
                      {(()=>{const k=r.attachment_path||findTagValue(r.tags,"file"); return k?<button className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-emerald-50" onClick={()=>openSigned(k)}><Paperclip className="h-3.5 w-3.5 text-emerald-600"/>File</button>:null;})()}
                    </div>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=>edit(r)} className="inline-flex items-center gap-1"><Edit className="h-3.5 w-3.5 text-indigo-600"/>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={()=>del(r.id)} className="inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5"/>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
