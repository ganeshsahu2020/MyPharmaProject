// ✅ File: src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Restore session on refresh with error handling
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const currentSession = data?.session || null;
        setSession(currentSession);
        setUser(currentSession?.user || null);
      } catch (error) {
        console.error('Error restoring session:', error.message);
        toast.error('❌ Failed to restore session');
      } finally {
        setLoading(false);
      }
    };

    restoreSession();

    // ✅ Auth state change listener
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
    });

    return () => {
      authSub.unsubscribe();
    };
  }, []);

  // ✅ Login with detailed logging
  const login = async ({ email, password }) => {
    try {
      console.log('Attempting login with:', { email, password });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Login error:', error.message);
        toast.error('❌ Login failed');
        return false;
      }
      setSession(data.session);
      setUser(data.user);
      toast.success('✅ Login successful');
      return true;
    } catch (error) {
      console.error('Unexpected login error:', error.message);
      toast.error('❌ Login failed');
      return false;
    }
  };

  // ✅ Logout
  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      toast.success('🚪 Logged out');
    } catch (error) {
      console.error('Logout error:', error.message);
      toast.error('❌ Failed to log out');
    }
  };

  // ✅ Signup (optional) with detailed logging
  const signup = async ({ email, password }) => {
    try {
      console.log('Attempting signup with:', { email });
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error('Signup error:', error.message);
        toast.error('❌ Signup failed');
        return false;
      }
      toast.success('✅ Signup success — check your inbox');
      return true;
    } catch (error) {
      console.error('Unexpected signup error:', error.message);
      toast.error('❌ Signup failed');
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, logout, signup }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);