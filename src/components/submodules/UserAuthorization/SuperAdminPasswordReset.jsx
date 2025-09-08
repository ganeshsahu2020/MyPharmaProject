// ✅ File: src/components/submodules/UserAuthorization/SuperAdminPasswordReset.jsx
import {useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';

const SuperAdminPasswordReset=()=>{
  const [email,setEmail]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const validEmail=(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

  const handleReset=async(e)=>{
    e.preventDefault();
    setError(''); setMessage('');
    const v=(email||'').trim().toLowerCase();
    if(!validEmail(v)){setError('Please enter a valid email'); return;}
    setLoading(true);
    try{
      const redirectUrl=(typeof window!=='undefined'&&window.location?.origin)
        ? `${window.location.origin}/reset-password`
        : 'http://localhost:5173/reset-password';
      const {error:authError}=await supabase.auth.resetPasswordForEmail(v,{redirectTo:redirectUrl});
      if(authError){setError(authError.message);}
      else{setMessage('✅ Password reset email sent');}
    }catch(err){
      setError(err?.message||'Failed to send reset email');
    }finally{
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Super Admin Password Reset</h2>

      {message&&<div className="bg-green-100 text-green-700 p-2 rounded mb-3">{message}</div>}
      {error&&<div className="bg-red-100 text-red-700 p-2 rounded mb-3">{error}</div>}

      <form onSubmit={handleReset} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">User Email</label>
        <input
          id="email"
          type="email"
          className="w-full p-2 border rounded"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          placeholder="user@company.com"
          autoComplete="email"
          required
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 w-full rounded disabled:opacity-60"
          disabled={loading}
        >
          {loading?'Sending...':'Send Reset Link'}
        </button>
      </form>

      <p className="text-xs text-slate-600 mt-3">
        The user will receive an email with a secure link. After clicking it, they will be redirected to <code>/reset-password</code> to set a new password.
      </p>
    </div>
  );
};

export default SuperAdminPasswordReset;
