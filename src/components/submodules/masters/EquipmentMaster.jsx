import {useState,useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const EquipmentMaster = () => {
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);
  const [equipments,setEquipments]=useState([]);

  const [selectedPlant,setSelectedPlant]=useState('');
  const [selectedSubplant,setSelectedSubplant]=useState('');
  const [selectedDepartment,setSelectedDepartment]=useState('');
  const [selectedArea,setSelectedArea]=useState('');

  const [form,setForm]=useState({
    id:null,
    equipment_id:'',
    equipment_name:'',
    equipment_type:'',
    calibration_done_on:'',
    calibration_due_on:'',
    status:'Active'
  });

  const [search,setSearch]=useState('');
  const [error,setError]=useState('');

  // ✅ Fetch Plants
  useEffect(()=>{
    const fetchPlants=async()=>{
      const {data}=await supabase.from('operation_hierarchy')
        .select('plant_id,plant_name')
        .order('plant_id');
      const unique=[...new Map((data||[]).map(i=>[i.plant_id,i])).values()];
      setPlants(unique);
    };
    fetchPlants();
  },[]);

  // ✅ Fetch Subplants
  useEffect(()=>{
    if(!selectedPlant){setSubplants([]);setDepartments([]);setAreas([]);return;}
    const fetchSubplants=async()=>{
      const {data}=await supabase.from('operation_hierarchy')
        .select('subplant_id,subplant_name')
        .eq('plant_id',selectedPlant);
      const unique=[...new Map((data||[]).map(i=>[i.subplant_id,i])).values()];
      setSubplants(unique);
    };
    fetchSubplants();
  },[selectedPlant]);

  // ✅ Fetch Departments
  useEffect(()=>{
    if(!selectedSubplant){setDepartments([]);setAreas([]);return;}
    const fetchDepartments=async()=>{
      const {data}=await supabase.from('operation_hierarchy')
        .select('department_id,department_name')
        .eq('subplant_id',selectedSubplant);
      const unique=[...new Map((data||[]).map(i=>[i.department_id,i])).values()];
      setDepartments(unique);
    };
    fetchDepartments();
  },[selectedSubplant]);

  // ✅ Fetch Areas
  useEffect(()=>{
    if(!selectedDepartment){setAreas([]);return;}
    const fetchAreas=async()=>{
      const {data}=await supabase.from('operation_hierarchy')
        .select('area_id,area_name')
        .eq('department_id',selectedDepartment);
      const unique=[...new Map((data||[]).map(i=>[i.area_id,i])).values()];
      setAreas(unique);
    };
    fetchAreas();
  },[selectedDepartment]);

  // ✅ Fetch Equipment
  useEffect(()=>{
    if(!selectedArea){setEquipments([]);return;}
    const fetchEquipment=async()=>{
      const {data}=await supabase.from('equipment_master')
        .select('*')
        .eq('area_id',selectedArea)
        .order('equipment_id');
      setEquipments(data||[]);
    };
    fetchEquipment();
  },[selectedArea]);

  // ✅ Save Equipment
  const handleSave=async()=>{
    if(!form.equipment_id || !form.equipment_name || !selectedArea){
      setError('Equipment ID, Name, and Area are required');
      return;
    }
    if(form.id){
      await supabase.from('equipment_master')
        .update({
          equipment_id:form.equipment_id,
          equipment_name:form.equipment_name,
          equipment_type:form.equipment_type,
          calibration_done_on:form.calibration_done_on,
          calibration_due_on:form.calibration_due_on,
          status:form.status,
          area_id:selectedArea,
          department_id:selectedDepartment
        }).eq('id',form.id);
    }else{
      await supabase.from('equipment_master')
        .insert([{
          equipment_id:form.equipment_id,
          equipment_name:form.equipment_name,
          equipment_type:form.equipment_type,
          calibration_done_on:form.calibration_done_on,
          calibration_due_on:form.calibration_due_on,
          status:form.status,
          area_id:selectedArea,
          department_id:selectedDepartment
        }]);
    }
    setForm({id:null,equipment_id:'',equipment_name:'',equipment_type:'',calibration_done_on:'',calibration_due_on:'',status:'Active'});
    const {data}=await supabase.from('equipment_master').select('*').eq('area_id',selectedArea);
    setEquipments(data||[]);
  };

  const handleEdit=(eq)=>{
    setForm(eq);
    setSelectedArea(eq.area_id);
    setSelectedDepartment(eq.department_id);
  };

  const handleDelete=async(id)=>{
    if(!window.confirm('Delete this equipment?'))return;
    await supabase.from('equipment_master').delete().eq('id',id);
    const {data}=await supabase.from('equipment_master').select('*').eq('area_id',selectedArea);
    setEquipments(data||[]);
  };

  const filteredEquipments = equipments.filter(e =>
    e.equipment_id.toLowerCase().includes(search.toLowerCase()) ||
    e.equipment_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Equipment Master</h2>
      {error && <div className="bg-red-200 text-red-800 p-2 mb-2">{error}</div>}

      {/* Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Plant</label>
          <select value={selectedPlant} onChange={e=>setSelectedPlant(e.target.value)} className="border p-2 rounded">
            <option value="">Select Plant</option>
            {plants.map(p=><option key={p.plant_id} value={p.plant_id}>{p.plant_name || p.plant_id}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">SubPlant</label>
          <select value={selectedSubplant} onChange={e=>setSelectedSubplant(e.target.value)} className="border p-2 rounded">
            <option value="">Select SubPlant</option>
            {subplants.map(sp=><option key={sp.subplant_id} value={sp.subplant_id}>{sp.subplant_name || sp.subplant_id}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Department</label>
          <select value={selectedDepartment} onChange={e=>setSelectedDepartment(e.target.value)} className="border p-2 rounded">
            <option value="">Select Department</option>
            {departments.map(d=><option key={d.department_id} value={d.department_id}>{d.department_name || d.department_id}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Area</label>
          <select value={selectedArea} onChange={e=>setSelectedArea(e.target.value)} className="border p-2 rounded">
            <option value="">Select Area</option>
            {areas.map(a=><option key={a.area_id} value={a.area_id}>{a.area_name || a.area_id}</option>)}
          </select>
        </div>
      </div>

      {/* Equipment Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Equipment ID</label>
          <input placeholder="Enter Equipment ID" value={form.equipment_id} onChange={e=>setForm({...form,equipment_id:e.target.value})} className="border p-2 rounded"/>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Equipment Name</label>
          <input placeholder="Enter Equipment Name" value={form.equipment_name} onChange={e=>setForm({...form,equipment_name:e.target.value})} className="border p-2 rounded"/>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={form.equipment_type} onChange={e=>setForm({...form,equipment_type:e.target.value})} className="border p-2 rounded">
            <option value="">Select Type</option>
            <option value="Portable">Portable</option>
            <option value="Immovable">Immovable</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Calibration Done On</label>
          <input type="date" value={form.calibration_done_on} onChange={e=>setForm({...form,calibration_done_on:e.target.value})} className="border p-2 rounded"/>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Calibration Due On</label>
          <input type="date" value={form.calibration_due_on} onChange={e=>setForm({...form,calibration_due_on:e.target.value})} className="border p-2 rounded"/>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="border p-2 rounded">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">{form.id?'Update':'Add'} Equipment</button>

      <div className="mt-4 mb-2">
        <input placeholder="Search by ID or Name" value={search} onChange={e=>setSearch(e.target.value)} className="border p-2 w-full md:w-1/3 rounded"/>
      </div>

      {/* Equipment Table */}
      <table className="w-full border mt-2">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Equipment ID</th>
            <th className="border p-2">Name</th>
            <th className="border p-2">Type</th>
            <th className="border p-2">Calibration Done</th>
            <th className="border p-2">Calibration Due</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredEquipments.map(eq=>(
            <tr key={eq.id}>
              <td className="border p-2">{eq.equipment_id}</td>
              <td className="border p-2">{eq.equipment_name}</td>
              <td className="border p-2">{eq.equipment_type}</td>
              <td className="border p-2">{eq.calibration_done_on}</td>
              <td className="border p-2">{eq.calibration_due_on}</td>
              <td className="border p-2">{eq.status}</td>
              <td className="border p-2 space-x-2">
                <button onClick={()=>handleEdit(eq)} className="bg-yellow-500 text-white px-2 py-1 rounded">Edit</button>
                <button onClick={()=>handleDelete(eq.id)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
              </td>
            </tr>
          ))}
          {filteredEquipments.length===0 && <tr><td colSpan="7" className="text-center p-4">No equipment found</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default EquipmentMaster;
