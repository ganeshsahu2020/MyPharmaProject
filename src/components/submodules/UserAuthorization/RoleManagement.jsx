import React, { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';

const RoleManagement = () => {
  const [employees, setEmployees] = useState([]);
  const [modules, setModules] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [expandedModules, setExpandedModules] = useState({}); // ✅ Track collapsible modules

  const [form, setForm] = useState({
    employee_id: '',
    role: [],
    designation: [],
    permissions: {}
  });

  const rightsOptions = ['View', 'Edit', 'Update', 'Delete'];
  const designationOptions = ['Doer', 'Checker', 'Approver'];

  // ✅ Fetch employees and modules
  useEffect(() => {
    const fetchData = async () => {
      const { data: users } = await supabase
        .from('user_management')
        .select('employee_id, first_name, last_name, email');

      const { data: mods } = await supabase
        .from('modules')
        .select('id, module, submodule, code')
        .order('module', { ascending: true });

      setEmployees(users || []);
      setModules(mods || []);
    };
    fetchData();
  }, []);

  // ✅ Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(handler);
  }, [search]);

  // ✅ Load role data when selecting employee
  useEffect(() => {
    const loadRoleData = async () => {
      if (!selectedEmployee) return;
      const { data } = await supabase
        .from('role_management')
        .select('*')
        .eq('employee_id', selectedEmployee.employee_id)
        .single();

      let rightsData = {};
      if (data?.rights) {
        try {
          rightsData =
            typeof data.rights === 'string'
              ? JSON.parse(data.rights)
              : data.rights;
        } catch {
          rightsData = {};
        }
      }

      setForm({
        employee_id: selectedEmployee.employee_id,
        role: data?.role || [],
        designation: data?.designation || [],
        permissions: rightsData
      });
    };
    loadRoleData();
  }, [selectedEmployee]);

  const toggleArrayValue = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  const togglePermission = (code, right) => {
    setForm(prev => {
      const current = prev.permissions[code] || [];
      const updated = current.includes(right)
        ? current.filter(r => r !== right)
        : [...current, right];
      return {
        ...prev,
        permissions: { ...prev.permissions, [code]: updated }
      };
    });
  };

  const handleSave = async () => {
    if (!form.employee_id) {
      alert('Please select an employee');
      return;
    }

    const { error } = await supabase.from('role_management').upsert(
      {
        employee_id: form.employee_id,
        role: form.role,
        designation: form.designation,
        module_rights: Object.keys(form.permissions),
        rights: form.permissions
      },
      { onConflict: ['employee_id'] }
    );

    if (error) {
      console.error('❌ Save error:', error);
      alert('Error saving role management');
    } else {
      alert('✅ Role Management Saved');
    }
  };

  const filteredEmployees = employees.filter(emp =>
    `${emp.employee_id} ${emp.first_name} ${emp.last_name} ${emp.email}`
      .toLowerCase()
      .includes(debouncedSearch.toLowerCase())
  );

  const handleSelectEmployee = emp => {
    setSelectedEmployee(emp);
    setSearch('');
    setDebouncedSearch('');
    setShowDropdown(false);
  };

  const clearSelection = () => {
    setSelectedEmployee(null);
    setForm({
      employee_id: '',
      role: [],
      designation: [],
      permissions: {}
    });
    setShowDropdown(true);
  };

  // ✅ Group submodules by module
  const groupedModules = modules.reduce((acc, mod) => {
    if (!acc[mod.module]) acc[mod.module] = [];
    acc[mod.module].push(mod);
    return acc;
  }, {});

  const toggleModuleExpand = moduleName => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleName]: !prev[moduleName]
    }));
  };

  return (
    <div className="p-6 bg-white rounded shadow space-y-6">
      <h2 className="text-xl font-bold">Role Management</h2>

      {/* ✅ Debounced Searchable Dropdown */}
      {!selectedEmployee && (
        <>
          <label className="block mb-2 font-medium">Search Employee</label>
          <input
            type="text"
            placeholder="Search by Employee ID, Name or Email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border p-2 rounded mb-2"
          />

          {showDropdown && debouncedSearch && (
            <div className="border rounded max-h-40 overflow-y-auto bg-white shadow mb-4">
              {filteredEmployees.map(emp => (
                <div
                  key={emp.employee_id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="p-2 cursor-pointer hover:bg-gray-100"
                >
                  {emp.employee_id} - {emp.first_name} {emp.last_name} ({emp.email})
                </div>
              ))}
              {filteredEmployees.length === 0 && (
                <div className="p-2 text-gray-500">No matching employees</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ✅ Selected Employee Card */}
      {selectedEmployee && (
        <div className="p-4 border rounded bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">
              Selected: {selectedEmployee.employee_id} -{' '}
              {selectedEmployee.first_name} {selectedEmployee.last_name} (
              {selectedEmployee.email})
            </h3>
            <button
              onClick={clearSelection}
              className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
            >
              Clear Selection
            </button>
          </div>

          {/* ✅ Roles */}
          <label className="block mb-2 font-medium">Role</label>
          <div className="flex flex-wrap gap-3 mb-4">
            {['Super Admin', 'Admin', 'Manager', 'Supervisor', 'Operator', 'QA', 'Engineering'].map(r => (
              <label key={r} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.role.includes(r)}
                  onChange={() => toggleArrayValue('role', r)}
                />
                {r}
              </label>
            ))}
          </div>

          {/* ✅ Designations */}
          <label className="block mb-2 font-medium">Designation</label>
          <div className="flex flex-wrap gap-3 mb-4">
            {designationOptions.map(d => (
              <label key={d} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.designation.includes(d)}
                  onChange={() => toggleArrayValue('designation', d)}
                />
                {d}
              </label>
            ))}
          </div>

          {/* ✅ Collapsible Modules & Rights */}
          <div className="border rounded p-3 h-72 overflow-y-scroll mb-4">
            {Object.keys(groupedModules).map(moduleName => (
              <div key={moduleName} className="mb-3 border-b pb-2">
                <button
                  type="button"
                  onClick={() => toggleModuleExpand(moduleName)}
                  className="w-full text-left font-bold text-blue-600 mb-2"
                >
                  {expandedModules[moduleName] ? '▼' : '▶'} {moduleName}
                </button>

                {expandedModules[moduleName] &&
                  groupedModules[moduleName].map(m => (
                    <div key={m.code} className="ml-4 mb-2">
                      <div className="font-medium text-sm">{m.submodule}</div>
                      <div className="flex gap-4 ml-4 mt-1">
                        {rightsOptions.map(rt => (
                          <label key={rt} className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={form.permissions[m.code]?.includes(rt) || false}
                              onChange={() => togglePermission(m.code, rt)}
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
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Save Role Management
          </button>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
