import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) navigate('/login');
      else setUser(data.session.user);
    };
    getSession();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-lg text-center">
        <h1 className="text-2xl font-bold text-blue-600 mb-4">Dashboard</h1>
        {user && (
          <div className="space-y-2">
            <p className="text-gray-700">
              <strong>Email:</strong> {user.email}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
