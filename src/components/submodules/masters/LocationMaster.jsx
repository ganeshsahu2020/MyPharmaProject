// src/components/masters/LocationMaster.jsx
import React,{useState,useEffect,useMemo} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import {
  Layers,MapPin,Hash,FileText,Tag,
  Building2,Factory,Briefcase,Grid3X3,
  ChevronDown,Search,Loader2,Pencil,Trash2
} from 'lucide-react';

/* ---------- UI Helpers (prevent icon overlap) ---------- */
const IconInput=({icon:Icon,value,onChange,placeholder,type='text',required=false,color='text-indigo-600'})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}>
      <Icon className="h-4 w-4"/>
    </div>
    <input
      type={type}
      required={required}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const IconSelect=({icon:Icon,value,onChange,children,disabled=false,leftColor='text-blue-600'})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${leftColor}`}>
      <Icon className="h-4 w-4"/>
    </div>
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="border rounded text-sm w-full p-2 pl-8 pr-8 appearance-none disabled:bg-gray-100"
    >
      {children}
    </select>
    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
      <ChevronDown className="h-4 w-4 text-gray-500"/>
    </div>
  </div>
);

const StatusBadge=({status})=>{
  const s=(status||'Active').toLowerCase();
  const cls=s==='active'
    ?'bg-emerald-100 text-emerald-700 border-emerald-200'
    :'bg-rose-100 text-rose-700 border-rose-200';
  return <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>{status||'-'}</span>;
};

const TypeBadge=({type})=>{
  const t=(type||'').toLowerCase();
  const map={
    'classified area':'bg-indigo-100 text-indigo-700 border-indigo-200',
    'non-classified area':'bg-gray-100 text-gray-700 border-gray-200',
    'cold storage':'bg-sky-100 text-sky-700 border-sky-200'
  };
  const cls=map[t]||'bg-amber-100 text-amber-700 border-amber-200';
  return <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>{type||'-'}</span>;
};

/* -------------------- Component -------------------- */
export default function LocationMaster(){
  // dropdown sources
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);

  // table rows from view
  const [rows,setRows]=useState([]);

  // ui state
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [activeTab,setActiveTab]=useState('manage');

  // filters + form
  const [selectedPlant,setSelectedPlant]=useState('');
  const [selectedSubplant,setSelectedSubplant]=useState('');
  const [selectedDepartment,setSelectedDepartment]=useState('');
  const [selectedArea,setSelectedArea]=useState('');

  const [form,setForm]=useState({
    id:null,
    location_id:'',
    location_name:'',
    location_description:'',
    location_type:''
  });

  const [search,setSearch]=useState('');

  useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    const p=Promise.all([
      supabase.from('plant_master').select('id,plant_id,description,status').order('plant_id',{ascending:true}),
      supabase.from('subplant_master').select('id,subplant_id,subplant_name,plant_uid,status').order('subplant_id',{ascending:true}),
      supabase.from('department_master').select('id,department_id,department_name,subplant_uid,status').order('department_id',{ascending:true}),
      supabase.from('area_master').select('id,area_id,area_name,department_uid,status').order('area_id',{ascending:true}),
      supabase.from('vw_location_master').select('*').order('location_id',{ascending:true})
    ]).then(([pl,sp,dp,ar,vw])=>{
      if(pl.error) throw new Error(pl.error.message);
      if(sp.error) throw new Error(sp.error.message);
      if(dp.error) throw new Error(dp.error.message);
      if(ar.error) throw new Error(ar.error.message);
      if(vw.error) throw new Error(vw.error.message);
      setPlants(pl.data||[]);
      setSubplants(sp.data||[]);
      setDepartments(dp.data||[]);
      setAreas(ar.data||[]);
      setRows(vw.data||[]);
    }).finally(()=>setLoading(false));
    await toast.promise(p,{loading:'Loading locations...',success:'Loaded',error:(e)=>`Load failed: ${e.message}`});
  }

  // cascading filters for dropdowns
  const filteredSubplants=useMemo(()=>selectedPlant?subplants.filter((s)=>s.plant_uid===selectedPlant):[],[selectedPlant,subplants]);
  const filteredDepartments=useMemo(()=>selectedSubplant?departments.filter((d)=>d.subplant_uid===selectedSubplant):[],[selectedSubplant,departments]);
  const filteredAreas=useMemo(()=>selectedDepartment?areas.filter((a)=>a.department_uid===selectedDepartment):[],[selectedDepartment,areas]);

  // search filter for table (rows are already joined via view)
  const filteredRows=useMemo(()=>{
    let data=rows;
    if(selectedPlant) data=data.filter((r)=>r.plant_uid===selectedPlant);
    if(selectedSubplant) data=data.filter((r)=>r.subplant_uid===selectedSubplant);
    if(selectedDepartment) data=data.filter((r)=>r.department_uid===selectedDepartment);
    if(selectedArea) data=data.filter((r)=>r.area_uid===selectedArea);
    if(search.trim()){
      const t=search.toLowerCase();
      data=data.filter((r)=>
        r.location_id?.toLowerCase().includes(t)||
        r.location_name?.toLowerCase().includes(t)
      );
    }
    return data;
  },[rows,selectedPlant,selectedSubplant,selectedDepartment,selectedArea,search]);

  function resetForm(){
    setForm({id:null,location_id:'',location_name:'',location_description:'',location_type:''});
    setSelectedPlant('');setSelectedSubplant('');setSelectedDepartment('');setSelectedArea('');
  }

  async function handleSave(e){
    e?.preventDefault?.();
    if(!form.location_id||!form.location_name||!selectedArea){
      toast.error('Location ID, Name and Area are required');return;
    }
    const payload={
      location_id:form.location_id,
      location_name:form.location_name,
      location_description:form.location_description||null,
      location_type:form.location_type||null,
      area_uid:selectedArea
    };
    setSaving(true);
    try{
      if(!form.id){
        const op=supabase.from('location_master').insert([payload]).select('id').single();
        await toast.promise(op,{loading:'Saving location...',success:'Location added',error:(e)=>e.error?.message||'Save failed'});
      }else{
        const op=supabase.from('location_master').update(payload).eq('id',form.id).select('id').single();
        await toast.promise(op,{loading:'Updating location...',success:'Location updated',error:(e)=>e.error?.message||'Update failed'});
      }
      resetForm();
      setActiveTab('preview');
      await loadAll();
    }finally{
      setSaving(false);
    }
  }

  async function handleDelete(id){
    if(!id){toast.error('Missing ID');return;}
    if(!window.confirm('Delete this location?')) return;
    const op=supabase.from('location_master').delete().eq('id',id);
    await toast.promise(op,{loading:'Deleting...',success:'Deleted',error:'Delete failed'});
    if(form.id===id) resetForm();
    await loadAll();
  }

  function handleEdit(v){
    // v is a row from vw_location_master
    setForm({
      id:v.location_uid,
      location_id:v.location_id||'',
      location_name:v.location_name||'',
      location_description:v.location_description||'',
      location_type:v.location_type||''
    });
    setSelectedPlant(v.plant_uid||'');
    setSelectedSubplant(v.subplant_uid||'');
    setSelectedDepartment(v.department_uid||'');
    setSelectedArea(v.area_uid||'');
    setActiveTab('manage');
    toast.success(`✏️ Editing Location: ${v.location_id}`);
  }

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-blue-700">
        <Layers className="h-5 w-5"/>Location Master
      </h2>

      {/* Tabs */}
      <div className="flex gap-3 mb-3">
        <button onClick={()=>{setActiveTab('manage');resetForm();}} className={`px-3 py-1 rounded ${activeTab==='manage'?'bg-blue-600 text-white':'bg-gray-200'}`}>Manage</button>
        <button onClick={()=>{setActiveTab('preview');resetForm();}} className={`px-3 py-1 rounded ${activeTab==='preview'?'bg-blue-600 text-white':'bg-gray-200'}`}>Preview All</button>
      </div>

      {activeTab==='manage'&&(
        <form onSubmit={handleSave} className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Cascade selectors */}
          <div>
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect icon={Building2} value={selectedPlant} onChange={(e)=>{setSelectedPlant(e.target.value);setSelectedSubplant('');setSelectedDepartment('');setSelectedArea('');}} leftColor="text-blue-600">
              <option value="">Select Plant</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id} - {p.description}</option>))}
            </IconSelect>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Subplant</label>
            <IconSelect icon={Factory} value={selectedSubplant} onChange={(e)=>{setSelectedSubplant(e.target.value);setSelectedDepartment('');setSelectedArea('');}} leftColor="text-green-600" disabled={!selectedPlant}>
              <option value="">{selectedPlant?'Select Subplant':'Select a Plant first'}</option>
              {filteredSubplants.map((sp)=>(<option key={sp.id} value={sp.id}>{sp.subplant_id} - {sp.subplant_name}</option>))}
            </IconSelect>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Department</label>
            <IconSelect icon={Briefcase} value={selectedDepartment} onChange={(e)=>{setSelectedDepartment(e.target.value);setSelectedArea('');}} leftColor="text-purple-600" disabled={!selectedSubplant}>
              <option value="">{selectedSubplant?'Select Department':'Select a Subplant first'}</option>
              {filteredDepartments.map((d)=>(<option key={d.id} value={d.id}>{d.department_name}</option>))}
            </IconSelect>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Area</label>
            <IconSelect icon={Grid3X3} value={selectedArea} onChange={(e)=>setSelectedArea(e.target.value)} leftColor="text-pink-600" disabled={!selectedDepartment}>
              <option value="">{selectedDepartment?'Select Area':'Select a Department first'}</option>
              {filteredAreas.map((a)=>(<option key={a.id} value={a.id}>{a.area_id} - {a.area_name}</option>))}
            </IconSelect>
          </div>

          {/* Fields */}
          <div>
            <label className="block text-xs font-medium mb-1">Location ID</label>
            <IconInput icon={Hash} value={form.location_id} onChange={(e)=>setForm({...form,location_id:e.target.value})} placeholder="RM-001-A001" color="text-indigo-600" required/>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Location Name</label>
            <IconInput icon={MapPin} value={form.location_name} onChange={(e)=>setForm({...form,location_name:e.target.value})} placeholder="RM Aisle" color="text-green-600" required/>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <IconInput icon={FileText} value={form.location_description} onChange={(e)=>setForm({...form,location_description:e.target.value})} placeholder="Optional description..." color="text-orange-600"/>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <IconSelect icon={Tag} value={form.location_type} onChange={(e)=>setForm({...form,location_type:e.target.value})} leftColor="text-rose-600">
              <option value="">Select</option>
              <option value="Classified Area">Classified Area</option>
              <option value="Non-Classified Area">Non-Classified Area</option>
              <option value="Cold Storage">Cold Storage</option>
            </IconSelect>
          </div>

          <div className="flex items-end gap-2 col-span-full">
            <button type="submit" disabled={saving||!selectedArea} className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm">
              {saving?<Loader2 className="h-4 w-4 animate-spin"/>:null}
              {form.id?'Update Location':'Add Location'}
            </button>
            {form.id&&(
              <button type="button" className="inline-flex items-center gap-2 bg-gray-400 text-white px-3 py-2 rounded text-sm" onClick={()=>resetForm()}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab==='preview'&&(
        <div className="mb-6 bg-white border rounded">
          <div className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="relative sm:col-span-2">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-indigo-500"/>
                </div>
                <input
                  type="text"
                  placeholder="Search Location ID/Name"
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                  className="border p-2 rounded w-full text-sm pl-8"
                />
              </div>
              <IconSelect icon={Building2} value={selectedPlant} onChange={(e)=>{setSelectedPlant(e.target.value);setSelectedSubplant('');setSelectedDepartment('');setSelectedArea('');}} leftColor="text-blue-600">
                <option value="">Plant</option>
                {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id}</option>))}
              </IconSelect>
              <IconSelect icon={Factory} value={selectedSubplant} onChange={(e)=>{setSelectedSubplant(e.target.value);setSelectedDepartment('');setSelectedArea('');}} leftColor="text-green-600" disabled={!selectedPlant}>
                <option value="">Subplant</option>
                {filteredSubplants.map((sp)=>(<option key={sp.id} value={sp.id}>{sp.subplant_id}</option>))}
              </IconSelect>
              <IconSelect icon={Briefcase} value={selectedDepartment} onChange={(e)=>{setSelectedDepartment(e.target.value);setSelectedArea('');}} leftColor="text-purple-600" disabled={!selectedSubplant}>
                <option value="">Department</option>
                {filteredDepartments.map((d)=>(<option key={d.id} value={d.id}>{d.department_name}</option>))}
              </IconSelect>
              <IconSelect icon={Grid3X3} value={selectedArea} onChange={(e)=>setSelectedArea(e.target.value)} leftColor="text-pink-600" disabled={!selectedDepartment}>
                <option value="">Area</option>
                {filteredAreas.map((a)=>(<option key={a.id} value={a.id}>{a.area_name}</option>))}
              </IconSelect>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">Location ID</th>
                  <th className="p-2 border text-left">Location Name</th>
                  <th className="p-2 border text-left">Type</th>
                  <th className="p-2 border text-left">Area</th>
                  <th className="p-2 border text-left">Dept</th>
                  <th className="p-2 border text-left">Subplant</th>
                  <th className="p-2 border text-left">Plant</th>
                  <th className="p-2 border text-left">Status</th>
                  <th className="p-2 border text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading?(
                  Array.from({length:6}).map((_,i)=>(
                    <tr key={`sk-${i}`} className="animate-pulse">
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-40"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-24"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-32"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-32"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-28"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-28"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-20"/></td>
                      <td className="p-2 border"><div className="h-7 bg-gray-200 rounded w-28"/></td>
                    </tr>
                  ))
                ):filteredRows.length>0?(
                  filteredRows.map((r)=>(
                    <tr key={r.location_uid}>
                      <td className="p-2 border">{r.location_id}</td>
                      <td className="p-2 border">
                        <div className="flex flex-col">
                          <span>{r.location_name}</span>
                          <span className="text-xs text-gray-500">{r.location_description||'\u00A0'}</span>
                        </div>
                      </td>
                      <td className="p-2 border"><TypeBadge type={r.location_type}/></td>
                      <td className="p-2 border">{r.area_id} - {r.area_name}</td>
                      <td className="p-2 border">{r.department_id} - {r.department_name}</td>
                      <td className="p-2 border">{r.subplant_id} - {r.subplant_name}</td>
                      <td className="p-2 border">{r.plant_id} - {r.plant_description}</td>
                      <td className="p-2 border"><StatusBadge status={r.location_status}/></td>
                      <td className="p-2 border">
                        <div className="inline-flex gap-2">
                          <button onClick={()=>handleEdit(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300">
                            <Pencil className="h-3.5 w-3.5 text-yellow-600"/>Edit
                          </button>
                          <button onClick={()=>handleDelete(r.location_uid)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300">
                            <Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ):(
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-gray-500">No Locations Found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
