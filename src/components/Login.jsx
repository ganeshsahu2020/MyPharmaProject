import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim()
    });

    if (loginError) {
      console.error('❌ Login failed:', loginError.message);
      setError('❌ Invalid email or password');
    } else {
      toast.success('✅ Login successful');
      navigate('/'); // 👈 Redirects to dashboard or home
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('⚠️ Enter your email first');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'http://localhost:5173/update-password' // ✅ Change this in production
    });

    if (error) {
      toast.error('❌ Failed to send reset link');
      console.error(error.message);
    } else {
      toast.success('📧 Password reset link sent!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-700">DigitizerX</h1>
          <p className="text-gray-500 text-sm mt-1">Secure Login Portal</p>
        </div>

        {error && <p className="text-red-600 mb-3 text-center">{error}</p>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter email"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <div className="text-right text-sm mt-2">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-blue-600 hover:underline"
            >
              Forgot Password?
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} DigitizerX Pharma Systems
        </p>
      </div>
    </div>
  );
};

export default Login;
