// ✅ File: UpdatePassword.jsx
import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleReset = async () => {
    if (password.length < 6) {
      toast.error('⚠️ Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error('❌ Reset failed');
      console.error(error.message);
    } else {
      toast.success('✅ Password updated');
      navigate('/login'); // Redirect after success
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center text-blue-700">Reset Your Password</h2>

        <input
          type="password"
          placeholder="Enter new password"
          className="w-full px-3 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleReset}
          disabled={loading || password.length < 6}
          className={`w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition ${
            loading || password.length < 6 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
};

export default UpdatePassword;
