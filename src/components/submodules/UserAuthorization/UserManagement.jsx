// src/components/masters/UserManagement.jsx
import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {useAuth} from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {Layers,Factory,Building2,Briefcase,User2,Mail,Phone,IdCard,KeySquare,Shield,CheckCircle2,XCircle,ChevronDown,Search,Loader2,Pencil,Trash2,Eye,EyeOff,Check} from 'lucide-react';

/* ---------- helpers ---------- */
const sb=async(p)=>{const {data,error}=await p; if(error){throw error;} return data;};
const errText=(e)=>{if(!e) return 'Unknown error'; if(typeof e==='string') return e; if(e.message) return e.message; if(e.error?.message) return e.error.message; try{return JSON.stringify(e);}catch{return String(e);}};

/* ---------- role normalizer ---------- */
function normalizeRole(role){
  if(Array.isArray(role)) return role.join(', ');
  if(typeof role==='string' && role.startsWith('{') && role.endsWith('}')) return role.slice(1,-1).split(',').map((s)=>s.replace(/"/g,'').trim()).join(', ');
  if(typeof role==='string' && role.startsWith('[') && role.endsWith(']')){try{return JSON.parse(role).join(', ');}catch{return role;}}
  return role||'';
}

/* ---------- UI primitives ---------- */
const IconInput=({icon:Icon,value,onChange,placeholder,type='text',required=false,color='text-indigo-600',autoComplete='off',rightSlot=null})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}><Icon className="h-4 w-4"/></div>
    <input type={type} required={required} value={value||''} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} className={`border rounded text-sm w-full p-2 ${rightSlot?'pl-8 pr-14':'pl-8'}`}/>
    {rightSlot&&(<div className="absolute inset-y-0 right-2 flex items-center gap-1">{rightSlot}</div>)}
  </div>
);

const IconSelect=({icon:Icon,value,onChange,children,disabled=false,leftColor='text-blue-600',multiple=false,className=''})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}><Icon className="h-4 w-4"/></div>
    <select value={value||(multiple?[]:'')} onChange={onChange} disabled={disabled} multiple={multiple} className={`border rounded text-sm w-full p-2 pl-8 ${multiple?'pr-2 min-h-24':'pr-8'} appearance-none disabled:bg-gray-100 ${className}`}>{children}</select>
    {!multiple&&(<div className="absolute inset-y-0 right-2 flex items-center pointer-events-none"><ChevronDown className="h-4 w-4 text-gray-500"/></div>)}
  </div>
);

const StatusBadge=({status})=>{
  const s=(status||'Active').toLowerCase();
  const cls=s==='active'?'bg-emerald-100 text-emerald-700 border-emerald-200':'bg-rose-100 text-rose-700 border-rose-200';
  return <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>{status}</span>;
};

const ROLE_OPTIONS=['Super Admin','Admin','HR','Manager','Supervisor','Operator','QA','Engineering'];

/* ---------- component ---------- */
export default function UserManagement(){
  const {session}=useAuth();
  const email=session?.user?.email||'SYSTEM';

  const [plants,setPlants]=useState([]); const [subplants,setSubplants]=useState([]); const [departments,setDepartments]=useState([]);
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [activeTab,setActiveTab]=useState('manage');
  const [bulkUpdating,setBulkUpdating]=useState(false);
  const [bulkStatus,setBulkStatus]=useState('');

  const [search,setSearch]=useState(''); const [plantFilter,setPlantFilter]=useState(''); const [subplantFilter,setSubplantFilter]=useState(''); const [departmentFilter,setDepartmentFilter]=useState('');
  const [autoCreateAuth,setAutoCreateAuth]=useState(false);

  const [form,setForm]=useState({id:null,plant_uid:'',subplant_uid:'',department_uid:'',email:'',employee_id:'',first_name:'',last_name:'',phone_no:'',role_array:[],status:'Active',password:'',confirm_password:''});
  const [showPwd,setShowPwd]=useState(false);
  const [showPwd2,setShowPwd2]=useState(false);

  const pwdMatch=useMemo(()=>form.password?.length>0||form.confirm_password?.length>0? form.password===form.confirm_password : null,[form.password,form.confirm_password]);

  useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    const op=Promise.all([
      supabase.from('plant_master').select('id,plant_id,description').order('plant_id',{ascending:true}),
      supabase.from('subplant_master').select('id,subplant_id,subplant_name,plant_uid').order('subplant_id',{ascending:true}),
      supabase.from('department_master').select('id,department_id,department_name,subplant_uid').order('department_id',{ascending:true}),
      supabase.from('vw_user_management_ext').select('*').order('created_at',{ascending:true})
    ]).then(([pl,sp,dp,vu])=>{
      if(pl.error) throw pl.error; if(sp.error) throw sp.error; if(dp.error) throw dp.error; if(vu.error) throw vu.error;
      setPlants(pl.data||[]); setSubplants(sp.data||[]); setDepartments(dp.data||[]); setUsers(vu.data||[]);
    }).finally(()=>setLoading(false));
    await toast.promise(op,{loading:'Loading users...',success:'Loaded',error:(e)=>`Load failed: ${errText(e)}`});
  }

  const formSubplants=useMemo(()=>form.plant_uid? subplants.filter((s)=>s.plant_uid===form.plant_uid):[],[form.plant_uid,subplants]);
  const formDepartments=useMemo(()=>form.subplant_uid? departments.filter((d)=>d.subplant_uid===form.subplant_uid):[],[form.subplant_uid,departments]);

  const tableSubplants=useMemo(()=>plantFilter? subplants.filter((s)=>s.plant_uid===plantFilter):[],[plantFilter,subplants]);
  const tableDepartments=useMemo(()=>subplantFilter? departments.filter((d)=>d.subplant_uid===subplantFilter):[],[subplantFilter,departments]);

  const filteredRows=useMemo(()=>{
    let data=users;
    if(plantFilter) data=data.filter((r)=>r.plant_uid===plantFilter);
    if(subplantFilter) data=data.filter((r)=>r.subplant_uid===subplantFilter);
    if(departmentFilter) data=data.filter((r)=>r.department_uid===departmentFilter);
    if(search.trim()){
      const t=search.toLowerCase();
      data=data.filter((r)=>r.employee_id?.toLowerCase().includes(t)||r.email?.toLowerCase().includes(t)||r.first_name?.toLowerCase().includes(t)||r.last_name?.toLowerCase().includes(t));
    }
    return data;
  },[users,plantFilter,subplantFilter,departmentFilter,search]);

  function resetForm(){ setForm({id:null,plant_uid:'',subplant_uid:'',department_uid:'',email:'',employee_id:'',first_name:'',last_name:'',phone_no:'',role_array:[],status:'Active',password:'',confirm_password:''}); }

  function handleEdit(u){
    let plant_uid=u.plant_uid, subplant_uid=u.subplant_uid, department_uid=u.department_uid;
    if(!department_uid&&u.department_name){
      const dep=departments.find((d)=>d.department_name===u.department_name);
      department_uid=dep?.id||''; subplant_uid=dep?.subplant_uid||''; plant_uid=subplants.find((s)=>s.id===subplant_uid)?.plant_uid||'';
    }
    const roles=Array.isArray(u.role_array)?u.role_array:(Array.isArray(u.role)?u.role:(u.role?[u.role]:[]));
    setForm({id:u.id,plant_uid:plant_uid||'',subplant_uid:subplant_uid||'',department_uid:department_uid||'',email:u.email||'',employee_id:u.employee_id||'',first_name:u.first_name||'',last_name:u.last_name||'',phone_no:u.phone_no||'',role_array:roles,status:u.status||'Active',password:'',confirm_password:''});
    setActiveTab('manage'); toast.success(`✏️ Editing ${u.employee_id}`);
  }

  async function handleDelete(id){
    if(!id){toast.error('Missing ID'); return;}
    if(!window.confirm('Delete this user?')) return;
    const op=supabase.rpc('um_delete_id',{p_id:id}).then(({error})=>{if(error) throw error;});
    await toast.promise(op,{loading:'Deleting...',success:'Deleted',error:(e)=>errText(e)});
    await loadAll();
  }

  /* ---------- Edge Function: create auth user + business row + link ---------- */
  async function createViaEdgeFunction(){
    const payload={
      email:form.email,
      temp_password:form.password||'Temp@123',
      employee_id:form.employee_id,
      first_name:form.first_name,
      last_name:form.last_name||null,
      phone_no:form.phone_no||null,
      plant_uid:form.plant_uid||null,
      subplant_uid:form.subplant_uid||null,
      department_uid:form.department_uid||null,
      roles:(form.role_array&&form.role_array.length)?form.role_array:[],
      status:form.status||'Active',
      admin_username:email
    };

    const {data:authData}=await supabase.auth.getSession();
    const headers=authData?.session?.access_token? {Authorization:`Bearer ${authData.session.access_token}`} : {};

    try{
      const {data,error}=await supabase.functions.invoke('admin-create-user',{body:payload,headers});
      if(error){
        let details=error.message;
        try{
          const raw=await error.context?.response?.text?.();
          if(raw){ try{ const j=JSON.parse(raw); details=j.error||raw; }catch{ details=raw; } }
        }catch{}
        throw new Error(details||'Edge Function error');
      }
      if(data?.error){ throw new Error(data.error); }
      return data;
    }catch(e){
      console.error('admin-create-user failed:',e);
      throw e;
    }
  }

  /* ---------- RPC: upsert only the business row ---------- */
  async function saveViaRpc(pwd){
    const payload={
      p_id:form.id,
      p_employee_id:form.employee_id,
      p_first_name:form.first_name,
      p_last_name:form.last_name||null,
      p_email:form.email,
      p_phone_no:form.phone_no||null,
      p_plant_uid:form.plant_uid||null,
      p_subplant_uid:form.subplant_uid||null,
      p_department_uid:form.department_uid||null,
      p_role:(form.role_array&&form.role_array.length)?form.role_array:null,
      p_status:form.status||'Active',
      p_password:pwd||null,
      p_admin_username:email
    };
    const {error}=await supabase.rpc('um_save',payload);
    if(error) throw error;
  }

  function handlePwdCheck(){
    if(form.password.length===0 && form.confirm_password.length===0){ toast('No password entered'); return; }
    if(form.password===form.confirm_password){ toast.success('Passwords match'); } else { toast.error('Passwords do not match'); }
  }

  async function handleSave(e){
    e?.preventDefault?.();
    if((form.password||form.confirm_password)&&form.password!==form.confirm_password){toast.error('Passwords do not match'); return;}
    if(!form.department_uid){toast.error('Department is required'); return;}
    if(!form.email||!form.employee_id||!form.first_name){toast.error('Employee ID, Email, and First Name are required'); return;}
    setSaving(true);
    try{
      if(!form.id && autoCreateAuth){
        await toast.promise(createViaEdgeFunction(),{loading:'Creating user & Auth...',success:'User & Auth linked',error:(e)=>errText(e)});
      }else{
        await toast.promise(saveViaRpc(form.password||null),{loading:form.id?'Updating user...':'Saving user...',success:form.id?'User updated':'User added',error:(e)=>errText(e)});
      }
      resetForm(); setActiveTab('preview'); await loadAll();
    }catch(err){ console.error(err); toast.error(errText(err)); }
    finally{ setSaving(false); }
  }

  async function handleBulkUpdate(){
    if(bulkUpdating) return;
    setBulkUpdating(true); setBulkStatus('Updating all users...'); let errorCount=0;
    for(const u of users){
      try{
        const roles=Array.isArray(u.role_array)?u.role_array:(Array.isArray(u.role)?u.role:(u.role?[u.role]:[]));
        const payload={p_id:u.id,p_employee_id:u.employee_id,p_first_name:u.first_name,p_last_name:u.last_name,p_email:u.email,p_phone_no:u.phone_no,p_plant_uid:u.plant_uid||null,p_subplant_uid:u.subplant_uid||null,p_department_uid:u.department_uid||null,p_role:roles,p_status:'Inactive',p_password:null,p_admin_username:email};
        const {error}=await supabase.rpc('um_save',payload);
        if(error) throw error;
      }catch(e){ errorCount++; console.error(e); }
    }
    setBulkStatus(errorCount===0?'All users updated':`Updated with ${errorCount} error(s). See console.`); setBulkUpdating(false); await loadAll();
  }

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-blue-700"><Layers className="h-5 w-5"/>User Management</h2>

      <div className="flex gap-3 mb-3">
        <button onClick={()=>{setActiveTab('manage');}} className={`px-3 py-1 rounded ${activeTab==='manage'?'bg-blue-600 text-white':'bg-gray-200'}`}>Manage</button>
        <button onClick={()=>{setActiveTab('preview');}} className={`px-3 py-1 rounded ${activeTab==='preview'?'bg-blue-600 text-white':'bg-gray-200'}`}>Preview All</button>
      </div>

      {activeTab==='manage'&&(
        <form onSubmit={handleSave} className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Plant/Subplant/Department */}
          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect icon={Factory} value={form.plant_uid} onChange={(e)=>setForm((f)=>({...f,plant_uid:e.target.value,subplant_uid:'',department_uid:''}))} leftColor="text-blue-600">
              <option value="">Select Plant</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id} - {p.description}</option>))}
            </IconSelect>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Subplant</label>
            <IconSelect icon={Building2} value={form.subplant_uid} onChange={(e)=>setForm((f)=>({...f,subplant_uid:e.target.value,department_uid:''}))} leftColor="text-green-600" disabled={!form.plant_uid}>
              <option value="">{form.plant_uid?'Select Subplant':'Select a Plant first'}</option>
              {formSubplants.map((s)=>(<option key={s.id} value={s.id}>{s.subplant_id} - {s.subplant_name}</option>))}
            </IconSelect>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Department</label>
            <IconSelect icon={Briefcase} value={form.department_uid} onChange={(e)=>setForm((f)=>({...f,department_uid:e.target.value}))} leftColor="text-purple-600" disabled={!form.subplant_uid}>
              <option value="">{form.subplant_uid?'Select Department':'Select a Subplant first'}</option>
              {formDepartments.map((d)=>(<option key={d.id} value={d.id}>{d.department_id} - {d.department_name}</option>))}
            </IconSelect>
          </div>

          {/* Identity */}
          <div><label className="block text-xs font-medium mb-1">Employee ID</label><IconInput icon={IdCard} value={form.employee_id} onChange={(e)=>setForm({...form,employee_id:e.target.value})} placeholder="EMP-001" color="text-indigo-600" required/></div>
          <div><label className="block text-xs font-medium mb-1">First Name</label><IconInput icon={User2} value={form.first_name} onChange={(e)=>setForm({...form,first_name:e.target.value})} placeholder="Jane" color="text-green-600" required/></div>
          <div><label className="block text-xs font-medium mb-1">Last Name</label><IconInput icon={User2} value={form.last_name} onChange={(e)=>setForm({...form,last_name:e.target.value})} placeholder="Doe" color="text-emerald-600"/></div>
          <div><label className="block text-xs font-medium mb-1">Email</label><IconInput icon={Mail} value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="name@company.com" type="email" color="text-orange-600" required/></div>
          <div><label className="block text-xs font-medium mb-1">Phone</label><IconInput icon={Phone} value={form.phone_no} onChange={(e)=>setForm({...form,phone_no:e.target.value})} placeholder="+1 555 555 5555" color="text-pink-600"/></div>

          {/* Roles (multi) */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium mb-1">Roles</label>
            <IconSelect icon={Shield} value={form.role_array} onChange={(e)=>{const vals=[...e.target.selectedOptions].map((o)=>o.value); setForm((f)=>({...f,role_array:vals}));}} leftColor="text-amber-600" multiple className="pl-8">
              {ROLE_OPTIONS.map((r)=>(<option key={r} value={r}>{r}</option>))}
            </IconSelect>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <IconSelect icon={form.status==='Active'?CheckCircle2:XCircle} value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} leftColor={form.status==='Active'?'text-emerald-600':'text-rose-600'}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </IconSelect>
          </div>

          {/* Passwords with tiny view + check */}
          <div>
            <label className="block text-xs font-medium mb-1">{form.id?'New Password (optional)':'Temporary Password'}</label>
            <IconInput
              icon={KeySquare}
              value={form.password}
              onChange={(e)=>setForm({...form,password:e.target.value})}
              placeholder="••••••••"
              type={showPwd?'text':'password'}
              color="text-sky-600"
              autoComplete="new-password"
              rightSlot={
                <>
                  <button type="button" onClick={()=>setShowPwd((v)=>!v)} className="p-1 rounded hover:bg-gray-100" title={showPwd?'Hide':'Show'}>
                    {showPwd?<EyeOff className="h-4 w-4 text-gray-600"/>:<Eye className="h-4 w-4 text-gray-600"/>}
                  </button>
                  <button type="button" onClick={handlePwdCheck} className="p-1 rounded hover:bg-gray-100" title="Check match">
                    <Check className="h-4 w-4 text-emerald-600"/>
                  </button>
                </>
              }
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">{form.id?'Confirm New Password':'Confirm Password'}</label>
            <IconInput
              icon={KeySquare}
              value={form.confirm_password}
              onChange={(e)=>setForm({...form,confirm_password:e.target.value})}
              placeholder="••••••••"
              type={showPwd2?'text':'password'}
              color="text-sky-700"
              autoComplete="new-password"
              rightSlot={
                <>
                  {pwdMatch!==null&&(
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full ${pwdMatch?'border-emerald-300 text-emerald-700 bg-emerald-50':'border-rose-300 text-rose-700 bg-rose-50'}`}>
                      {pwdMatch?'Match':'Mismatch'}
                    </span>
                  )}
                  <button type="button" onClick={()=>setShowPwd2((v)=>!v)} className="p-1 rounded hover:bg-gray-100" title={showPwd2?'Hide':'Show'}>
                    {showPwd2?<EyeOff className="h-4 w-4 text-gray-600"/>:<Eye className="h-4 w-4 text-gray-600"/>}
                  </button>
                  <button type="button" onClick={handlePwdCheck} className="p-1 rounded hover:bg-gray-100" title="Check match">
                    <Check className="h-4 w-4 text-emerald-600"/>
                  </button>
                </>
              }
            />
          </div>

          {!form.id&&(
            <div className="flex items-center gap-2 col-span-full">
              <input id="autoAuth" type="checkbox" checked={autoCreateAuth} onChange={(e)=>setAutoCreateAuth(e.target.checked)}/>
              <label htmlFor="autoAuth" className="text-xs">Auto-create Auth account & link</label>
            </div>
          )}

          <div className="flex items-end gap-2 col-span-full">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm">
              {saving?<Loader2 className="h-4 w-4 animate-spin"/>:null}{form.id?'Update User':'Add User'}
            </button>
            {form.id&&(<button type="button" onClick={resetForm} className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm">Cancel</button>)}
          </div>
        </form>
      )}

      {activeTab==='preview'&&(
        <div className="mb-6 bg-white border rounded">
          <div className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="relative sm:col-span-2">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none"><Search className="h-4 w-4 text-indigo-500"/></div>
                <input type="text" placeholder="Search Employee ID / Name / Email" value={search} onChange={(e)=>setSearch(e.target.value)} className="border p-2 rounded w-full text-sm pl-8"/>
              </div>
              <IconSelect icon={Factory} value={plantFilter} onChange={(e)=>{setPlantFilter(e.target.value);setSubplantFilter('');setDepartmentFilter('');}} leftColor="text-blue-600">
                <option value="">Plant</option>
                {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id}</option>))}
              </IconSelect>
              <IconSelect icon={Building2} value={subplantFilter} onChange={(e)=>{setSubplantFilter(e.target.value);setDepartmentFilter('');}} leftColor="text-green-600" disabled={!plantFilter}>
                <option value="">Subplant</option>
                {tableSubplants.map((s)=>(<option key={s.id} value={s.id}>{s.subplant_id}</option>))}
              </IconSelect>
              <IconSelect icon={Briefcase} value={departmentFilter} onChange={(e)=>setDepartmentFilter(e.target.value)} leftColor="text-purple-600" disabled={!subplantFilter}>
                <option value="">Department</option>
                {tableDepartments.map((d)=>(<option key={d.id} value={d.id}>{d.department_id}</option>))}
              </IconSelect>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">Plant</th>
                  <th className="p-2 border text-left">Subplant</th>
                  <th className="p-2 border text-left">Department</th>
                  <th className="p-2 border text-left">Name</th>
                  <th className="p-2 border text-left">Email</th>
                  <th className="p-2 border text-left">Employee ID</th>
                  <th className="p-2 border text-left">Role(s)</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading?(
                  Array.from({length:6}).map((_,i)=>(
                    <tr key={`sk-${i}`} className="animate-pulse">
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-32"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-36"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-44"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-20"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-20"/></td>
                      <td className="p-2 border"><div className="h-7 bg-gray-200 rounded w-28"/></td>
                    </tr>
                  ))
                ):filteredRows.length>0?(
                  filteredRows.map((u)=>(
                    <tr key={u.id}>
                      <td className="p-2 border">{u.plant_name||u.plant_id||'—'}</td>
                      <td className="p-2 border">{u.subplant_name||u.subplant_id||'—'}</td>
                      <td className="p-2 border">{u.department_name||u.department_id||'—'}</td>
                      <td className="p-2 border">{u.first_name} {u.last_name}</td>
                      <td className="p-2 border">{u.email}</td>
                      <td className="p-2 border">{u.employee_id}</td>
                      <td className="p-2 border">{normalizeRole(u.role_array??u.role??u.roles)}</td>
                      <td className="p-2 border"><StatusBadge status={u.status}/></td>
                      <td className="p-2 border">
                        <div className="inline-flex gap-2">
                          <button onClick={()=>handleEdit(u)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300"><Pencil className="h-3.5 w-3.5 text-yellow-600"/>Edit</button>
                          <button onClick={()=>handleDelete(u.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300"><Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ):(
                  <tr><td colSpan={9} className="p-4 text-center text-gray-500">No Users Found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 flex items-center gap-3">
            <button onClick={handleBulkUpdate} disabled={users.length===0||bulkUpdating} className={`px-3 py-1 rounded text-sm text-white ${bulkUpdating?'bg-gray-400':'bg-green-700'}`}>{bulkUpdating?'Updating...':'Set ALL to Inactive'}</button>
            {bulkStatus&&<div className="text-green-700 text-sm">{bulkStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
