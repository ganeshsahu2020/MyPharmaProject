// src/components/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";

import Button from "./ui/Button";
import Input from "./ui/Input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/Card";
import Label from "./ui/Label";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

import logo from "../assets/logo.png";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const success = await login({
        email: email.trim(),
        password: password.trim(),
      });
      if (success) {
        navigate("/");
      } else {
        setError("Invalid email or password");
      }
    } catch (err) {
      console.error(err);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("⚠️ Enter your email first", {
        style: {
          background: "#fee2e2",
          color: "#991b1b",
          fontSize: "14px",
          borderRadius: "8px",
          padding: "10px 14px",
        },
      });
      return;
    }
    const redirectTo = import.meta.env.VITE_APP_URL
      ? `${import.meta.env.VITE_APP_URL}/update-password`
      : "http://localhost:5173/update-password";

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );
    if (error) {
      toast.error(`❌ Failed to send reset link: ${error.message}`);
    } else {
      toast.success("📧 Password reset link sent!");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-200/70 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/70 rounded-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 grid place-items-center">
              <img
                src={logo}
                alt="DigitizerX logo"
                className="h-12 w-12 rounded-md"
              />
            </div>
            <CardTitle className="text-3xl font-extrabold tracking-tight text-blue-700">
              DigitizerX
            </CardTitle>
            <CardDescription className="mt-1 text-slate-500">
              Secure Login Portal
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            {error ? (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-slate-700"
                >
                  Email
                </Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Mail className="h-4 w-4 text-blue-600/80" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    disabled={loading}
                    className="pl-9 placeholder:text-slate-400"
                    aria-label="Email address"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium text-slate-700"
                >
                  Password
                </Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Lock className="h-4 w-4 text-blue-600/80" />
                  </div>
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className="pl-9 pr-10 placeholder:text-slate-400"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember / Forgot */}
              <div className="flex items-center justify-between">
                <label className="inline-flex select-none items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="group w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                {loading ? "Signing in…" : "Login"}
              </Button>

              {/* Small trust line */}
              <p className="pt-2 text-center text-[11px] text-slate-400">
                GxP compliant • 21 CFR Part 11 • GAMP 5
              </p>
            </form>

            <p className="mt-6 text-center text-[11px] text-slate-400">
              © {new Date().getFullYear()} DigitizerX Pharma Systems
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
