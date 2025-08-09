// ✅ File: src/components/submodules/UserAuthorization/RoleManagement.jsx
import React,{useEffect,useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import toast from 'react-hot-toast';

const RoleManagement = () => {
  const [employees,setEmployees] = useState([]);
  const [modules,setModules] = useState([]);
  const [search,setSearch] = useState('');
  const [debouncedSearch,setDebouncedSearch] = useState('');
  const [showDropdown,setShowDropdown] = useState(true);
  const [selectedEmployee,setSelectedEmployee] = useState(null);
  const [expandedModules,setExpandedModules] = useState({});
  const [loading,setLoading] = useState(false);

  const [form,setForm] = useState({
    employee_id:'',
    role:[],
    designation:[],
    permissions:{}
  });

  const rightsOptions = ['View','Edit','Update','Delete'];
  const designationOptions = ['Doer','Checker','Approver'];

  // ✅ Fetch employees + modules via RPC
  useEffect(()=>{
    const fetchData = async()=>{
      try {
        const {data:users,error:uErr} = await supabase
          .from('user_management')
          .select('employee_id,first_name,last_name,email');
        if(uErr) throw uErr;

        const {data:mods,error:mErr} = await supabase
          .rpc('get_modules_with_submodules');
        if(mErr) throw mErr;

        setEmployees(users||[]);
        setModules(Array.isArray(mods) ? mods : (mods ?? []));
      } catch(err) {
        console.error('❌ Error fetching data:', err.message);
        toast.error('Failed to load role management data');
      }
    };
    fetchData();
  },[]);

  // ✅ Debounce search
  useEffect(()=>{
    const handler=setTimeout(()=>setDebouncedSearch(search),300);
    return()=>clearTimeout(handler);
  },[search]);

  // ✅ Load role data when employee selected
  useEffect(()=>{
    const loadRoleData=async()=>{
      if(!selectedEmployee)return;
      const {data} = await supabase
        .from('role_management')
        .select('*')
        .eq('employee_id',selectedEmployee.employee_id)
        .single();
      let rightsData={};
      if(data?.rights){
        try{
          rightsData = typeof data.rights==='string' ? JSON.parse(data.rights) : data.rights;
        }catch{rightsData={};}
      }
      setForm({
        employee_id:selectedEmployee.employee_id,
        role:data?.role||[],
        designation:data?.designation||[],
        permissions:rightsData
      });
    };
    loadRoleData();
  },[selectedEmployee]);

  const toggleArrayValue=(field,value)=>{
    setForm(prev=>({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v=>v!==value)
        : [...prev[field],value]
    }));
  };

  const togglePermission=(code,right)=>{
    setForm(prev=>{
      const current=prev.permissions[code]||[];
      const updated=current.includes(right)
        ? current.filter(r=>r!==right)
        : [...current,right];
      return{...prev,permissions:{...prev.permissions,[code]:updated}};
    });
  };

  const handleSave=async()=>{
    if(!form.employee_id){
      toast.error('Select an employee before saving');
      return;
    }
    setLoading(true);
    await toast.promise(
      supabase.from('role_management').upsert({
        employee_id:form.employee_id,
        role:form.role,
        designation:form.designation,
        module_rights:Object.keys(form.permissions),
        rights:form.permissions
      },{onConflict:['employee_id']}),
      {
        loading: 'Saving role management...',
        success: '✅ Roles and permissions saved!',
        error: '❌ Failed to save roles'
      }
    );
    setLoading(false);
  };

  const filteredEmployees = employees.filter(emp =>
    `${emp.employee_id} ${emp.first_name} ${emp.last_name} ${emp.email}`
      .toLowerCase()
      .includes(debouncedSearch.toLowerCase())
  );

  const handleSelectEmployee=(emp)=>{
    setSelectedEmployee(emp);
    toast.success(`Employee ${emp.employee_id} loaded`);
    setSearch('');
    setDebouncedSearch('');
    setShowDropdown(false);
  };

  const clearSelection=()=>{
    setSelectedEmployee(null);
    setForm({employee_id:'',role:[],designation:[],permissions:{}});
    setShowDropdown(true);
    toast('Employee selection cleared', {icon:'ℹ️'});
  };

  const toggleModuleExpand=(moduleId)=>{
    setExpandedModules(prev=>({...prev,[moduleId]:!prev[moduleId]}));
  };

  return (
    <div className="p-3 max-w-6xl mx-auto">
      <h2 className="text-lg font-bold mb-3">Role Management</h2>

      {!selectedEmployee && (
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium">Search Employee</label>
          <input
            type="text"
            placeholder="Search by Employee ID, Name or Email"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            className="w-full border p-1 rounded text-sm"
          />
          {showDropdown && debouncedSearch && (
            <div className="border rounded max-h-40 overflow-y-auto bg-white shadow mt-1 text-sm">
              {filteredEmployees.map(emp=>(
                <div
                  key={emp.employee_id}
                  onClick={()=>handleSelectEmployee(emp)}
                  className="p-1 cursor-pointer hover:bg-gray-100"
                >
                  {emp.employee_id} - {emp.first_name} {emp.last_name} ({emp.email})
                </div>
              ))}
              {filteredEmployees.length===0 && (
                <div className="p-1 text-gray-500">No matching employees</div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedEmployee && (
        <div className="p-3 border rounded bg-gray-50 text-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">
              {selectedEmployee.employee_id} - {selectedEmployee.first_name} {selectedEmployee.last_name} ({selectedEmployee.email})
            </h3>
            <button onClick={clearSelection} className="bg-red-500 text-white px-2 py-0.5 rounded text-xs">Clear</button>
          </div>

          <label className="block mb-1 font-medium">Role</label>
          <div className="flex flex-wrap gap-3 mb-3">
            {['Super Admin','Admin','Manager','Supervisor','Operator','QA','Engineering'].map(r=>(
              <label key={r} className="flex items-center gap-1">
                <input type="checkbox" checked={form.role.includes(r)} onChange={()=>toggleArrayValue('role',r)} />
                {r}
              </label>
            ))}
          </div>

          <label className="block mb-1 font-medium">Designation</label>
          <div className="flex flex-wrap gap-3 mb-3">
            {designationOptions.map(d=>(
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" checked={form.designation.includes(d)} onChange={()=>toggleArrayValue('designation',d)} />
                {d}
              </label>
            ))}
          </div>

          {/* ✅ Modules + Submodules from RPC */}
          <div className="border rounded p-2 h-64 overflow-y-scroll mb-3 bg-white">
            {modules.map(module=>(
              <div key={module.module_id} className="mb-2">
                <button
                  type="button"
                  onClick={()=>toggleModuleExpand(module.module_id)}
                  className="w-full text-left font-bold text-blue-600 text-sm"
                >
                  {expandedModules[module.module_id] ? '▼' : '▶'} {module.module_name}
                </button>
                {expandedModules[module.module_id] && module.submodules.map(sm=>(
                  <div key={sm.submodule_id} className="ml-3 mb-1">
                    <div className="font-medium text-xs">{sm.submodule_name}</div>
                    <div className="flex gap-3 ml-3 mt-1">
                      {rightsOptions.map(rt=>(
                        <label key={rt} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={form.permissions[sm.submodule_id]?.includes(rt) || false}
                            onChange={()=>togglePermission(sm.submodule_id,rt)}
                          />
                          {rt}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className={`bg-green-600 text-white px-3 py-1 rounded text-sm ${loading?'opacity-50 cursor-not-allowed':''}`}
          >
            {loading ? 'Saving...' : 'Save Role Management'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
