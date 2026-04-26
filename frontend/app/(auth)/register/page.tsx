"use client";
import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  async function handleGoogle() {
    const supabase = getBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
  }

  if (done) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-4">
          <div className="text-5xl">✉️</div>
          <h1 className="text-xl font-bold text-white">Check your email</h1>
          <p className="text-sm text-gray-400">
            We sent a confirmation link to{" "}
            <span className="text-white font-medium">{email}</span>. Click it
            to activate your account and receive 1 free credit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Create account</h1>
          <p className="text-sm text-gray-500 mt-1">1 free report after email confirmation</p>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-green-400 hover:text-green-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
