import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../utils/supabaseClient';

const SubPlantManagement = () => {
  const [subplants, setSubplants] = useState([]);
  const [plants, setPlants] = useState([]);
  const [form, setForm] = useState({
    subplant_name: '',
    subplant_id: '',
    description: '',
    plant_uid: '',
    status: 'Active'
  });
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPlants();
    fetchSubplants();
  }, []);

  const fetchPlants = async () => {
    const { data } = await supabase.from('plant_master').select('id, plant_id');
    setPlants(data || []);
  };

  const fetchSubplants = async () => {
    const { data } = await supabase.from('subplant_master').select('*');
    setSubplants(data || []);
  };

  const handleSave = async () => {
    if (editingId) {
      await supabase.from('subplant_master').update(form).eq('id', editingId);
      setEditingId(null);
    } else {
      await supabase.from('subplant_master').insert([form]);
    }
    setForm({ subplant_name: '', subplant_id: '', description: '', plant_uid: '', status: 'Active' });
    fetchSubplants();
  };

  const handleEdit = (row) => {
    setForm(row);
    setEditingId(row.id);
  };

  const handleDelete = async (id) => {
    await supabase.from('subplant_master').delete().eq('id', id);
    fetchSubplants();
  };

  // ✅ Filter logic (only shows matching rows when searching)
  const filteredSubplants = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return subplants.filter(
      (sp) =>
        sp.subplant_name.toLowerCase().includes(term) ||
        sp.subplant_id.toLowerCase().includes(term) ||
        sp.description?.toLowerCase().includes(term) ||
        plants.find((p) => p.id === sp.plant_uid)?.plant_id.toLowerCase().includes(term)
    );
  }, [searchTerm, subplants, plants]);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">SubPlant Management</h2>

      {/* ✅ Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search SubPlants by Name, ID, Description or Plant"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-3 py-2 w-full rounded"
        />
      </div>

      {/* ✅ Add / Edit Form */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <input
          placeholder="SubPlant Name"
          value={form.subplant_name}
          onChange={(e) => setForm({ ...form, subplant_name: e.target.value })}
          className="border p-2"
        />
        <input
          placeholder="SubPlant ID"
          value={form.subplant_id}
          onChange={(e) => setForm({ ...form, subplant_id: e.target.value })}
          className="border p-2"
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border p-2 col-span-2"
        />
        <select
          value={form.plant_uid}
          onChange={(e) => setForm({ ...form, plant_uid: e.target.value })}
          className="border p-2 col-span-2"
        >
          <option value="">Select Plant</option>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>{p.plant_id}</option>
          ))}
        </select>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="border p-2"
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {editingId ? 'Update' : 'Add'}
        </button>
      </div>

      {/* ✅ Conditionally Render Table Only After Search */}
      {searchTerm && (
        <table className="min-w-full border mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">SubPlant Name</th>
              <th className="border p-2">SubPlant ID</th>
              <th className="border p-2">Description</th>
              <th className="border p-2">Plant</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubplants.length > 0 ? (
              filteredSubplants.map((row) => (
                <tr key={row.id}>
                  <td className="border p-2">{row.subplant_name}</td>
                  <td className="border p-2">{row.subplant_id}</td>
                  <td className="border p-2">{row.description}</td>
                  <td className="border p-2">{plants.find((p) => p.id === row.plant_uid)?.plant_id}</td>
                  <td className="border p-2">{row.status}</td>
                  <td className="border p-2 flex gap-2">
                    <button
                      onClick={() => handleEdit(row)}
                      className="bg-yellow-500 text-white px-2 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="bg-red-600 text-white px-2 rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="text-center p-3 text-gray-500">
                  No matching SubPlants found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SubPlantManagement;
