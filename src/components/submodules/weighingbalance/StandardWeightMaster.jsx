// src/components/masters/StandardWeightMaster.jsx
import {useState,useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';
import {Package,Box,Layers,Building2,Factory,MapPin,Edit3,Trash2,Loader2,CheckCircle2,Weight} from 'lucide-react';

const MATERIALS=['Stainless Steel','Analytical','Cast Iron','Brass','Other'];

const StandardWeightMaster=()=>{
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);
  const [weights,setWeights]=useState([]);
  const [uoms,setUoms]=useState([]);                 // from vw_uom_master (display only)
  const [weightboxes,setWeightboxes]=useState([]);   // filtered by area

  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [activeTab,setActiveTab]=useState('manage');

  const [selectedPlant,setSelectedPlant]=useState('');
  const [selectedSubplant,setSelectedSubplant]=useState('');
  const [selectedDepartment,setSelectedDepartment]=useState('');
  const [selectedArea,setSelectedArea]=useState('');
  const [selectedUom,setSelectedUom]=useState('');          // text (e.g., 'Kg')
  const [selectedWeightbox,setSelectedWeightbox]=useState(''); // uuid

  const [form,setForm]=useState({
    id:null,
    standard_weight_id:'',
    standard_weight_type:'Stainless Steel',
    capacity:'',
    stamping_done_on:'',
    stamping_due_on:'',
    status:'Active'
  });

  // Plants
  useEffect(()=>{
    const fetchPlants=async()=>{
      const {data,error}=await supabase.from('plant_master').select('id,description').order('description');
      if(error){toast.error('Failed to load plants');return;}
      setPlants(data||[]);
    };
    fetchPlants();
  },[]);

  // UOMs (for dropdown, we store the uom text into table)
  useEffect(()=>{
    const fetchUoms=async()=>{
      const {data,error}=await supabase.from('vw_uom_master').select('id,uom_code,uom_name,uom').order('uom_code');
      if(error){toast.error('Failed to load UOMs');return;}
      setUoms(data||[]);
    };
    fetchUoms();
  },[]);

  // Cascading: Subplants
  useEffect(()=>{
    if(!selectedPlant){setSubplants([]);setDepartments([]);setAreas([]);setSelectedSubplant('');setSelectedDepartment('');setSelectedArea('');return;}
    const fetchSub=async()=>{
      const {data,error}=await supabase.from('subplant_master').select('id,subplant_name').eq('plant_uid',selectedPlant).order('subplant_name');
      if(!error) setSubplants(data||[]);
    };
    fetchSub();
  },[selectedPlant]);

  // Departments
  useEffect(()=>{
    if(!selectedSubplant){setDepartments([]);setAreas([]);setSelectedDepartment('');setSelectedArea('');return;}
    const fetchDept=async()=>{
      const {data,error}=await supabase.from('department_master').select('id,department_name').eq('subplant_uid',selectedSubplant).order('department_name');
      if(!error) setDepartments(data||[]);
    };
    fetchDept();
  },[selectedSubplant]);

  // Areas
  useEffect(()=>{
    if(!selectedDepartment){setAreas([]);setSelectedArea('');return;}
    const fetchArea=async()=>{
      const {data,error}=await supabase.from('area_master').select('id,area_name').eq('department_uid',selectedDepartment).order('area_name');
      if(!error) setAreas(data||[]);
    };
    fetchArea();
  },[selectedDepartment]);

  // WeightBoxes filtered by Area
  useEffect(()=>{
    const fetchWb=async()=>{
      if(!selectedArea){setWeightboxes([]);setSelectedWeightbox('');return;}
      const {data,error}=await supabase.from('weightbox_master').select('id,weightbox_id,weightbox_type,area_uid').eq('area_uid',selectedArea).order('weightbox_id');
      if(error){toast.error('Failed to load weight boxes');return;}
      setWeightboxes(data||[]);
      if(data && !data.find((w)=>w.id===selectedWeightbox)) setSelectedWeightbox('');
    };
    fetchWb();
  },[selectedArea]);

  // Load rows
  const loadWeights=async()=>{
    setLoading(true);
    const {data,error}=await supabase.from('vw_standard_weight_master').select('*').order('standard_weight_id');
    if(error){toast.error('Failed to load standard weights');setLoading(false);return;}
    setWeights(data||[]);
    setLoading(false);
  };
  useEffect(()=>{loadWeights();},[]);

  // Save
  const handleSave=async()=>{
    if(!form.standard_weight_id||!selectedArea||!selectedUom||!selectedWeightbox){
      toast.error('Std Weight ID, Area, UOM and WeightBox are required');
      return;
    }
    const capacityNum=Number(form.capacity);
    if(Number.isNaN(capacityNum)){toast.error('Capacity must be a number');return;}

    const payload={
      standard_weight_id:form.standard_weight_id,
      standard_weight_type:form.standard_weight_type, // enum text
      capacity:capacityNum,
      uom:selectedUom,                                // text
      weightbox_uid:selectedWeightbox,                // FK
      plant_uid:selectedPlant||null,
      subplant_uid:selectedSubplant||null,
      department_uid:selectedDepartment||null,
      area_uid:selectedArea||null,
      stamping_done_on:form.stamping_done_on||null,
      stamping_due_on:form.stamping_due_on||null,
      status:form.status
    };

    try{
      if(form.id){
        const {error}=await supabase.from('standard_weight_master').update(payload).eq('id',form.id);
        if(error) throw error;
        toast.success('✅ Standard Weight Updated');
      }else{
        const {error}=await supabase.from('standard_weight_master').insert([payload]);
        if(error) throw error;
        toast.success('✅ Standard Weight Added');
      }
      resetForm();
      await loadWeights();
      setActiveTab('preview');
    }catch(err){
      toast.error(err.message||'❌ Save failed');
    }
  };

  const resetForm=()=>{
    setForm({id:null,standard_weight_id:'',standard_weight_type:'Stainless Steel',capacity:'',stamping_done_on:'',stamping_due_on:'',status:'Active'});
    setSelectedUom('');
    setSelectedWeightbox('');
  };

  const handleEdit=(sw)=>{
    setActiveTab('manage');
    setForm({
      id:sw.id,
      standard_weight_id:sw.standard_weight_id||'',
      standard_weight_type:sw.standard_weight_type||'Stainless Steel',
      capacity:sw.capacity??'',
      stamping_done_on:sw.stamping_done_on||'',
      stamping_due_on:sw.stamping_due_on||'',
      status:sw.status||'Active'
    });
    setSelectedPlant(sw.plant_uid||'');
    setSelectedSubplant(sw.subplant_uid||'');
    setSelectedDepartment(sw.department_uid||'');
    setSelectedArea(sw.area_uid||'');
    setSelectedUom(sw.uom||'');
    setSelectedWeightbox(sw.weightbox_uid||'');
  };

  const handleDelete=(id)=>{
    toast.promise(
      supabase.from('standard_weight_master').delete().eq('id',id),
      {loading:'Deleting...',success:'🗑️ Deleted',error:'❌ Delete failed'}
    ).then(()=>loadWeights());
  };

  const filtered=weights.filter((w)=>{
    const q=search.toLowerCase();
    return (
      w.standard_weight_id?.toLowerCase().includes(q)||
      w.weightbox_id?.toLowerCase().includes(q)||
      w.standard_weight_type?.toLowerCase().includes(q)||
      String(w.capacity||'').toLowerCase().includes(q)||
      (w.uom||'').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-3 max-w-6xl mx-auto">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Weight className="text-purple-600"/> Standard Weight Master
      </h2>

      <div className="flex gap-2 mb-4">
        <button onClick={()=>setActiveTab('manage')} className={`px-3 py-1 rounded ${activeTab==='manage'?'bg-blue-600 text-white':'bg-gray-200'}`}>Manage</button>
        <button onClick={()=>setActiveTab('preview')} className={`px-3 py-1 rounded ${activeTab==='preview'?'bg-blue-600 text-white':'bg-gray-200'}`}>Preview All</button>
      </div>

      {activeTab==='manage'&&(
        <>
          {/* Hierarchy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <label className="text-sm font-semibold flex flex-col">
              <Building2 className="text-green-600" size={14}/> Plant
              <select value={selectedPlant} onChange={(e)=>setSelectedPlant(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select Plant</option>
                {plants.map((p)=><option key={p.id} value={p.id}>{p.description}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold flex flex-col">
              <Factory className="text-indigo-600" size={14}/> SubPlant
              <select value={selectedSubplant} onChange={(e)=>setSelectedSubplant(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select SubPlant</option>
                {subplants.map((sp)=><option key={sp.id} value={sp.id}>{sp.subplant_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold flex flex-col">
              <Box className="text-orange-600" size={14}/> Department
              <select value={selectedDepartment} onChange={(e)=>setSelectedDepartment(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select Department</option>
                {departments.map((d)=><option key={d.id} value={d.id}>{d.department_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold flex flex-col">
              <MapPin className="text-red-600" size={14}/> Area
              <select value={selectedArea} onChange={(e)=>setSelectedArea(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select Area</option>
                {areas.map((a)=><option key={a.id} value={a.id}>{a.area_name}</option>)}
              </select>
            </label>
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <label className="text-sm font-semibold flex flex-col">
              <Box className="text-purple-600" size={14}/> Std Weight ID
              <input value={form.standard_weight_id} onChange={(e)=>setForm({...form,standard_weight_id:e.target.value})} className="border p-1 rounded text-sm"/>
            </label>

            <label className="text-sm font-semibold flex flex-col">
              <Layers className="text-blue-600" size={14}/> Type
              <select value={form.standard_weight_type} onChange={(e)=>setForm({...form,standard_weight_type:e.target.value})} className="border p-1 rounded text-sm">
                {MATERIALS.map((m)=><option key={m} value={m}>{m}</option>)}
              </select>
            </label>

            <label className="text-sm font-semibold flex flex-col">
              <Weight className="text-emerald-600" size={14}/> Capacity
              <input type="number" step="0.000001" value={form.capacity} onChange={(e)=>setForm({...form,capacity:e.target.value})} className="border p-1 rounded text-sm"/>
            </label>

            {/* UOM (text) */}
            <label className="text-sm font-semibold flex flex-col">
              <CheckCircle2 className="text-teal-600" size={14}/> UOM
              <select value={selectedUom} onChange={(e)=>setSelectedUom(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select UOM</option>
                {uoms.map((u)=><option key={u.id} value={u.uom}>{u.uom_code} - {u.uom_name} ({u.uom})</option>)}
              </select>
            </label>

            {/* WeightBox (filtered by Area) */}
            <label className="text-sm font-semibold flex flex-col">
              <Package className="text-pink-600" size={14}/> WeightBox
              <select value={selectedWeightbox} onChange={(e)=>setSelectedWeightbox(e.target.value)} className="border p-1 rounded text-sm">
                <option value="">Select WeightBox</option>
                {weightboxes.map((w)=><option key={w.id} value={w.id}>{w.weightbox_id} — {String(w.weightbox_type||'')}</option>)}
              </select>
            </label>

            <label className="text-sm font-semibold flex flex-col">
              <CheckCircle2 className="text-emerald-600" size={14}/> Stamped On
              <input type="date" value={form.stamping_done_on} onChange={(e)=>setForm({...form,stamping_done_on:e.target.value})} className="border p-1 rounded text-sm"/>
            </label>
            <label className="text-sm font-semibold flex flex-col">
              <CheckCircle2 className="text-rose-600" size={14}/> Due On
              <input type="date" value={form.stamping_due_on} onChange={(e)=>setForm({...form,stamping_due_on:e.target.value})} className="border p-1 rounded text-sm"/>
            </label>
            <label className="text-sm font-semibold flex flex-col">
              <CheckCircle2 className="text-green-600" size={14}/> Status
              <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="border p-1 rounded text-sm">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <button onClick={handleSave} className="bg-blue-600 text-white px-3 py-1 rounded mb-3">
            {form.id?'Update':'Add'} Standard Weight
          </button>
        </>
      )}

      {activeTab==='preview'&&(
        <>
          <input placeholder="Search" value={search} onChange={(e)=>setSearch(e.target.value)} className="border p-1 rounded text-sm w-full sm:w-1/3 mb-3"/>
          {loading?(
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="animate-spin"/> Loading weights...
            </div>
          ):(
            <div className="overflow-x-auto">
              <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-1">Std Weight ID</th>
                    <th className="border p-1">Type</th>
                    <th className="border p-1">Capacity</th>
                    <th className="border p-1">UOM</th>
                    <th className="border p-1">WeightBox</th>
                    <th className="border p-1">Plant</th>
                    <th className="border p-1">Subplant</th>
                    <th className="border p-1">Department</th>
                    <th className="border p-1">Area</th>
                    <th className="border p-1">Status</th>
                    <th className="border p-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sw)=>(
                    <tr key={sw.id}>
                      <td className="border p-1">{sw.standard_weight_id}</td>
                      <td className="border p-1">{sw.standard_weight_type}</td>
                      <td className="border p-1">{sw.capacity}</td>
                      <td className="border p-1">{sw.uom}</td>
                      <td className="border p-1">{sw.weightbox_id}</td>
                      <td className="border p-1">{sw.plant_name||sw.plant_uid}</td>
                      <td className="border p-1">{sw.subplant_name||sw.subplant_uid}</td>
                      <td className="border p-1">{sw.department_name||sw.department_uid}</td>
                      <td className="border p-1">{sw.area_name||sw.area_uid}</td>
                      <td className="border p-1">
                        <span className={`px-2 py-0.5 rounded text-xs ${sw.status==='Active'?'bg-green-200 text-green-800':'bg-red-200 text-red-800'}`}>{sw.status}</span>
                      </td>
                      <td className="border p-1 flex gap-1">
                        <button onClick={()=>handleEdit(sw)} className="bg-yellow-500 text-white p-1 rounded inline-flex"><Edit3 size={14}/></button>
                        <button onClick={()=>handleDelete(sw.id)} className="bg-red-500 text-white p-1 rounded inline-flex"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length===0&&<tr><td colSpan="11" className="text-center p-2">No records found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StandardWeightMaster;
