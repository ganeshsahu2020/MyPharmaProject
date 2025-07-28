import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Navigate } from 'react-router-dom';

const AuthGuard = ({ children }) => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkPasswordExpiry = async () => {
      console.log('✅ Full session object:', session);

      if (!session?.user) {
        console.log('⚠️ No session user found');
        setLoading(false);
        return;
      }

      try {
        const email = session.user.email;
        console.log('🔍 Checking password expiry for:', email);

        const { data, error } = await supabase
          .from('user_management')
          .select('password_updated_at, email')
          .eq('email', email)
          .single();

        console.log('📦 Supabase data:', data, 'Error:', error);

        if (isMounted) {
          const lastUpdate = data?.password_updated_at
            ? new Date(data.password_updated_at)
            : null;
          const now = new Date();
          const diffDays = lastUpdate
            ? (now - lastUpdate) / (1000 * 60 * 60 * 24)
            : 999;

          console.log('📅 Password last updated:', lastUpdate, 'DiffDays:', diffDays);

          if (!lastUpdate || diffDays > 90) {
            console.log('🔒 Password expired (redirect still disabled)');
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('🔥 Password expiry check failed:', err);
        if (isMounted) setLoading(false);
      }
    };

    checkPasswordExpiry();
    return () => {
      isMounted = false;
    };
  }, [session]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-600">🔄 Checking session...</div>
      </div>
    );
  }

  if (!session?.user) {
    console.log('➡️ Redirecting to login');
    return <Navigate to="/login" replace />;
  }

  console.log('✅ AuthGuard passed (redirect disabled), rendering children');
  return children;
};

export default AuthGuard;
