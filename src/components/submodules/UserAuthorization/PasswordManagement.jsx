import {useState} from 'react';
import {supabase} from '../../../utils/supabaseClient';
import {useAuth} from '../../../contexts/AuthContext';

export default function PasswordManagement(){
  const {session}=useAuth();
  const email=session?.user?.email||'';

  const [form,setForm]=useState({
    old_password:'',
    new_password:'',
    confirm_password:''
  });

  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const handleChangePassword=async(e)=>{
    e.preventDefault();
    setError('');
    setMessage('');

    const{old_password,new_password,confirm_password}=form;

    if(!email){
      setError('No active session found.');
      return;
    }

    if(!old_password||!new_password||!confirm_password){
      setError('All fields are required.');
      return;
    }

    if(new_password!==confirm_password){
      setError('Passwords do not match.');
      return;
    }

    if(new_password.length<8){
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try{
      // 🔐 Re-authenticate with old password
      const{error:reauthError}=await supabase.auth.signInWithPassword({
        email,
        password:old_password
      });

      if(reauthError){
        setError('Old password is incorrect.');
        return;
      }

      // ✅ Update password
      const{error:updateError}=await supabase.auth.updateUser({
        password:new_password
      });

      if(updateError){
        setError(updateError.message);
        return;
      }

      // 📅 Update password_updated_at in your user_management table
      await supabase
        .from('user_management')
        .update({password_updated_at:new Date().toISOString()})
        .eq('email',email);

      setMessage('✅ Password updated successfully.');
      setForm({old_password:'',new_password:'',confirm_password:''});
    }catch(err){
      console.error('Password change error:',err);
      setError('Unexpected error occurred. Try again.');
    }finally{
      setLoading(false);
    }
  };

  return(
    <div className="p-4 max-w-md mx-auto bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4 text-center text-blue-600">Change Password</h2>

      {message&&<div className="bg-green-100 text-green-700 p-2 rounded mb-3">{message}</div>}
      {error&&<div className="bg-red-100 text-red-700 p-2 rounded mb-3">{error}</div>}

      <form onSubmit={handleChangePassword}>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Old Password</label>
          <input
            type="password"
            className="border p-2 w-full rounded"
            value={form.old_password}
            onChange={(e)=>setForm({...form,old_password:e.target.value})}
            placeholder="Enter old password"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">New Password</label>
          <input
            type="password"
            className="border p-2 w-full rounded"
            value={form.new_password}
            onChange={(e)=>setForm({...form,new_password:e.target.value})}
            placeholder="Enter new password"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block mb-1 font-medium">Confirm Password</label>
          <input
            type="password"
            className="border p-2 w-full rounded"
            value={form.confirm_password}
            onChange={(e)=>setForm({...form,confirm_password:e.target.value})}
            placeholder="Confirm new password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading?'Updating...':'Update Password'}
        </button>
      </form>
    </div>
  );
}
