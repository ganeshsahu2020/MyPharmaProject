import React,{useEffect,useState,useMemo} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {useAuth} from '../../../contexts/AuthContext';

const UserManagement = () => {
  const {session} = useAuth();
  const [users,setUsers] = useState([]);
  const [plants,setPlants] = useState([]);
  const [subplants,setSubplants] = useState([]);
  const [departments,setDepartments] = useState([]);
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState('');
  const [currentUserRole,setCurrentUserRole] = useState([]);

  const [formData,setFormData] = useState({
    id:null,
    plantid:'',
    subplant_uid:'',
    subplant_id:'',
    department_uid:'',
    department_id:'',
    email:'',
    employee_id:'',
    first_name:'',
    last_name:'',
    role:'',
    status:'Active'
  });

  const [editingUser,setEditingUser] = useState(null);

  // ✅ Fetch Current User Role
  useEffect(()=>{
    const fetchRole = async () => {
      if(!session?.user?.email) return;
      const {data} = await supabase
        .from('user_management')
        .select('role')
        .eq('email',session.user.email)
        .single();
      if(data?.role) setCurrentUserRole(Array.isArray(data.role)?data.role:[data.role]);
    };
    fetchRole();
  },[session]);

  // ✅ Fetch Users with plant/subplant/department join
  const fetchUsers = async () => {
    const {data,error} = await supabase
      .from('user_management')
      .select(`
        id,email,employee_id,first_name,last_name,role,status,plantid,subplant_uid,department_uid,
        plant_master(plant_id),
        subplant_master(subplant_name,subplant_id),
        department_master(department_name,department_id)
      `)
      .order('created_at',{ascending:true});
    if(!error) setUsers(data || []);
    setLoading(false);
  };

  // ✅ Fetch Plants
  const fetchPlants = async () => {
    const {data} = await supabase.from('plant_master').select('id,plant_id');
    setPlants(data || []);
  };

  // ✅ Fetch Subplants for selected plant
  const fetchSubplants = async (plantid) => {
    if(!plantid) return setSubplants([]);
    const {data} = await supabase
      .from('subplant_master')
      .select('id,subplant_id,subplant_name')
      .eq('plant_uid',plantid);
    setSubplants(data || []);
  };

  // ✅ Fetch Departments for selected SubPlant
  const fetchDepartments = async (subplantUid) => {
    if(!subplantUid) return setDepartments([]);
    const {data} = await supabase
      .from('department_master')
      .select('id,department_id,department_name,subplant_uid')
      .eq('subplant_uid',subplantUid)
      .eq('status','Active')
      .order('department_id');
    setDepartments(data || []);
  };

  useEffect(()=>{fetchUsers();fetchPlants();},[]);

  // ✅ Plant Change
  const handlePlantChange = (e) => {
    const selected = e.target.value;
    setFormData({...formData,plantid:selected,subplant_uid:'',subplant_id:'',department_uid:'',department_id:''});
    fetchSubplants(selected);
    setDepartments([]); // reset departments
  };

  // ✅ SubPlant Change
  const handleSubPlantChange = (e) => {
    const selected = subplants.find(s=>s.id===e.target.value);
    const uid = selected?.id || '';
    setFormData({
      ...formData,
      subplant_uid:uid,
      subplant_id:selected?.subplant_id || '',
      department_uid:'',
      department_id:''
    });
    fetchDepartments(uid);
  };

  // ✅ Department Change
  const handleDepartmentChange = (e) => {
    const selected = departments.find(d=>d.id===e.target.value);
    setFormData({
      ...formData,
      department_uid:selected?.id || '',
      department_id:selected?.department_id || ''
    });
  };

  // ✅ Search filter
  const filteredUsers = useMemo(()=>{
    if(!search.trim()) return [];
    const term = search.toLowerCase();
    return users.filter(u=>
      u.employee_id?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term) ||
      u.first_name?.toLowerCase().includes(term) ||
      u.last_name?.toLowerCase().includes(term)
    );
  },[search,users]);

  const handleChange = (e) => {
    setFormData({...formData,[e.target.name]:e.target.value});
  };

  const canEdit = currentUserRole.includes('Super Admin') || currentUserRole.includes('Admin');

  // ✅ Save User
  const handleSaveUser = async (e) => {
    e.preventDefault();
    const payload = {...formData,role:[formData.role]};
    if(!editingUser) delete payload.id;

    let query = editingUser
      ? supabase.from('user_management').update(payload).eq('id',editingUser).select()
      : supabase.from('user_management').insert([payload]).select();

    const {data,error} = await query;
    if(error) return alert(`Error saving user: ${error.message}`);

    if(data){
      fetchUsers();
      setFormData({
        id:null,plantid:'',subplant_uid:'',subplant_id:'',department_uid:'',department_id:'',
        email:'',employee_id:'',first_name:'',last_name:'',role:'',status:'Active'
      });
      setEditingUser(null);
    }
  };

  const handleEdit = (user) => {
    setFormData({
      id:user.id,
      plantid:user.plantid || '',
      subplant_uid:user.subplant_uid || '',
      subplant_id:user.subplant_master?.subplant_id || '',
      department_uid:user.department_uid || '',
      department_id:user.department_master?.department_id || '',
      email:user.email,
      employee_id:user.employee_id,
      first_name:user.first_name,
      last_name:user.last_name,
      role:Array.isArray(user.role)?user.role[0]:user.role,
      status:user.status
    });
    setEditingUser(user.id);
    if(user.subplant_uid) fetchDepartments(user.subplant_uid);
  };

  const handleDelete = async (id) => {
    await supabase.from('user_management').delete().eq('id',id);
    setUsers(users.filter(u=>u.id!==id));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-blue-700">User Management</h2>

      {/* 🔍 Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by Employee ID, Name or Email"
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          className="border px-3 py-2 w-full rounded"
        />
      </div>

      {/* ➕ Add/Edit Form */}
      {canEdit && (
        <form onSubmit={handleSaveUser} className="bg-white p-4 rounded-lg shadow space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* ✅ Plant Dropdown */}
            <select
              name="plantid"
              value={formData.plantid}
              onChange={handlePlantChange}
              className="border rounded px-3 py-2 col-span-2"
              required
            >
              <option value="">Select Plant</option>
              {plants.map((p)=>(
                <option key={p.id} value={p.id}>{p.plant_id}</option>
              ))}
            </select>

            {/* ✅ SubPlant Dropdown */}
            <select
              name="subplant_uid"
              value={formData.subplant_uid}
              onChange={handleSubPlantChange}
              className="border rounded px-3 py-2 col-span-2"
              disabled={!formData.plantid}
              required
            >
              <option value="">Select SubPlant</option>
              {subplants.map((s)=>(
                <option key={s.id} value={s.id}>{s.subplant_name} ({s.subplant_id})</option>
              ))}
            </select>

            {/* ✅ Department Dropdown */}
            <select
              name="department_uid"
              value={formData.department_uid}
              onChange={handleDepartmentChange}
              className="border rounded px-3 py-2 col-span-2"
              disabled={!formData.subplant_uid}
              required
            >
              <option value="">Select Department</option>
              {departments.map((d)=>(
                <option key={d.id} value={d.id}>{d.department_name} ({d.department_id})</option>
              ))}
            </select>

            <input type="text" name="first_name" placeholder="First Name" value={formData.first_name} onChange={handleChange} className="border rounded px-3 py-2" required />
            <input type="text" name="last_name" placeholder="Last Name" value={formData.last_name} onChange={handleChange} className="border rounded px-3 py-2" required />
            <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} className="border rounded px-3 py-2 col-span-2" required />
            <input type="text" name="employee_id" placeholder="Employee ID" value={formData.employee_id} onChange={handleChange} className="border rounded px-3 py-2" required />

            <select name="role" value={formData.role} onChange={handleChange} className="border rounded px-3 py-2" required>
              <option value="">Select Role</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Operator">Operator</option>
              <option value="QA">QA</option>
              <option value="Engineering">Engineering</option>
            </select>

            <select name="status" value={formData.status} onChange={handleChange} className="border rounded px-3 py-2">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            {editingUser?'Update User':'Add User'}
          </button>
        </form>
      )}

      {/* 📋 Search Results Table */}
      {search && (
        <div className="bg-white rounded-lg shadow p-4 mt-4">
          {loading ? (
            <p className="text-gray-500">Loading users...</p>
          ) : filteredUsers.length===0 ? (
            <p className="text-gray-500">No matching users found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2">Plant</th>
                  <th className="p-2">SubPlant</th>
                  <th className="p-2">Department</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Employee ID</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Status</th>
                  {canEdit && <th className="p-2 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u)=>(
                  <tr key={u.id} className="border-t">
                    <td className="p-2">{u.plant_master?.plant_id || '—'}</td>
                    <td className="p-2">{u.subplant_master?.subplant_name || '—'}</td>
                    <td className="p-2">{u.department_master?.department_name || '—'}</td>
                    <td className="p-2">{u.first_name} {u.last_name}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.employee_id}</td>
                    <td className="p-2">{Array.isArray(u.role)?u.role.join(', '):u.role}</td>
                    <td className="p-2">{u.status}</td>
                    {canEdit && (
                      <td className="p-2 text-center space-x-2">
                        <button onClick={()=>handleEdit(u)} className="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600">Edit</button>
                        <button onClick={()=>handleDelete(u.id)} className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default UserManagement;
