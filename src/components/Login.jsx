// src/components/Login.jsx
import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from './ui/card';
import {Label} from './ui/label';
import {Eye,EyeOff} from 'lucide-react';
import {supabase} from '../utils/supabaseClient';
import logo from '@/assets/logo.png'; // if you don't use the @ alias, change to: '../assets/logo.png'

const Login=()=>{
  const navigate=useNavigate();
  const {login}=useAuth();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPwd,setShowPwd]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const handleLogin=async(e)=>{
    e.preventDefault();
    setError('');
    setLoading(true);
    const success=await login({email:email.trim(),password:password.trim()});
    if(success){ navigate('/'); } else { setError('Invalid email or password'); }
    setLoading(false);
  };

  const handleForgotPassword=async()=>{
    if(!email.trim()){
      toast.error('⚠️ Enter your email first',{style:{background:'#fee2e2',color:'#991b1b',fontSize:'14px',borderRadius:'4px',padding:'10px 14px'}});
      return;
    }
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{
      redirectTo:import.meta.env.VITE_APP_URL?`${import.meta.env.VITE_APP_URL}/update-password`:'http://localhost:5173/update-password'
    });
    if(error){
      toast.error(`❌ Failed to send reset link: ${error.message}`,{style:{background:'#fee2e2',color:'#991b1b',fontSize:'14px',borderRadius:'4px',padding:'10px 14px'}});
      console.error('Reset password error:',error.message);
    }else{
      toast.success('📧 Password reset link sent!',{style:{background:'#d1fae5',color:'#065f46',fontSize:'14px',borderRadius:'4px',padding:'10px 14px'}});
    }
  };

  return(
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="DigitizerX logo" className="h-12 w-auto" />
            <CardTitle className="text-3xl font-bold text-blue-700">DigitizerX</CardTitle>
          </div>
          <CardDescription className="text-gray-500">Secure Login Portal</CardDescription>
        </CardHeader>

        <CardContent>
          {error&&(<p className="text-red-600 mb-3 text-center">{error}</p>)}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="Enter email"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd?'text':'password'}
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={()=>setShowPwd((v)=>!v)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center"
                  aria-label={showPwd?'Hide password':'Show password'}
                >
                  {showPwd?<EyeOff size={18}/>:<Eye size={18}/>}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg">
              {loading?'Logging in...':'Login'}
            </Button>

            <div className="text-right text-sm">
              <Button type="button" variant="link" onClick={handleForgotPassword} className="text-blue-600">
                Forgot Password?
              </Button>
            </div>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            © {new Date().getFullYear()} DigitizerX Pharma Systems
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
