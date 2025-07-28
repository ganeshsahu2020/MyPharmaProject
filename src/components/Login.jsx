import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ Redirect if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) navigate('/dashboard');
    };
    checkSession();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError) {
      setError('❌ Invalid credentials. Try again.');
      setLoading(false);
      return;
    }

    // ✅ Check password expiry
    const { data: userData } = await supabase
      .from('user_management')
      .select('password_updated_at')
      .eq('email', email.trim())
      .single();

    const lastUpdate = userData?.password_updated_at
      ? new Date(userData.password_updated_at)
      : null;
    const now = new Date();
    const diffDays = lastUpdate
      ? (now - lastUpdate) / (1000 * 60 * 60 * 24)
      : 999;

    if (!lastUpdate || diffDays > 90) {
      navigate('/user-authorization/password-management');
    } else {
      navigate('/dashboard');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        {/* ✅ Brand Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-700">DigitizerX</h1>
          <p className="text-gray-500 text-sm mt-1">Secure Pharma Access</p>
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
              placeholder="Enter your email"
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
              placeholder="Enter your password"
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
        </form>

        {/* ✅ Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">© {new Date().getFullYear()} DigitizerX Pharma Systems</p>
      </div>
    </div>
  );
};

export default Login;
