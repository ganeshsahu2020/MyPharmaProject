// src/components/masters/UomMaster.jsx
import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import {
  Layers,Factory,Tag,ClipboardList,Scale,
  CheckCircle2,XCircle,ChevronDown,Search,
  Loader2,Pencil,Trash2
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
      value={value||''}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      className="border rounded text-sm w-full p-2 pl-8"
    />
  </div>
);

const IconNumber=({icon:Icon,value,onChange,placeholder,min=0,step='any',color='text-purple-600'})=>(
  <div className="relative">
    <div className={`absolute inset-y-0 left-2 flex items-center pointer-events-none ${color}`}>
      <Icon className="h-4 w-4"/>
    </div>
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={onChange}
      placeholder={placeholder}
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
      value={value||''}
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
  return <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-medium ${cls}`}>{status}</span>;
};

/* -------------------- Component -------------------- */
export default function UomMaster(){
  const [plants,setPlants]=useState([]);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [activeTab,setActiveTab]=useState('manage');

  const [selectedPlant,setSelectedPlant]=useState('');
  const [search,setSearch]=useState('');

  const [form,setForm]=useState({
    id:null,
    uom_code:'',
    uom_name:'',
    uom:'',
    numerator_value:1,
    denominator_value:1,
    status:'Active'
  });

  useEffect(()=>{ loadAll(); },[]);

  async function loadAll(){
    setLoading(true);
    const op=Promise.all([
      supabase.from('plant_master').select('id,plant_id,description').order('plant_id',{ascending:true}),
      supabase.from('uom_master').select('*').order('uom_code',{ascending:true})
    ]).then(([pl,u])=>{
      if(pl.error) throw new Error(pl.error.message);
      if(u.error) throw new Error(u.error.message);
      setPlants(pl.data||[]);
      setRows(u.data||[]);
    }).finally(()=>setLoading(false));

    await toast.promise(op,{loading:'Loading UOMs...',success:'Loaded',error:(e)=>`Load failed: ${e.message}`});
  }

  const filteredRows=useMemo(()=>{
    let data=rows;
    if(selectedPlant) data=data.filter((r)=>r.plant_uid===selectedPlant);
    if(search.trim()){
      const t=search.toLowerCase();
      data=data.filter((r)=>
        r.uom_code?.toLowerCase().includes(t)||
        r.uom_name?.toLowerCase().includes(t)||
        r.uom?.toLowerCase().includes(t)
      );
    }
    return data;
  },[rows,selectedPlant,search]);

  function resetForm(){
    setForm({id:null,uom_code:'',uom_name:'',uom:'',numerator_value:1,denominator_value:1,status:'Active'});
    // keep selectedPlant as-is so user can add many in same plant
  }

  // ---- Unique check: prevent duplicate (plant_uid,uom_code) ----
  async function assertUomUniqueOnCreate(plant_uid,uom_code){
    const {data,error}=await supabase
      .from('uom_master')
      .select('id')
      .eq('plant_uid',plant_uid)
      .eq('uom_code',uom_code)
      .maybeSingle();
    if(error){throw new Error(error.message);}
    if(data){throw new Error('UOM Code must be unique for the selected Plant');}
  }
  async function assertUomUniqueOnUpdate(plant_uid,uom_code,id){
    const {data,error}=await supabase
      .from('uom_master')
      .select('id')
      .eq('plant_uid',plant_uid)
      .eq('uom_code',uom_code)
      .neq('id',id)
      .maybeSingle();
    if(error){throw new Error(error.message);}
    if(data){throw new Error('UOM Code must be unique for the selected Plant');}
  }

  async function handleSave(e){
    e?.preventDefault?.();
    if(!selectedPlant){toast.error('Plant is required');return;}
    if(!form.uom_code||!form.uom_name){toast.error('UOM Code & Name are required');return;}

    // sanitize numeric fields
    const num=Number(form.numerator_value)||1;
    const den=Number(form.denominator_value)||1;

    const payload={
      uom_code:form.uom_code.trim(),
      uom_name:form.uom_name.trim(),
      uom:(form.uom||'').trim(),
      numerator_value:num,
      denominator_value:den,
      plant_uid:selectedPlant,
      status:form.status||'Active'
    };

    setSaving(true);
    try{
      if(!form.id){
        await assertUomUniqueOnCreate(payload.plant_uid,payload.uom_code);
        const op=supabase.from('uom_master').insert([payload]).select('id');
        await toast.promise(op,{loading:'Saving UOM...',success:'UOM added',error:(err)=>err?.message||'Save failed'});
      }else{
        await assertUomUniqueOnUpdate(payload.plant_uid,payload.uom_code,form.id);
        const op=supabase.from('uom_master').update(payload).eq('id',form.id).select('id');
        await toast.promise(op,{loading:'Updating UOM...',success:'UOM updated',error:(err)=>err?.message||'Update failed'});
      }
      resetForm();
      setActiveTab('preview');
      await loadAll();
    }catch(err){
      toast.error(err?.message||'Operation failed');
    }finally{
      setSaving(false);
    }
  }

  async function handleDelete(id){
    if(!id){toast.error('Missing ID');return;}
    if(!window.confirm('Delete this UOM?')) return;
    const op=supabase.from('uom_master').delete().eq('id',id);
    await toast.promise(op,{loading:'Deleting...',success:'Deleted',error:'Delete failed'});
    if(form.id===id) resetForm();
    await loadAll();
  }

  function handleEdit(row){
    setForm({
      id:row.id,
      uom_code:row.uom_code||'',
      uom_name:row.uom_name||'',
      uom:row.uom||'',
      numerator_value:row.numerator_value??1,
      denominator_value:row.denominator_value??1,
      status:row.status||'Active'
    });
    setSelectedPlant(row.plant_uid||'');
    setActiveTab('manage');
    toast.success(`✏️ Editing UOM: ${row.uom_code}`);
  }

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3 text-blue-700 flex items-center gap-2">
        <Layers className="h-5 w-5"/>UOM Master
      </h2>

      {/* Tabs */}
      <div className="flex gap-3 mb-3">
        <button onClick={()=>{setActiveTab('manage');}} className={`px-3 py-1 rounded ${activeTab==='manage'?'bg-blue-600 text-white':'bg-gray-200'}`}>Manage</button>
        <button onClick={()=>{setActiveTab('preview');}} className={`px-3 py-1 rounded ${activeTab==='preview'?'bg-blue-600 text-white':'bg-gray-200'}`}>Preview All</button>
      </div>

      {activeTab==='manage'&&(
        <form onSubmit={handleSave} className="bg-white border p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Plant */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium mb-1">Plant</label>
            <IconSelect icon={Factory} value={selectedPlant} onChange={(e)=>setSelectedPlant(e.target.value)} leftColor="text-blue-600">
              <option value="">Select Plant</option>
              {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id} - {p.description}</option>))}
            </IconSelect>
          </div>

          {/* UOM Code */}
          <div>
            <label className="block text-xs font-medium mb-1">UOM Code</label>
            <IconInput icon={Tag} value={form.uom_code} onChange={(e)=>setForm({...form,uom_code:e.target.value})} placeholder="e.g. KG" color="text-indigo-600" required/>
          </div>

          {/* UOM Name */}
          <div>
            <label className="block text-xs font-medium mb-1">UOM Name</label>
            <IconInput icon={ClipboardList} value={form.uom_name} onChange={(e)=>setForm({...form,uom_name:e.target.value})} placeholder="Kilogram" color="text-green-600" required/>
          </div>

          {/* Symbol */}
          <div>
            <label className="block text-xs font-medium mb-1">Symbol</label>
            <IconInput icon={Scale} value={form.uom} onChange={(e)=>setForm({...form,uom:e.target.value})} placeholder="kg / g / ml" color="text-purple-600"/>
          </div>

          {/* Numerator / Denominator */}
          <div>
            <label className="block text-xs font-medium mb-1">Numerator</label>
            <IconNumber icon={Scale} value={form.numerator_value} onChange={(e)=>setForm({...form,numerator_value:e.target.value})} placeholder="1" color="text-amber-600"/>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Denominator</label>
            <IconNumber icon={Scale} value={form.denominator_value} onChange={(e)=>setForm({...form,denominator_value:e.target.value})} placeholder="1" color="text-rose-600"/>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <IconSelect icon={form.status==='Active'?CheckCircle2:XCircle} value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} leftColor={form.status==='Active'?'text-emerald-600':'text-rose-600'}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </IconSelect>
          </div>

          <div className="flex items-end gap-2 col-span-full">
            <button type="submit" disabled={saving||!selectedPlant} className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm">
              {saving?<Loader2 className="h-4 w-4 animate-spin"/>:null}
              {form.id?'Update UOM':'Add UOM'}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative sm:col-span-2">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-indigo-500"/>
                </div>
                <input
                  type="text"
                  placeholder="Search UOM Code/Name/Symbol"
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                  className="border p-2 rounded w-full text-sm pl-8"
                />
              </div>
              <IconSelect icon={Factory} value={selectedPlant} onChange={(e)=>setSelectedPlant(e.target.value)} leftColor="text-blue-600">
                <option value="">Filter by Plant</option>
                {plants.map((p)=>(<option key={p.id} value={p.id}>{p.plant_id}</option>))}
              </IconSelect>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">UOM Code</th>
                  <th className="p-2 border text-left">Name</th>
                  <th className="p-2 border text-left">Symbol</th>
                  <th className="p-2 border text-left">Numerator</th>
                  <th className="p-2 border text-left">Denominator</th>
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
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-16"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-16"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-36"/></td>
                      <td className="p-2 border"><div className="h-4 bg-gray-200 rounded w-16"/></td>
                      <td className="p-2 border"><div className="h-7 bg-gray-200 rounded w-28"/></td>
                    </tr>
                  ))
                ):filteredRows.length>0?(
                  filteredRows.map((r)=>(
                    <tr key={r.id}>
                      <td className="p-2 border">{r.uom_code}</td>
                      <td className="p-2 border">{r.uom_name}</td>
                      <td className="p-2 border">{r.uom||'—'}</td>
                      <td className="p-2 border">{r.numerator_value}</td>
                      <td className="p-2 border">{r.denominator_value}</td>
                      <td className="p-2 border">{plants.find((p)=>p.id===r.plant_uid)?.plant_id||r.plant_uid}</td>
                      <td className="p-2 border"><StatusBadge status={r.status}/></td>
                      <td className="p-2 border">
                        <div className="inline-flex gap-2">
                          <button onClick={()=>handleEdit(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-yellow-50 hover:border-yellow-300">
                            <Pencil className="h-3.5 w-3.5 text-yellow-600"/>Edit
                          </button>
                          <button onClick={()=>handleDelete(r.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-rose-50 hover:border-rose-300">
                            <Trash2 className="h-3.5 w-3.5 text-rose-600"/>Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ):(
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500">No UOMs Found</td>
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
