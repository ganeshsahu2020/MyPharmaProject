import React, { useEffect, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import toast from "react-hot-toast";
import { Box, Pencil, Save, RefreshCw, Search } from "lucide-react";
import Select from "react-select";

const MonthlyCalibrationMaster = () => {
  const [balances, setBalances] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedBalance, setSelectedBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch balances from Supabase view
  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vw_balance_monthly_calibration") // Ensure the view name is correct
      .select("*")
      .order("balance_id"); // Ensure balance_id exists in the view

    if (error) {
      toast.error("Error loading data");
      console.error("Error fetching balances:", error);
    } else {
      console.log("Fetched balances:", data); // Check data here
      setBalances(data);
    }
    setLoading(false);
  };

  const handleEdit = (id) => {
    setEditingId(id);
    const row = balances.find((b) => b.id === id); // Ensure the correct field name
    setFormData({
      eccentricity_limit: row.eccentricity_limit || 0,
      linearity_limit: row.linearity_limit || 0,
      repeatability_limit: row.repeatability_limit || 0,
      uncertainty_limit: row.uncertainty_limit || 0,
      eccentricity_range_kg: row.eccentricity_range_kg || 0,
      linearity_range_kg: row.linearity_range_kg || 0,
      repeatability_range_kg: row.repeatability_range_kg || 0,
      uncertainty_range_kg: row.uncertainty_range_kg || 0,
    });
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleSave = async (id) => {
    await toast.promise(
      supabase
        .from("balance_monthly_calibration")
        .update(formData)
        .eq("id", id),
      {
        loading: "Saving...",
        success: "Updated successfully",
        error: "Update failed",
      }
    );
    setEditingId(null);
    fetchBalances();
  };

  const handleDisplayField = (fieldValue) => {
    if (fieldValue === null || fieldValue === undefined) {
      return "N/A"; // Display "N/A" if the value is null or undefined
    }
    return fieldValue.toFixed(2); // Format the value if it's a number
  };

  const displayedBalances = selectedBalance
    ? balances.filter((b) => b.balance_uid === selectedBalance) // Use balance_uid for filtering
    : balances;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-blue-700">
        <Box className="text-blue-600" /> Monthly Calibration Master
      </h2>

      <div className="mb-6 w-full max-w-md">
        <label className="block text-sm font-semibold mb-1 flex items-center gap-1">
          <Search size={16} className="text-blue-600" /> Search Balance
        </label>
        <Select
          options={balances.map((b) => ({
            value: b.balance_uid,
            label: `${b.balance_id} - ${b.description}`,
          }))}
          onChange={(selected) => setSelectedBalance(selected?.value || null)}
          isClearable
          placeholder="Select a balance to update..."
        />
      </div>

      {displayedBalances.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-xs text-gray-700">
              <tr>
                <th className="border p-2">Balance ID</th>
                <th className="border p-2">Description</th>
                <th className="border p-2">Capacity (Kg)</th>
                <th className="border p-2">Eccentricity %</th>
                <th className="border p-2">Ecc. Range (Kg)</th>
                <th className="border p-2">Linearity %</th>
                <th className="border p-2">Lin. Range (Kg)</th>
                <th className="border p-2">Repeatability %</th>
                <th className="border p-2">Rept. Range (Kg)</th>
                <th className="border p-2">Uncertainty %</th>
                <th className="border p-2">Uncrt. Range (Kg)</th>
                <th className="border p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="12" className="p-4 text-center text-gray-400">
                    <RefreshCw className="animate-spin inline mr-2" /> Loading balances...
                  </td>
                </tr>
              ) : (
                displayedBalances.map((b) => (
                  <tr key={b.id} className="even:bg-gray-50 text-center">
                    <td className="border p-2 font-medium text-blue-700">{b.balance_id}</td>
                    <td className="border p-2">{b.description}</td>
                    <td className="border p-2">{b.capacity}</td>

                    {[
                      "eccentricity_limit",
                      "linearity_limit",
                      "repeatability_limit",
                      "uncertainty_limit",
                    ].map((field, idx) => (
                      <td key={idx} className="border p-2">
                        {editingId === b.id ? (
                          <input
                            type="number"
                            className="w-20 border p-1 rounded text-center"
                            value={formData[field] || 0}
                            onChange={(e) => handleInputChange(field, e.target.value)}
                          />
                        ) : (
                          handleDisplayField(b[field])
                        )}
                      </td>
                    ))}

                    {[
                      "eccentricity_range_kg",
                      "linearity_range_kg",
                      "repeatability_range_kg",
                      "uncertainty_range_kg",
                    ].map((field, idx) => (
                      <td key={idx} className="border p-2">
                        {handleDisplayField(b[field])}
                      </td>
                    ))}

                    <td className="border p-2">
                      {editingId === b.id ? (
                        <button
                          onClick={() => handleSave(b.id)}
                          className="inline-flex items-center gap-1 text-green-600"
                        >
                          <Save size={16} /> Save
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEdit(b.id)}
                          className="inline-flex items-center gap-1 text-blue-600"
                        >
                          <Pencil size={16} /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlyCalibrationMaster;
