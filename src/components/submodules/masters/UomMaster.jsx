import {useState,useEffect} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const UomMaster = () => {
  const [plants,setPlants]=useState([]);
  const [uoms,setUoms]=useState([]);
  const [selectedPlant,setSelectedPlant]=useState('');
  const [form,setForm]=useState({
    id:null,
    uom_code:'',
    uom_name:'',
    uom:'',
    numerator_value:'',
    denominator_value:'',
    status:'Active'
  });
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');

  // ✅ Fetch Plants
  useEffect(()=>{
    const fetchPlants=async()=>{
      const {data}=await supabase.from('plant_master').select('id,plant_id');
      setPlants(data||[]);
    };
    fetchPlants();
  },[]);

  // ✅ Fetch UOM
  useEffect(()=>{
    const fetchUoms=async()=>{
      const query=supabase.from('uom_master').select('*').order('uom_code');
      if(selectedPlant) query.eq('plant_uid',selectedPlant);
      const {data}=await query;
      setUoms(data||[]);
    };
    fetchUoms();
  },[selectedPlant]);

  // ✅ Save UOM
  const handleSave=async()=>{
    if(!form.uom_code || !form.uom_name || !selectedPlant){
      setError('UOM Code, Name and Plant are required');
      return;
    }
    if(form.id){
      await supabase.from('uom_master')
        .update({
          uom_code:form.uom_code,
          uom_name:form.uom_name,
          uom:form.uom,
          numerator_value:form.numerator_value,
          denominator_value:form.denominator_value,
          plant_uid:selectedPlant,
          status:form.status
        }).eq('id',form.id);
    }else{
      await supabase.from('uom_master')
        .insert([{
          uom_code:form.uom_code,
          uom_name:form.uom_name,
          uom:form.uom,
          numerator_value:form.numerator_value,
          denominator_value:form.denominator_value,
          plant_uid:selectedPlant,
          status:form.status
        }]);
    }
    setForm({id:null,uom_code:'',uom_name:'',uom:'',numerator_value:'',denominator_value:'',status:'Active'});
    const {data}=await supabase.from('uom_master').select('*').order('uom_code');
    setUoms(data||[]);
  };

  const handleEdit=(row)=>{
    setForm(row);
    setSelectedPlant(row.plant_uid);
  };

  const handleDelete=async(id)=>{
    if(!window.confirm('Delete this UOM?'))return;
    await supabase.from('uom_master').delete().eq('id',id);
    const {data}=await supabase.from('uom_master').select('*').order('uom_code');
    setUoms(data||[]);
  };

  const filtered = uoms.filter(u =>
    u.uom_code.toLowerCase().includes(search.toLowerCase()) ||
    u.uom_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">UOM Master</h2>
      {error && <div className="bg-red-200 text-red-800 p-2 mb-2">{error}</div>}

      {/* Plant Dropdown */}
      <div className="mb-4 flex flex-col md:flex-row gap-4">
        <div className="flex flex-col w-full md:w-1/3">
          <label className="text-sm font-medium text-gray-700 mb-1">Plant</label>
          <select value={selectedPlant} onChange={e=>setSelectedPlant(e.target.value)} className="border p-2 rounded">
            <option value="">Select Plant</option>
            {plants.map(p=><option key={p.id} value={p.id}>{p.plant_id}</option>)}
          </select>
        </div>
      </div>

      {/* UOM Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">UOM Code</label>
          <input value={form.uom_code} onChange={e=>setForm({...form,uom_code:e.target.value})} className="border p-2 rounded"/>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">UOM Name</label>
          <input value={form.uom_name} onChange={e=>setForm({...form,uom_name:e.target.value})} className="border p-2 rounded"/>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Symbol</label>
          <input value={form.uom} onChange={e=>setForm({...form,uom:e.target.value})} className="border p-2 rounded"/>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Numerator</label>
          <input type="number" value={form.numerator_value} onChange={e=>setForm({...form,numerator_value:e.target.value})} className="border p-2 rounded"/>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Denominator</label>
          <input type="number" value={form.denominator_value} onChange={e=>setForm({...form,denominator_value:e.target.value})} className="border p-2 rounded"/>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Status</label>
          <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="border p-2 rounded">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">{form.id?'Update':'Add'} UOM</button>

      <div className="mt-4 mb-2">
        <input placeholder="Search by Code or Name" value={search} onChange={e=>setSearch(e.target.value)} className="border p-2 w-full md:w-1/3 rounded"/>
      </div>

      {/* Table */}
      <table className="w-full border mt-2">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">UOM Code</th>
            <th className="border p-2">Name</th>
            <th className="border p-2">Symbol</th>
            <th className="border p-2">Numerator</th>
            <th className="border p-2">Denominator</th>
            <th className="border p-2">Plant</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u=>(
            <tr key={u.id}>
              <td className="border p-2">{u.uom_code}</td>
              <td className="border p-2">{u.uom_name}</td>
              <td className="border p-2">{u.uom}</td>
              <td className="border p-2">{u.numerator_value}</td>
              <td className="border p-2">{u.denominator_value}</td>
              <td className="border p-2">{plants.find(p=>p.id===u.plant_uid)?.plant_id || u.plant_uid}</td>
              <td className="border p-2">{u.status}</td>
              <td className="border p-2 space-x-2">
                <button onClick={()=>handleEdit(u)} className="bg-yellow-500 text-white px-2 py-1 rounded">Edit</button>
                <button onClick={()=>handleDelete(u.id)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length===0 && <tr><td colSpan="8" className="text-center p-4">No UOM found</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default UomMaster;
