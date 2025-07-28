import React, { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";

const PasswordManagement = () => {
  const { session } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [history, setHistory] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // ✅ Check if current user is SuperAdmin/Admin
  useEffect(() => {
    const checkRole = async () => {
      if (!session?.user?.email) return;
      const { data } = await supabase
        .from("user_management")
        .select("role")
        .eq("email", session.user.email)
        .single();
      const roles = data?.role || [];
      setIsAdmin(roles.includes("Super Admin") || roles.includes("Admin"));
      setLoading(false);
    };
    checkRole();
  }, [session]);

  // ✅ Load employees for dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from("user_management")
        .select("employee_id, first_name, last_name, email");
      setEmployees(data || []);
    };
    fetchEmployees();
  }, []);

  // ✅ Fetch password history (last 5 resets)
  const fetchHistory = async (email) => {
    const { data } = await supabase
      .from("password_history")
      .select("changed_at, reset_by")
      .eq("email", email)
      .order("changed_at", { ascending: false })
      .limit(5);

    if (data?.length) {
      setHistory(data);
    } else {
      const { data: user } = await supabase
        .from("user_management")
        .select("password_updated_at")
        .eq("email", email)
        .single();

      if (user?.password_updated_at) {
        setHistory([{ changed_at: user.password_updated_at, reset_by: "Initial" }]);
      } else {
        setHistory([]);
      }
    }
  };

  const handleResetPassword = async () => {
    if (!selectedEmployee || !newPassword) return;

    const adminEmail = session?.user?.email || "Unknown";
    const { error } = await supabase.rpc("reset_user_password", {
      target_email: selectedEmployee,
      new_password: newPassword,
      reset_by: adminEmail,
    });

    if (error) {
      alert("Error resetting password: " + error.message);
    } else {
      alert("✅ Password reset successfully");
      fetchHistory(selectedEmployee);
      setNewPassword("");
    }
    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600">Checking permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-600 font-bold">
          ❌ Access Denied: Only SuperAdmin/Admin can reset passwords.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Password Management</h1>

      {/* ✅ Employee Selection */}
      <label className="block mb-2 font-medium">Select Employee</label>
      <select
        className="w-full border p-2 rounded mb-4"
        value={selectedEmployee}
        onChange={(e) => {
          setSelectedEmployee(e.target.value);
          fetchHistory(e.target.value);
        }}
      >
        <option value="">-- Select Employee --</option>
        {employees.map((emp) => (
          <option key={emp.employee_id} value={emp.email}>
            {emp.employee_id} - {emp.first_name} {emp.last_name} ({emp.email})
          </option>
        ))}
      </select>

      {/* ✅ New Password */}
      <label className="block mb-2 font-medium">New Password</label>
      <input
        type="password"
        className="w-full border rounded p-2 mb-4"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="Enter new password"
        autoComplete="new-password"
      />

      <button
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={() => setShowModal(true)}
        disabled={!selectedEmployee || !newPassword}
      >
        Reset Password
      </button>

      {/* ✅ Password History */}
      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Password History</h3>
          <table className="w-full border border-gray-200 rounded">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Date</th>
                <th className="p-2 border">Reset By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="text-sm">
                  <td className="p-2 border">
                    {new Date(h.changed_at).toLocaleString()}
                  </td>
                  <td className="p-2 border">{h.reset_by || "System"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1 italic">
            Showing last 5 resets
          </p>
        </div>
      )}

      {/* ✅ Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full">
            <h2 className="text-lg font-bold mb-3">Confirm Reset</h2>
            <p className="mb-4">
              Are you sure you want to reset the password for{" "}
              <strong>{selectedEmployee}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-3 py-1 bg-gray-300 rounded"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 bg-red-600 text-white rounded"
                onClick={handleResetPassword}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordManagement;
