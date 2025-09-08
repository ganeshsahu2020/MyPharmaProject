import { useEffect, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";

export default function UpdatePassword() {
  const [stage, setStage] = useState("checking"); // checking | ready | done | error
  const [err, setErr] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  // 1) Create a session from the URL (PKCE ?code=... OR implicit #access_token=...)
  useEffect(() => {
    let mounted = true;

    (async () => {
      setErr("");
      setStage("checking");

      try {
        // Try PKCE flow
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession({ code });
          if (error) throw error;
        } else {
          // For implicit flow, supabase-js will already parse #access_token
          // if detectSessionInUrl:true in your client. Just verify we have a session:
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data?.session?.user) setStage("ready");
        else {
          setErr("No recovery session found in this page URL.");
          setStage("error");
        }
      } catch (e) {
        if (!mounted) return;
        setErr(e.message || "Failed to read recovery session.");
        setStage("error");
      }
    })();

    return () => { mounted = false; };
  }, []);

  // 2) Submit new password
  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!pw1 || !pw2) return setErr("Enter and confirm your new password.");
    if (pw1 !== pw2) return setErr("Passwords do not match.");
    if (pw1.length < 8) return setErr("Password must be at least 8 characters.");

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setStage("done");
    } catch (e) {
      setErr(e.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "checking") return <div className="p-6">Loading…</div>;

  if (stage === "done") {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded shadow">
        <h1 className="text-xl font-semibold mb-3">Password updated</h1>
        <p>You can now close this tab and sign in with your new password.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded shadow">
      <h1 className="text-xl font-semibold mb-4">Set a new password</h1>

      {err && <div className="mb-3 rounded p-2 bg-red-100 text-red-700">{err}</div>}

      {stage === "ready" ? (
        <form onSubmit={onSubmit}>
          <label className="block text-sm font-medium mb-1">New password</label>
          <input
            type="password"
            className="w-full px-3 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />

          <label className="block text-sm font-medium mb-1">Confirm password</label>
          <input
            type="password"
            className="w-full px-3 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      ) : (
        <div className="text-sm text-slate-600">
          This page didn’t find a recovery session in the URL.
          <br />
          Please open the password reset link from your email again.
        </div>
      )}
    </div>
  );
}
