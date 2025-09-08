import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import toast from "react-hot-toast";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [passwordWarning, setPasswordWarning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("role,password_expiry")
            .eq("id", s.user.id)
            .maybeSingle();

          if (!userError) {
            setRole(userData?.role || "User");
            const exp = userData?.password_expiry
              ? new Date(userData.password_expiry)
              : null;
            if (exp) {
              const now = new Date();
              if (exp < now)
                setPasswordWarning("Your password has expired. Please update it.");
              else if (exp < new Date(now.getTime() + 7 * 86400000))
                setPasswordWarning(
                  "Your password will expire soon. Please update it."
                );
            }
          }
        }
      } catch (err) {
        console.error("Session restore failed:", err);
        toast.error(`❌ ${err.message || "Session restore failed"}`);
      } finally {
        setLoading(false);
      }
    };

    restore();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setRole(null);
        setPasswordWarning(null);
      }
    );

    return () => listener?.subscription?.unsubscribe?.();
  }, []);

  const login = async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      setSession(data.session);
      setUser(data.user);

      const { data: userData } = await supabase
        .from("users")
        .select("role,password_expiry")
        .eq("id", data.user.id)
        .maybeSingle();

      setRole(userData?.role || "User");
      if (userData?.password_expiry) {
        const exp = new Date(userData.password_expiry);
        const now = new Date();
        if (exp < now)
          setPasswordWarning("Your password has expired. Please update it.");
        else if (exp < new Date(now.getTime() + 7 * 86400000))
          setPasswordWarning(
            "Your password will expire soon. Please update it."
          );
      }

      toast.success("✅ Login successful");
      return true;
    } catch (err) {
      const msg =
        err?.code === "invalid_credentials"
          ? "Invalid email or password"
          : err.message || String(err);
      toast.error(`❌ ${msg}`);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setRole(null);
      setPasswordWarning(null);
      toast.success("🚪 Logged out");
    } catch (err) {
      toast.error(`❌ Failed to log out: ${err.message || err}`);
    }
  };

  const signup = async ({ email, password }) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      toast.success("✅ Signup successful — check your inbox");
      return true;
    } catch (err) {
      toast.error(`❌ ${err.message || err}`);
      return false;
    }
  };

  const value = {
    user,
    session,
    role,
    passwordWarning,
    loading,
    login,
    logout,
    signup,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
