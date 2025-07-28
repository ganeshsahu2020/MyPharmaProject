import {useEffect,useState,useMemo} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const DepartmentMaster = () => {
  const [departments,setDepartments] = useState([]);
  const [subplants,setSubplants] = useState([]);
  const [search,setSearch] = useState('');
  const [form,setForm] = useState({id:null,department_id:'',department_name:'',subplant_uid:'',subplant_id:'',status:'Active'});
  const [editing,setEditing] = useState(false);

  // ✅ Fetch departments
  const fetchDepartments = async () => {
    const {data,error} = await supabase.from('department_master').select('*').order('department_id');
    if(!error) setDepartments(data);
  };

  // ✅ Fetch subplants for dropdown
  const fetchSubplants = async () => {
    const {data,error} = await supabase.from('subplant_master').select('id,subplant_id');
    if(!error) setSubplants(data);
  };

  useEffect(()=>{fetchDepartments();fetchSubplants();},[]);

  // ✅ Filtered search results
  const filtered = useMemo(()=>{
    if(!search.trim()) return [];
    const term = search.toLowerCase();
    return departments.filter(d=>
      d.department_name.toLowerCase().includes(term) ||
      d.department_id.toLowerCase().includes(term) ||
      d.subplant_id.toLowerCase().includes(term)
    );
  },[search,departments]);

  // ✅ Save new or updated department
  const handleSave = async () => {
    if(editing){
      await supabase.from('department_master').update({
        department_id:form.department_id,
        department_name:form.department_name,
        subplant_uid:form.subplant_uid,
        subplant_id:form.subplant_id,
        status:form.status
      }).eq('id',form.id);
    } else {
      const insert = {...form};
      delete insert.id;
      await supabase.from('department_master').insert([insert]);
    }
    fetchDepartments();
    setForm({id:null,department_id:'',department_name:'',subplant_uid:'',subplant_id:'',status:'Active'});
    setEditing(false);
  };

  // ✅ Edit handler
  const handleEdit = (d) => {
    setForm(d);
    setEditing(true);
  };

  // ✅ Delete handler
  const handleDelete = async (id) => {
    await supabase.from('department_master').delete().eq('id',id);
    fetchDepartments();
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-blue-700">Department Master</h2>

      {/* 🔍 Search */}
      <input 
        type="text" 
        placeholder="Search Department / ID / SubPlant" 
        value={search} 
        onChange={(e)=>setSearch(e.target.value)} 
        className="border p-2 mb-4 w-full rounded"
      />

      {/* ➕ Add / Edit Form */}
      <div className="grid grid-cols-2 gap-4 mb-4 bg-gray-50 p-4 rounded">
        <input 
          placeholder="Department ID" 
          value={form.department_id} 
          onChange={(e)=>setForm({...form,department_id:e.target.value})} 
          className="border p-2"
        />
        <input 
          placeholder="Department Name" 
          value={form.department_name} 
          onChange={(e)=>setForm({...form,department_name:e.target.value})} 
          className="border p-2"
        />
        <select 
          value={form.subplant_uid} 
          onChange={(e)=>{
            const selected = subplants.find(s=>s.id===e.target.value);
            setForm({...form,subplant_uid:e.target.value,subplant_id:selected?.subplant_id || ''});
          }} 
          className="border p-2 col-span-2"
        >
          <option value="">Select SubPlant</option>
          {subplants.map(s=><option key={s.id} value={s.id}>{s.subplant_id}</option>)}
        </select>
        <select 
          value={form.status} 
          onChange={(e)=>setForm({...form,status:e.target.value})} 
          className="border p-2"
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button 
          onClick={handleSave} 
          className="bg-blue-600 text-white p-2 rounded"
        >
          {editing?'Update':'Add'} Department
        </button>
        {editing && (
          <button 
            onClick={()=>{setForm({id:null,department_id:'',department_name:'',subplant_uid:'',subplant_id:'',status:'Active'});setEditing(false);}} 
            className="bg-gray-400 text-white p-2 rounded"
          >
            Cancel
          </button>
        )}
      </div>

      {/* 📋 Table – Shows only when search term entered */}
      {search && (
        <table className="w-full border rounded">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border">Dept ID</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">SubPlant</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length>0 ? filtered.map(d=>(
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="p-2 border">{d.department_id}</td>
                <td className="p-2 border">{d.department_name}</td>
                <td className="p-2 border">{d.subplant_id}</td>
                <td className="p-2 border">{d.status}</td>
                <td className="p-2 border">
                  <button onClick={()=>handleEdit(d)} className="bg-yellow-500 text-white px-2 py-1 mr-2 rounded">Edit</button>
                  <button onClick={()=>handleDelete(d.id)} className="bg-red-600 text-white px-2 py-1 rounded">Delete</button>
                </td>
              </tr>
            )):<tr><td colSpan="5" className="p-2 text-center">No Departments Found</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DepartmentMaster;
