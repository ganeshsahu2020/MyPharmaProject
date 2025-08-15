import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [passwordWarning, setPasswordWarning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error(`Session restoration failed: ${error.message}`);
        const currentSession = data?.session || null;
        setSession(currentSession);
        setUser(currentSession?.user || null);

        if (currentSession?.user) {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role, password_expiry')
            .eq('id', currentSession.user.id)
            .maybeSingle();
          if (userError) throw new Error(`Failed to fetch user data: ${userError.message}`);
          setRole(userData?.role || 'User');
          if (userData?.password_expiry) {
            const expiryDate = new Date(userData.password_expiry);
            if (expiryDate < new Date()) {
              setPasswordWarning('Your password has expired. Please update it.');
            } else if (expiryDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
              setPasswordWarning('Your password will expire soon. Please update it.');
            }
          }
          toast.success('✅ Session restored', {
            style: {
              background: '#f3f4f6',
              color: '#1f2937',
              fontSize: '14px',
              borderRadius: '4px',
              padding: '10px 14px',
            },
          });
        }
      } catch (error) {
        console.error('Error restoring session:', error.message);
        toast.error(`❌ ${error.message}`, {
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: '14px',
            borderRadius: '4px',
            padding: '10px 14px',
          },
        });
      } finally {
        setLoading(false);
      }
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setRole(null);
      setPasswordWarning(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Login function
  const login = async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const errorMessage = error.code === 'invalid_credentials'
          ? 'Invalid email or password'
          : `Login failed: ${error.message}`;
        console.error('Login error:', errorMessage);
        toast.error(`❌ ${errorMessage}`, {
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: '14px',
            borderRadius: '4px',
            padding: '10px 14px',
          },
        });
        return false;
      }
      setSession(data.session);
      setUser(data.user);
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, password_expiry')
        .eq('id', data.user.id)
        .maybeSingle();
      if (userError) {
        console.error('Failed to fetch user data:', userError.message);
      } else {
        setRole(userData?.role || 'User');
        if (userData?.password_expiry) {
          const expiryDate = new Date(userData.password_expiry);
          if (expiryDate < new Date()) {
            setPasswordWarning('Your password has expired. Please update it.');
          } else if (expiryDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
            setPasswordWarning('Your password will expire soon. Please update it.');
          }
        }
      }
      toast.success('✅ Login successful', {
        style: {
          background: '#d1fae5',
          color: '#065f46',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
      return true;
    } catch (error) {
      console.error('Unexpected login error:', error.message);
      toast.error(`❌ Unexpected error: ${error.message}`, {
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setRole(null);
      setPasswordWarning(null);
      toast.success('🚪 Logged out', {
        style: {
          background: '#d1fae5',
          color: '#065f46',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
    } catch (error) {
      console.error('Logout error:', error.message);
      toast.error(`❌ Failed to log out: ${error.message}`, {
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
    }
  };

  // Signup function
  const signup = async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const errorMessage = error.code === 'user_already_exists'
          ? 'User already exists'
          : `Signup failed: ${error.message}`;
        console.error('Signup error:', errorMessage);
        toast.error(`❌ ${errorMessage}`, {
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: '14px',
            borderRadius: '4px',
            padding: '10px 14px',
          },
        });
        return false;
      }
      toast.success('✅ Signup successful — check your inbox', {
        style: {
          background: '#d1fae5',
          color: '#065f46',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
      return true;
    } catch (error) {
      console.error('Unexpected signup error:', error.message);
      toast.error(`❌ Unexpected error: ${error.message}`, {
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '14px',
          borderRadius: '4px',
          padding: '10px 14px',
        },
      });
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, logout, signup, role, passwordWarning }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);