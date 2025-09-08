// ✅ File: src/components/masters/PlantMaster.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "../../../utils/supabaseClient";
import toast from "react-hot-toast";
import {
  Hash,
  ClipboardList,
  CheckCircle2,
  MapPin,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";

const PlantMaster = () => {
  const [plants, setPlants] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("manage");
  const [editingId, setEditingId] = useState(null);

  // Refs for uncontrolled inputs
  const plantIdRef = useRef(null);
  const descriptionRef = useRef(null);
  const statusRef = useRef(null);
  const taxRef = useRef(null);
  const licenseRef = useRef(null);
  const gs1Ref = useRef(null);
  const addressRef = useRef(null);

  const [current, setCurrent] = useState({
    id: null,
    plant_id: "",
    description: "",
    status: "Active",
    tax_reg_no: "",
    license_no: "",
    gs1_prefix: "",
    address1: "",
  });

  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    fetchPlants();
  }, []);

  const fetchPlants = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vw_plant_master")
      .select("*")
      .order("plant_id", { ascending: true });

    if (error) {
      toast.error("❌ Failed to fetch plants");
      setPlants([]);
    } else {
      setPlants(data || []);
    }
    setLoading(false);
  };

  const resetFormDom = () => {
    [plantIdRef, descriptionRef, statusRef, taxRef, licenseRef, gs1Ref, addressRef].forEach(
      (r) => {
        if (r.current) r.current.value = "";
      }
    );
    if (statusRef.current) statusRef.current.value = "Active";

    setCurrent({
      id: null,
      plant_id: "",
      description: "",
      status: "Active",
      tax_reg_no: "",
      license_no: "",
      gs1_prefix: "",
      address1: "",
    });
    setEditingId(null);
    setFormKey((k) => k + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      plant_id: plantIdRef.current?.value?.trim() || "",
      description: descriptionRef.current?.value?.trim() || "",
      status: statusRef.current?.value || "Active",
      tax_reg_no: taxRef.current?.value?.trim() || "",
      license_no: licenseRef.current?.value?.trim() || "",
      gs1_prefix: gs1Ref.current?.value?.trim() || "",
      address1: addressRef.current?.value?.trim() || "",
    };

    if (!payload.plant_id || !payload.description) {
      toast.error("Plant ID & Description are required");
      return;
    }

    const action = editingId
      ? supabase.from("plant_master").update(payload).eq("id", editingId)
      : supabase.from("plant_master").insert([payload]);

    await toast.promise(action, {
      loading: "⏳ Saving Plant...",
      success: editingId ? "✅ Plant updated" : "✅ Plant added",
      error: "❌ Save failed",
    });

    resetFormDom();
    setActiveTab("preview");
    fetchPlants();
  };

  const handleEdit = (plant) => {
    setCurrent({ ...plant });
    setEditingId(plant.plant_uid);

    if (plantIdRef.current) plantIdRef.current.value = plant.plant_id || "";
    if (descriptionRef.current)
      descriptionRef.current.value = plant.plant_description || "";
    if (statusRef.current) statusRef.current.value = plant.plant_status || "Active";
    if (taxRef.current) taxRef.current.value = plant.tax_reg_no || "";
    if (licenseRef.current) licenseRef.current.value = plant.license_no || "";
    if (gs1Ref.current) gs1Ref.current.value = plant.gs1_prefix || "";
    if (addressRef.current) addressRef.current.value = plant.address1 || "";

    toast.success(`✏️ Editing Plant: ${plant.plant_id}`);
    setActiveTab("manage");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this plant?")) return;

    const action = supabase.from("plant_master").delete().eq("id", id);

    await toast.promise(action, {
      loading: "⏳ Deleting Plant...",
      success: "✅ Plant deleted",
      error: "❌ Delete failed",
    });

    fetchPlants();
  };

  const filteredPlants = useMemo(() => {
    if (!searchTerm.trim()) return plants;
    const term = searchTerm.toLowerCase();
    return plants.filter(
      (p) =>
        p.plant_id?.toLowerCase().includes(term) ||
        p.plant_description?.toLowerCase().includes(term) ||
        p.plant_status?.toLowerCase().includes(term) ||
        p.address1?.toLowerCase().includes(term)
    );
  }, [searchTerm, plants]);

  const InputIconWrapper = ({ icon: Icon, color, label, children }) => (
    <div className="flex flex-col w-full">
      <label className="text-xs font-medium mb-1">{label}</label>
      <div className="relative flex items-center w-full">
        <Icon className={`absolute left-2 top-3 pointer-events-none ${color}`} size={16} />
        <div className="w-full">{children}</div>
      </div>
    </div>
  );

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold mb-3">Plant Master</h2>

      {/* Tabs */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => setActiveTab("manage")}
          className={`px-3 py-1 rounded ${
            activeTab === "manage" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
        >
          Manage
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-3 py-1 rounded ${
            activeTab === "preview" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
        >
          Preview All
        </button>
      </div>

      {activeTab === "manage" && (
        <form
          key={formKey}
          onSubmit={handleSubmit}
          className="bg-gray-50 p-3 rounded mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
        >
          <InputIconWrapper icon={Hash} color="text-blue-600" label="Plant ID">
            <input
              type="text"
              ref={plantIdRef}
              defaultValue={current.plant_id}
              className="border pl-7 p-2 rounded text-sm w-full"
              required
            />
          </InputIconWrapper>

          <InputIconWrapper
            icon={ClipboardList}
            color="text-green-600"
            label="Description"
          >
            <input
              type="text"
              ref={descriptionRef}
              defaultValue={current.plant_description}
              className="border pl-7 p-2 rounded text-sm w-full"
              required
            />
          </InputIconWrapper>

          <InputIconWrapper icon={CheckCircle2} color="text-purple-600" label="Status">
            <select
              ref={statusRef}
              defaultValue={current.plant_status || "Active"}
              className="border pl-7 p-2 rounded text-sm w-full"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </InputIconWrapper>

          <InputIconWrapper icon={FileText} color="text-pink-600" label="Tax Registration No">
            <input
              type="text"
              ref={taxRef}
              defaultValue={current.tax_reg_no}
              className="border pl-7 p-2 rounded text-sm w-full"
            />
          </InputIconWrapper>

          <InputIconWrapper icon={FileText} color="text-yellow-600" label="License No">
            <input
              type="text"
              ref={licenseRef}
              defaultValue={current.license_no}
              className="border pl-7 p-2 rounded text-sm w-full"
            />
          </InputIconWrapper>

          <InputIconWrapper icon={Hash} color="text-indigo-600" label="GS1 Prefix">
            <input
              type="text"
              ref={gs1Ref}
              defaultValue={current.gs1_prefix}
              className="border pl-7 p-2 rounded text-sm w-full"
            />
          </InputIconWrapper>

          <InputIconWrapper icon={MapPin} color="text-red-600" label="Address">
            <input
              type="text"
              ref={addressRef}
              defaultValue={current.address1}
              className="border pl-7 p-2 rounded text-sm w-full"
            />
          </InputIconWrapper>

          <div className="mt-2 col-span-full flex items-center gap-3">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              {editingId ? "Update Plant" : "Add Plant"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetFormDom}
                className="bg-gray-400 text-white px-3 py-2 rounded text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === "preview" && (
        <>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search Plant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border p-2 rounded w-full text-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Plant ID</th>
                  <th className="border p-2">Description</th>
                  <th className="border p-2">Status</th>
                  <th className="border p-2">Tax Reg No</th>
                  <th className="border p-2">License</th>
                  <th className="border p-2">GS1 Prefix</th>
                  <th className="border p-2">Address</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array(8)
                        .fill(0)
                        .map((__, j) => (
                          <td key={j} className="border p-2 bg-gray-200">
                            &nbsp;
                          </td>
                        ))}
                    </tr>
                  ))
                ) : filteredPlants.length > 0 ? (
                  filteredPlants.map((plant) => (
                    <tr key={plant.plant_uid}>
                      <td className="border p-2">{plant.plant_id}</td>
                      <td className="border p-2">{plant.plant_description}</td>
                      <td className="border p-2">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            plant.plant_status === "Active"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {plant.plant_status}
                        </span>
                      </td>
                      <td className="border p-2">{plant.tax_reg_no || "-"}</td>
                      <td className="border p-2">{plant.license_no || "-"}</td>
                      <td className="border p-2">{plant.gs1_prefix || "-"}</td>
                      <td className="border p-2">{plant.address1 || "-"}</td>
                      <td className="border p-2 flex gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(plant)}
                          className="p-1 bg-yellow-500 rounded hover:bg-yellow-600"
                        >
                          <Pencil className="text-white" size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(plant.plant_uid)}
                          className="p-1 bg-red-500 rounded hover:bg-red-600"
                        >
                          <Trash2 className="text-white" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="text-center p-2 text-gray-500">
                      No plants found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(PlantMaster);
