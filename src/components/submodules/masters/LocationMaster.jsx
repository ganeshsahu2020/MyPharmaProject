import {useState,useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const LocationMaster = () => {
  const [plants,setPlants]=useState([]);
  const [subplants,setSubplants]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [areas,setAreas]=useState([]);
  const [locations,setLocations]=useState([]);

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

  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');

  // ✅ Fetch Plants
  useEffect(()=>{
    const fetchPlants=async()=>{
      const {data,error}=await supabase
        .from('operation_hierarchy')
        .select('plant_id,plant_name')
        .order('plant_id');
      if(error){console.error(error);setError('Failed to load plants');return;}
      const unique=[...new Map((data||[]).map(i=>[i.plant_id,i])).values()];
      setPlants(unique);
    };
    fetchPlants();
  },[]);

  // ✅ Subplants
  useEffect(()=>{
    if(!selectedPlant){setSubplants([]);setDepartments([]);setAreas([]);return;}
    const fetchSubplants=async()=>{
      const {data}=await supabase
        .from('operation_hierarchy')
        .select('subplant_id,subplant_name')
        .eq('plant_id',selectedPlant);
      const unique=[...new Map((data||[]).map(i=>[i.subplant_id,i])).values()];
      setSubplants(unique);
    };
    fetchSubplants();
  },[selectedPlant]);

  // ✅ Departments
  useEffect(()=>{
    if(!selectedSubplant){setDepartments([]);setAreas([]);return;}
    const fetchDepartments=async()=>{
      const {data}=await supabase
        .from('operation_hierarchy')
        .select('department_id,department_name')
        .eq('subplant_id',selectedSubplant);
      const unique=[...new Map((data||[]).map(i=>[i.department_id,i])).values()];
      setDepartments(unique);
    };
    fetchDepartments();
  },[selectedSubplant]);

  // ✅ Areas
  useEffect(()=>{
    if(!selectedDepartment){setAreas([]);return;}
    const fetchAreas=async()=>{
      const {data}=await supabase
        .from('operation_hierarchy')
        .select('area_id,area_name')
        .eq('department_id',selectedDepartment);
      const unique=[...new Map((data||[]).map(i=>[i.area_id,i])).values()];
      setAreas(unique);
    };
    fetchAreas();
  },[selectedDepartment]);

  // ✅ Locations
  useEffect(()=>{
    if(!selectedArea){setLocations([]);return;}
    const fetchLocations=async()=>{
      const {data}=await supabase
        .from('location_master')
        .select('*')
        .eq('area_id',selectedArea)
        .order('location_id');
      setLocations(data||[]);
    };
    fetchLocations();
  },[selectedArea]);

  // ✅ Save
  const handleSave=async()=>{
    setLoading(true);setError('');
    try{
      if(!form.location_id || !form.location_name || !selectedArea){
        setError('Location ID, Name and Area are required');
        setLoading(false);return;
      }
      if(form.id){
        await supabase.from('location_master')
          .update({
            location_id:form.location_id,
            location_name:form.location_name,
            location_description:form.location_description,
            location_type:form.location_type,
            area_id:selectedArea
          }).eq('id',form.id);
      }else{
        await supabase.from('location_master')
          .insert([{
            location_id:form.location_id,
            location_name:form.location_name,
            location_description:form.location_description,
            location_type:form.location_type,
            area_id:selectedArea
          }]);
      }
      setForm({id:null,location_id:'',location_name:'',location_description:'',location_type:''});
      const {data}=await supabase.from('location_master').select('*').eq('area_id',selectedArea);
      setLocations(data||[]);
    }catch(err){
      console.error(err);
      setError('Failed to save location');
    }finally{
      setLoading(false);
    }
  };

  // ✅ Edit
  const handleEdit=(loc)=>{
    setForm({
      id:loc.id,
      location_id:loc.location_id,
      location_name:loc.location_name,
      location_description:loc.location_description,
      location_type:loc.location_type
    });
    setSelectedArea(loc.area_id);
  };

  // ✅ Delete
  const handleDelete=async(id)=>{
    if(!window.confirm('Delete this location?'))return;
    await supabase.from('location_master').delete().eq('id',id);
    const {data}=await supabase.from('location_master').select('*').eq('area_id',selectedArea);
    setLocations(data||[]);
  };

  // ✅ Apply search filter
  const filteredLocations = locations.filter(loc =>
    loc.location_id.toLowerCase().includes(search.toLowerCase()) ||
    loc.location_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Location Master</h2>

      {error && <div className="bg-red-200 text-red-800 p-2 mb-2 rounded">{error}</div>}

      {/* ✅ Dropdowns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <select value={selectedPlant} onChange={e=>setSelectedPlant(e.target.value)} className="border p-2">
          <option value="">Select Plant</option>
          {plants.map(p=><option key={p.plant_id} value={p.plant_id}>{p.plant_name || p.plant_id}</option>)}
        </select>

        <select value={selectedSubplant} onChange={e=>setSelectedSubplant(e.target.value)} className="border p-2">
          <option value="">Select SubPlant</option>
          {subplants.map(sp=><option key={sp.subplant_id} value={sp.subplant_id}>{sp.subplant_name || sp.subplant_id}</option>)}
        </select>

        <select value={selectedDepartment} onChange={e=>setSelectedDepartment(e.target.value)} className="border p-2">
          <option value="">Select Department</option>
          {departments.map(d=><option key={d.department_id} value={d.department_id}>{d.department_name || d.department_id}</option>)}
        </select>

        <select value={selectedArea} onChange={e=>setSelectedArea(e.target.value)} className="border p-2">
          <option value="">Select Area</option>
          {areas.map(a=><option key={a.area_id} value={a.area_id}>{a.area_name || a.area_id}</option>)}
        </select>
      </div>

      {/* ✅ Location Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input placeholder="Location ID" value={form.location_id}
          onChange={e=>setForm({...form,location_id:e.target.value})} className="border p-2"/>
        <input placeholder="Location Name" value={form.location_name}
          onChange={e=>setForm({...form,location_name:e.target.value})} className="border p-2"/>
        <input placeholder="Description" value={form.location_description}
          onChange={e=>setForm({...form,location_description:e.target.value})} className="border p-2"/>
        <select value={form.location_type} onChange={e=>setForm({...form,location_type:e.target.value})} className="border p-2">
          <option value="">Select Type</option>
          <option value="Classified Area">Classified Area</option>
          <option value="Non-Classified Area">Non-Classified Area</option>
          <option value="Cold Storage">Cold Storage</option>
        </select>
      </div>

      <button onClick={handleSave} disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        {form.id?'Update':'Add'} Location
      </button>

      {/* ✅ Search bar */}
      <div className="mt-4 mb-2">
        <input
          placeholder="Search by ID or Name..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          className="border p-2 w-full md:w-1/3"
        />
      </div>

      {/* ✅ Location Table */}
      <table className="w-full mt-2 border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Location ID</th>
            <th className="border p-2">Name</th>
            <th className="border p-2">Description</th>
            <th className="border p-2">Type</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredLocations.map(loc=>(
            <tr key={loc.id}>
              <td className="border p-2">{loc.location_id}</td>
              <td className="border p-2">{loc.location_name}</td>
              <td className="border p-2">{loc.location_description}</td>
              <td className="border p-2">{loc.location_type}</td>
              <td className="border p-2 space-x-2">
                <button onClick={()=>handleEdit(loc)} className="bg-yellow-500 text-white px-2 py-1 rounded">Edit</button>
                <button onClick={()=>handleDelete(loc.id)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
              </td>
            </tr>
          ))}
          {filteredLocations.length===0 && (
            <tr><td colSpan="5" className="text-center p-4 text-gray-500">No locations found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LocationMaster;
