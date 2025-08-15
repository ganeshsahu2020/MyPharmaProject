import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {useAuth} from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {Button} from '../../ui/button';
import {Card} from '../../ui/card';
import {
  FilePlus2,UploadCloud,Download,Trash2,Search,User2,FolderOpen,Shield,
  ListPlus,History,Tags
} from 'lucide-react';

const BUCKET='hr_docs';
const DOC_TYPES=['Contract','Policy','Payslip','Appraisal','Offer Letter','Other'];

const fmtDate=(iso)=>iso?new Date(iso).toLocaleString():'-';
const empLabel=(e)=>e?`${e.employee_id} — ${e.first_name} ${e.last_name}`:'—';

const TagPill=({t,onClick})=>(
  <span onClick={onClick} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full cursor-pointer">
    <Tags className="h-3 w-3"/>{t}
  </span>
);

export default function HRDocumentManagement(){
  const {session}=useAuth();
  const email=session?.user?.email||'';
  const [authz,setAuthz]=useState({roles:[],is_hr:false,is_admin:false,is_super_admin:false,loading:true});

  const [docs,setDocs]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [loading,setLoading]=useState(true);

  const [search,setSearch]=useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const [employeeFilter,setEmployeeFilter]=useState('');
  const [tagFilter,setTagFilter]=useState('');
  const [deptFilter,setDeptFilter]=useState('');

  const [open,setOpen]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [form,setForm]=useState({title:'',doc_type:'',employee_uid:'',visibility:'all',dept_ids:[],tags:'',file:null});
  const fileRef=useRef(null);

  const [historyOpen,setHistoryOpen]=useState(false);
  const [historyDoc,setHistoryDoc]=useState(null);
  const [versions,setVersions]=useState([]);

  useEffect(()=>{(async()=>{
    const {data,error}=await supabase.rpc('app_whoami');
    const row=Array.isArray(data)&&data.length?data[0]:null;
    if(error||!row){ setAuthz({roles:[],is_hr:false,is_admin:false,is_super_admin:false,loading:false}); return; }
    setAuthz({...row,loading:false,roles:row.roles||[],is_hr:!!row.is_hr,is_admin:!!row.is_admin,is_super_admin:!!row.is_super_admin});
  })();},[]);

  const canUpload=authz.is_super_admin||authz.is_admin||authz.is_hr;
  const canDelete=canUpload;

  useEffect(()=>{loadAll();},[]);
  async function loadAll(){
    setLoading(true);
    try{
      const {data:emps,error:eErr}=await supabase
        .from('vw_user_management_ext')
        .select('id,employee_id,first_name,last_name,email,status,department_uid')
        .order('employee_id',{ascending:true});
      if(eErr) throw eErr;
      setEmployees((emps||[]).filter((e)=>e.status==='Active'));

      const {data:deps,error:dErr}=await supabase
        .from('department_master')
        .select('id,department_id,department_name')
        .order('department_id',{ascending:true});
      if(dErr) throw dErr;
      setDepartments(deps||[]);

      // prefer latest view
      let list=[], err=null;
      const vTry=await supabase.from('vw_hr_document_latest').select('*').order('uploaded_at',{ascending:false});
      if(vTry.error){
        const bTry=await supabase
          .from('hr_document')
          .select('id,title,doc_type,employee_uid,storage_path:latest_storage_path,file_name:latest_file_name,uploaded_by,uploaded_at,tags,visibility,current_version_no')
          .order('uploaded_at',{ascending:false});
        err=bTry.error; list=bTry.data||[];
      }else{ list=vTry.data||[]; }
      if(err&&err.message?.includes('relation')){}
      setDocs(list||[]);
    }catch(err){
      console.error(err);
      toast.error('Failed to load HR documents');
    }finally{ setLoading(false); }
  }

  async function handleUpload(e){
    e?.preventDefault?.();
    if(!canUpload){ toast.error('Not authorized'); return; }
    if(!form.title||!form.doc_type){ toast.error('Title and Type are required'); return; }
    if(!form.file){ toast.error('Pick a file to upload'); return; }
    if(form.visibility==='employee'&&!form.employee_uid){ toast.error('Pick the employee for employee-level visibility'); return; }
    if(form.visibility==='dept'&&(!form.dept_ids||form.dept_ids.length===0)){ toast.error('Select at least one department'); return; }

    setUploading(true);
    try{
      const scope=form.employee_uid||'general';
      const safeName=form.file.name.replace(/[^\w.\-]+/g,'_');
      const key=`${scope}/${Date.now()}_${safeName}`;

      const up=await supabase.storage.from(BUCKET).upload(key,form.file,{upsert:false});
      if(up.error){
        if(up.error.statusCode===400||up.error.statusCode===404){ toast.error(`Storage bucket "${BUCKET}" missing.`); }
        else{ toast.error(up.error.message||'Upload failed'); }
        setUploading(false); return;
      }

      const tagsArr=(form.tags||'')
        .split(',')
        .map((s)=>s.trim())
        .filter((s)=>s.length>0);

      // 1) create document metadata
      const ins=await supabase.from('hr_document').insert([{
        title:form.title,
        doc_type:form.doc_type,
        employee_uid:form.visibility==='employee'?form.employee_uid:null,
        storage_path:key,               /* backward compat */
        file_name:form.file.name,       /* backward compat */
        uploaded_by:email,
        tags:tagsArr,
        visibility:form.visibility,
        current_version_no:1
      }]).select('id').single();
      if(ins.error) throw ins.error;
      const docId=ins.data.id;

      // 2) dept mapping if needed
      if(form.visibility==='dept'&&form.dept_ids.length>0){
        const rows=form.dept_ids.map((id)=>({doc_id:docId,department_uid:id}));
        const mapIns=await supabase.from('hr_document_department').insert(rows);
        if(mapIns.error) throw mapIns.error;
      }

      // 3) initial version record
      const vIns=await supabase.from('hr_document_version').insert([{
        doc_id:docId,version_no:1,storage_path:key,file_name:form.file.name,uploaded_by:email
      }]);
      if(vIns.error) throw vIns.error;

      toast.success('Document uploaded');
      setOpen(false);
      setForm({title:'',doc_type:'',employee_uid:'',visibility:'all',dept_ids:[],tags:'',file:null});
      if(fileRef.current) fileRef.current.value='';
      await loadAll();
    }catch(err){
      console.error(err);
      toast.error(err.message||'Upload failed');
    }finally{ setUploading(false); }
  }

  async function handleAddVersion(doc){
    if(!canUpload){ toast.error('Not authorized'); return; }
    const f=fileRef.current?.files?.[0];
    if(!f){ toast.error('Choose a file first'); return; }
    try{
      const safeName=f.name.replace(/[^\w.\-]+/g,'_');
      const key=`${doc.employee_uid||'general'}/${Date.now()}_${safeName}`;
      const up=await supabase.storage.from(BUCKET).upload(key,f,{upsert:false});
      if(up.error) throw up.error;
      const fx=await supabase.rpc('hr_doc_add_version',{p_doc_id:doc.id,p_storage_path:key,p_file_name:f.name});
      if(fx.error) throw fx.error;
      toast.success('Version added');
      if(fileRef.current) fileRef.current.value='';
      await openHistory(doc);
      await loadAll();
    }catch(err){
      console.error(err);
      toast.error(err.message||'Add version failed');
    }
  }

  async function handleDownload(row,version){
    try{
      const path=version?.storage_path||row.latest_storage_path||row.storage_path;
      const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,60);
      if(error) throw error;
      window.open(data.signedUrl,'_blank');
    }catch(err){
      console.error(err);
      toast.error('Download failed');
    }
  }

  async function handleDelete(row){
    if(!canDelete){ toast.error('Not authorized'); return; }
    if(!window.confirm('Delete this document (all versions)?')) return;
    try{
      const del=await supabase.from('hr_document').delete().eq('id',row.id);
      if(del.error) throw del.error;
      toast.success('Deleted');
      await loadAll();
    }catch(err){
      console.error(err);
      toast.error(err.message||'Delete failed');
    }
  }

  async function openHistory(doc){
    setHistoryDoc(doc);
    setHistoryOpen(true);
    const {data,error}=await supabase
      .from('hr_document_version')
      .select('*')
      .eq('doc_id',doc.id)
      .order('version_no',{ascending:false});
    if(error){ toast.error('Failed to load versions'); setVersions([]); return; }
    setVersions(data||[]);
  }

  const filtered=useMemo(()=>{
    let list=[...(docs||[])];
    if(typeFilter) list=list.filter((d)=>d.doc_type===typeFilter);
    if(employeeFilter) list=list.filter((d)=>d.employee_uid===employeeFilter);
    if(deptFilter) list=list.filter((d)=>d.visibility!=='dept' || d.id && true); // UI-level filter will rely on server RLS; leave as-is or extend via a view join
    if(tagFilter) list=list.filter((d)=>(d.tags||[]).includes(tagFilter));

    if(search.trim()){
      const q=search.toLowerCase();
      list=list.filter((d)=>
        d.title?.toLowerCase().includes(q)||
        d.latest_file_name?.toLowerCase().includes(q)||
        (d.tags||[]).some((t)=>t.toLowerCase().includes(q))
      );
    }
    return list;
  },[docs,typeFilter,employeeFilter,deptFilter,tagFilter,search]);

  const empById=useMemo(()=>{
    const m=new Map(); for(const e of employees) m.set(e.id,e); return m;
  },[employees]);

  return(
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-blue-700 flex items-center gap-2">
          <FolderOpen className="h-5 w-5"/>HR Document Management
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-gray-500 absolute left-2 top-2.5"/>
            <input
              className="border rounded pl-8 pr-2 py-1 text-sm w-64"
              placeholder="Search title/tags/file"
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
          </div>
          <select className="border rounded px-2 py-1 text-sm" value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {DOC_TYPES.map((t)=>(<option key={t} value={t}>{t}</option>))}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={employeeFilter} onChange={(e)=>setEmployeeFilter(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map((e)=>(<option key={e.id} value={e.id}>{empLabel(e)}</option>))}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={tagFilter} onChange={(e)=>setTagFilter(e.target.value)}>
            <option value="">All Tags</option>
            {Array.from(new Set(docs.flatMap((d)=>(d.tags||[])))).map((t)=>(<option key={t} value={t}>{t}</option>))}
          </select>
          {canUpload&&(
            <Button onClick={()=>setOpen(true)} className="inline-flex items-center gap-2">
              <FilePlus2 className="h-4 w-4"/>Upload
            </Button>
          )}
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border text-left">Title</th>
              <th className="p-2 border text-left">Type</th>
              <th className="p-2 border text-left">Visibility</th>
              <th className="p-2 border text-left">Employee/Dept</th>
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
                <tr key={`sk-${i}`} className="animate-pulse">
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-40"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-56"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-14"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-48"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-36"/></td>
                  <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-32"/></td>
                  <td className="p-2 border"><div className="h-7 bg-gray-200 rounded w-28"/></td>
                </tr>
              ))
            ):filtered.length?(
              filtered.map((row)=>(
                <tr key={row.id}>
                  <td className="p-2 border">{row.title}</td>
                  <td className="p-2 border">{row.doc_type}</td>
                  <td className="p-2 border capitalize">{row.visibility}</td>
                  <td className="p-2 border">
                    {row.visibility==='employee'&&row.employee_uid?(
                      <span className="inline-flex items-center gap-1">
                        <User2 className="h-3.5 w-3.5 text-indigo-600"/>
                        {empLabel(empById.get(row.employee_uid))}
                      </span>
                    ):row.visibility==='dept'?'Selected Departments':'—'}
                  </td>
                  <td className="p-2 border">
                    {(row.tags||[]).length===0?'—':(
                      <div className="flex flex-wrap gap-1">
                        {row.tags.map((t)=>(
                          <TagPill key={`${row.id}-${t}`} t={t} onClick={()=>setTagFilter(t)}/>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2 border">v{row.latest_version_no||row.current_version_no||1}</td>
                  <td className="p-2 border">{row.latest_file_name||row.file_name}</td>
                  <td className="p-2 border">{row.uploaded_by||'—'}</td>
                  <td className="p-2 border">{fmtDate(row.uploaded_at)}</td>
                  <td className="p-2 border">
                    <div className="inline-flex gap-2">
                      <button onClick={()=>handleDownload(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50 hover:border-blue-300">
                        <Download className="h-3.5 w-3.5 text-blue-600"/>Download
                      </button>
                      <button onClick={()=>openHistory(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-sky-50 hover:border-sky-300">
                        <History className="h-3.5 w-3.5 text-sky-600"/>History
                      </button>
                      {canDelete&&(
                        <button onClick={()=>handleDelete(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300">
                          <Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ):(
              <tr><td colSpan={10} className="p-4 text-center text-gray-500">No documents</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Upload Modal */}
      {open&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-blue-600"/>Upload Document
              </div>
              <button onClick={()=>setOpen(false)} className="text-gray-500 hover:text-black">✕</button>
            </div>
            <form onSubmit={handleUpload} className="p-4 space-y-3">
              {!canUpload&&(
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2 rounded flex items-center gap-2">
                  <Shield className="h-4 w-4"/>You are not allowed to upload.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Title</label>
                  <input type="text" className="border rounded w-full p-2 text-sm" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} required/>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Type</label>
                  <select className="border rounded w-full p-2 text-sm" value={form.doc_type} onChange={(e)=>setForm({...form,doc_type:e.target.value})} required>
                    <option value="">Select Type</option>
                    {DOC_TYPES.map((t)=>(<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Visibility</label>
                  <select className="border rounded w-full p-2 text-sm" value={form.visibility} onChange={(e)=>setForm({...form,visibility:e.target.value})}>
                    <option value="all">All Employees</option>
                    <option value="dept">Departments</option>
                    <option value="employee">Single Employee</option>
                  </select>
                </div>
                {form.visibility==='employee'&&(
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Employee</label>
                    <select className="border rounded w-full p-2 text-sm" value={form.employee_uid} onChange={(e)=>setForm({...form,employee_uid:e.target.value})}>
                      <option value="">Select Employee</option>
                      {employees.map((e)=>(<option key={e.id} value={e.id}>{empLabel(e)}</option>))}
                    </select>
                  </div>
                )}
                {form.visibility==='dept'&&(
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Departments</label>
                    <select multiple className="border rounded w-full p-2 text-sm h-24"
                      value={form.dept_ids}
                      onChange={(e)=>{
                        const opts=Array.from(e.target.selectedOptions).map((o)=>o.value);
                        setForm({...form,dept_ids:opts});
                      }}>
                      {departments.map((d)=>(<option key={d.id} value={d.id}>{d.department_id} — {d.department_name}</option>))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Tags (comma separated)</label>
                <div className="flex items-center gap-2">
                  <ListPlus className="h-4 w-4 text-gray-500"/>
                  <input type="text" className="border rounded w-full p-2 text-sm" placeholder="policy, safety, 2025" value={form.tags} onChange={(e)=>setForm({...form,tags:e.target.value})}/>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">File</label>
                <input ref={fileRef} type="file" className="block w-full text-sm" onChange={(e)=>setForm({...form,file:e.target.files?.[0]||null})} required/>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!canUpload||uploading} className="inline-flex items-center gap-2">
                  {uploading&&<span className="animate-spin">⟳</span>}Upload
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Versions Drawer (simple modal) */}
      {historyOpen&&historyDoc&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-sky-600"/>Versions — {historyDoc.title}
              </div>
              <button onClick={()=>{setHistoryOpen(false);setHistoryDoc(null);}} className="text-gray-500 hover:text-black">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {canUpload&&(
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" className="block text-sm"/>
                  <Button onClick={()=>handleAddVersion(historyDoc)} className="inline-flex items-center gap-2">
                    <UploadCloud className="h-4 w-4"/>Upload New Version
                  </Button>
                </div>
              )}
              <Card className="p-0 overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border text-left">Version</th>
                      <th className="p-2 border text-left">File</th>
                      <th className="p-2 border text-left">Uploaded By</th>
                      <th className="p-2 border text-left">Uploaded At</th>
                      <th className="p-2 border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.length===0?(
                      <tr><td colSpan={5} className="p-3 text-center text-gray-500">No versions</td></tr>
                    ):versions.map((v)=>(
                      <tr key={v.id}>
                        <td className="p-2 border">v{v.version_no}</td>
                        <td className="p-2 border">{v.file_name||v.storage_path?.split('/').pop()}</td>
                        <td className="p-2 border">{v.uploaded_by||'—'}</td>
                        <td className="p-2 border">{fmtDate(v.uploaded_at)}</td>
                        <td className="p-2 border">
                          <button onClick={()=>handleDownload(historyDoc,v)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-blue-50 hover:border-blue-300">
                            <Download className="h-3.5 w-3.5 text-blue-600"/>Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
