import {useState,useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const AreaMaster = () => {
  const [plants,setPlants] = useState([]);
  const [subplants,setSubplants] = useState([]);
  const [departments,setDepartments] = useState([]);
  const [areas,setAreas] = useState([]);

  const [selectedPlant,setSelectedPlant] = useState(null);
  const [selectedSubplant,setSelectedSubplant] = useState(null);
  const [selectedDept,setSelectedDept] = useState(null);
  const [search,setSearch] = useState('');

  const [form,setForm] = useState({
    id:null,
    area_id:'',
    area_name:'',
    area_description:'',
    area_type:'Classified Area'
  });

  // ✅ Fetch Plants
  useEffect(()=>{
    supabase.from('plant_master').select('id,plant_id').then(({data})=>{
      setPlants(data||[]);
    });
  },[]);

  // ✅ Fetch Subplants when Plant changes
  useEffect(()=>{
    if(!selectedPlant){setSubplants([]);setSelectedSubplant(null);setDepartments([]);setSelectedDept(null);return;}
    supabase
      .from('subplant_master')
      .select('id,subplant_name,subplant_id,plant_uid')
      .eq('plant_uid',selectedPlant)
      .then(({data})=>setSubplants(data||[]));
  },[selectedPlant]);

  // ✅ Fetch Departments when Subplant changes
  useEffect(()=>{
    if(!selectedSubplant){setDepartments([]);setSelectedDept(null);return;}
    supabase
      .from('department_master')
      .select('id,department_name,department_id,subplant_uid')
      .eq('subplant_uid',selectedSubplant)
      .then(({data})=>setDepartments(data||[]));
  },[selectedSubplant]);

  // ✅ Fetch all areas initially
  useEffect(()=>{
    supabase.from('area_master').select('*').then(({data})=>{
      setAreas(data||[]);
    });
  },[]);

  // ✅ Debug
  useEffect(()=>{
    console.log('🔍 selectedDept:', selectedDept);
    console.log('🔍 Area department_uids:', areas.map(a=>a.department_uid));
  },[selectedDept,areas]);

  // ✅ Strict null-safe filter: show nothing until dept selected
  const filteredAreas = selectedDept
    ? areas.filter(a=>
        String(a.department_uid)===String(selectedDept) &&
        (a.area_name?.toLowerCase().includes(search.toLowerCase()) ||
         a.area_id?.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  // ✅ Save Area
  const handleSave = async()=>{
    if(!selectedDept || !form.area_id || !form.area_name){
      alert('Select Department and fill required fields');return;
    }

    if(form.id){
      await supabase.from('area_master')
        .update({
          area_id:form.area_id,
          area_name:form.area_name,
          area_description:form.area_description,
          area_type:form.area_type,
          department_uid:selectedDept
        })
        .eq('id',form.id);
    } else {
      await supabase.from('area_master')
        .insert([{
          area_id:form.area_id,
          area_name:form.area_name,
          area_description:form.area_description,
          area_type:form.area_type,
          department_uid:selectedDept
        }]);
    }

    setForm({id:null,area_id:'',area_name:'',area_description:'',area_type:'Classified Area'});
    const {data} = await supabase.from('area_master').select('*');
    setAreas(data||[]);
  };

  // ✅ Edit and auto-select hierarchy
  const handleEdit = async(area)=>{
    setForm({
      id:area.id,
      area_id:area.area_id,
      area_name:area.area_name,
      area_description:area.area_description,
      area_type:area.area_type
    });
    setSelectedDept(area.department_uid);

    const {data:dept} = await supabase
      .from('department_master')
      .select('id,subplant_uid')
      .eq('id',area.department_uid)
      .single();

    if(dept){
      setSelectedSubplant(dept.subplant_uid);
      const {data:sp} = await supabase
        .from('subplant_master')
        .select('id,plant_uid')
        .eq('id',dept.subplant_uid)
        .single();
      if(sp){
        setSelectedPlant(sp.plant_uid);
      }
    }
  };

  // ✅ Delete
  const handleDelete = async(id)=>{
    if(!window.confirm('Delete this area?')) return;
    await supabase.from('area_master').delete().eq('id',id);
    const {data} = await supabase.from('area_master').select('*');
    setAreas(data||[]);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Area Master</h2>

      {/* 🔹 Plant/Subplant/Department Dropdowns */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <select value={selectedPlant || ''} onChange={e=>setSelectedPlant(e.target.value || null)} className="border p-2 rounded">
          <option value="">Select Plant</option>
          {plants.map(p=><option key={p.id} value={p.id}>{p.plant_id}</option>)}
        </select>

        <select value={selectedSubplant || ''} onChange={e=>setSelectedSubplant(e.target.value || null)} className="border p-2 rounded">
          <option value="">Select SubPlant</option>
          {subplants.map(sp=><option key={sp.id} value={sp.id}>{sp.subplant_name}</option>)}
        </select>

        <select value={selectedDept || ''} onChange={e=>setSelectedDept(e.target.value || null)} className="border p-2 rounded">
          <option value="">Select Department</option>
          {departments.map(d=><option key={d.id} value={d.id}>{d.department_name}</option>)}
        </select>
      </div>

      {/* 🔹 Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by Area ID or Name..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>

      {/* 🔹 Add/Edit Form */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        <input placeholder="Area ID" value={form.area_id} onChange={e=>setForm({...form,area_id:e.target.value})} className="border p-2"/>
        <input placeholder="Area Name" value={form.area_name} onChange={e=>setForm({...form,area_name:e.target.value})} className="border p-2"/>
        <input placeholder="Description" value={form.area_description} onChange={e=>setForm({...form,area_description:e.target.value})} className="border p-2"/>
        <select value={form.area_type} onChange={e=>setForm({...form,area_type:e.target.value})} className="border p-2">
          <option>Classified Area</option>
          <option>Non-Classified Area</option>
          <option>Cold Storage</option>
        </select>
        <button onClick={handleSave} className="bg-blue-600 text-white px-4 rounded">{form.id?'Update':'Add'}</button>
      </div>

      {/* 🔹 Area Table */}
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Area ID</th>
            <th className="border p-2">Name</th>
            <th className="border p-2">Description</th>
            <th className="border p-2">Type</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAreas.map(a=>(
            <tr key={a.id}>
              <td className="border p-2">{a.area_id}</td>
              <td className="border p-2">{a.area_name}</td>
              <td className="border p-2">{a.area_description}</td>
              <td className="border p-2">{a.area_type}</td>
              <td className="border p-2 flex gap-2">
                <button onClick={()=>handleEdit(a)} className="bg-yellow-400 px-2 rounded">Edit</button>
                <button onClick={()=>handleDelete(a.id)} className="bg-red-500 text-white px-2 rounded">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AreaMaster;
