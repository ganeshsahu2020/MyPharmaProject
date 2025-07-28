import React, { useEffect, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";

const PlantMaster = () => {
  const [plants, setPlants] = useState([]);
  const [formData, setFormData] = useState({
    id: null,
    plant_id: "",
    description: "",
    status: "Active"
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlants();
  }, []);

  // ✅ Fetch all plants
  const fetchPlants = async () => {
    const { data, error } = await supabase.from("plant_master").select("*").order("created_at", { ascending: false });
    if (error) console.error("❌ Fetch error:", error);
    else setPlants(data);
  };

  // ✅ Handle form field changes
  const handleChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
  };

  // ✅ Add or Update plant
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (formData.id) {
      // ✅ Update existing plant
      const { error } = await supabase.from("plant_master")
        .update({
          plant_id: formData.plant_id,
          description: formData.description,
          status: formData.status
        })
        .eq("id", formData.id);

      if (error) console.error("❌ Update error:", error);
    } else {
      // ✅ Insert new plant
      const { error } = await supabase.from("plant_master")
        .insert([{
          plant_id: formData.plant_id,
          description: formData.description,
          status: formData.status
        }]);

      if (error) console.error("❌ Insert error:", error);
    }

    setFormData({ id: null, plant_id: "", description: "", status: "Active" });
    fetchPlants();
    setLoading(false);
  };

  // ✅ Edit button
  const handleEdit = (plant) => {
    setFormData({
      id: plant.id,
      plant_id: plant.plant_id,
      description: plant.description,
      status: plant.status
    });
  };

  // ✅ Delete button
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this plant?")) return;
    const { error } = await supabase.from("plant_master").delete().eq("id", id);
    if (error) console.error("❌ Delete error:", error);
    fetchPlants();
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Plant Master</h2>

      {/* ✅ Add / Edit Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow p-4 rounded mb-6">
        <div className="grid grid-cols-3 gap-4">
          <input
            type="text"
            name="plant_id"
            value={formData.plant_id}
            onChange={handleChange}
            placeholder="Plant ID"
            className="border p-2 rounded"
            required
          />
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Description"
            className="border p-2 rounded"
            required
          />
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {formData.id ? "Update Plant" : "Add Plant"}
        </button>
      </form>

      {/* ✅ Plant Table */}
      <table className="w-full border">
        <thead className="bg-gray-200">
          <tr>
            <th className="border p-2">Plant ID</th>
            <th className="border p-2">Description</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {plants.map((plant) => (
            <tr key={plant.id}>
              <td className="border p-2">{plant.plant_id}</td>
              <td className="border p-2">{plant.description}</td>
              <td className="border p-2">{plant.status}</td>
              <td className="border p-2 space-x-2">
                <button
                  onClick={() => handleEdit(plant)}
                  className="bg-yellow-400 px-3 py-1 rounded hover:bg-yellow-500"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(plant.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {plants.length === 0 && (
            <tr>
              <td colSpan="4" className="text-center p-4 text-gray-500">No plants found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PlantMaster;
