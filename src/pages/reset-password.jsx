// src/pages/ResetPassword.jsx
import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";

export default function ResetPassword() {
  const [stage, setStage] = useState("checking"); // "checking" | "enter"
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    // When user opens the email link, Supabase sets a temp session and fires PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStage("enter");
    });

    // If the session is already present (hash processed), just show the form
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStage("enter");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(""); setErr("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setErr(error.message);
    else setMsg("Password updated. You can now sign in with your new password.");
  };

  if (stage !== "enter") return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Set a new password</h1>
      {msg && <div className="bg-green-100 text-green-700 p-2 rounded mb-3">{msg}</div>}
      {err && <div className="bg-red-100 text-red-700 p-2 rounded mb-3">{err}</div>}
      <form onSubmit={submit}>
        <input
          className="border rounded w-full p-2 mb-3"
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button className="w-full bg-blue-600 text-white py-2 rounded">Update password</button>
      </form>
    </div>
  );
}
