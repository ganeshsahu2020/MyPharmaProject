import { useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';

const SuperAdminPasswordReset = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email) return setError('Please enter a valid email');

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:5173/reset-password'
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('✅ Password reset email sent');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Super Admin Password Reset</h2>

      {message && <div className="bg-green-100 text-green-700 p-2 rounded mb-3">{message}</div>}
      {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-3">{error}</div>}

      <form onSubmit={handleReset}>
        <input
          type="email"
          className="w-full p-2 border rounded mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter user email to reset"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 w-full rounded"
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
    </div>
  );
};

export default SuperAdminPasswordReset;
