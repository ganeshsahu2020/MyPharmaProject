import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) navigate('/login');
      else setUser(data.session.user);
      setLoading(false);
    };
    getSession();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-blue-600 font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="w-full px-4 md:px-8 py-6">
        <div className="bg-white rounded-xl shadow p-6 max-w-6xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-blue-600 mb-4">Dashboard</h1>
          {user && (
            <div className="space-y-2">
              <p className="text-gray-700">
                <strong>Email:</strong> {user.email}
              </p>
              <p className="text-gray-700">
                <strong>User ID:</strong> {user.id}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
