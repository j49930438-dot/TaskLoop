import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, KeyRound, AlertCircle, Mail } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AdminLoginProps {
  onLogin: (userId: string) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Please update .env file.');
      setIsLoading(false);
      return;
    }

    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Login failed');
        setIsLoading(false);
        return;
      }

      // Check user role in admin_users table
      const { data: userData, error: userError } = await supabase
        .from('admin_users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (userError || !userData) {
        setError('User not found in admin system');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      if (userData.role !== 'admin') {
        setError('Access denied. Admin privileges required.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // Success - admin user
      localStorage.setItem('blockclash_admin', authData.user.id);
      onLogin(authData.user.id);
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#111] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 to-black pointer-events-none" />
      
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-[#1a1a1a] border-4 border-[#333] p-8 relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-minecraft-red border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white font-minecraft">
            <span className="text-minecraft-green">Block</span>Clash Admin
          </h1>
          <p className="text-gray-500 text-sm font-minecraft mt-1">Restricted Access</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-2 block font-minecraft">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-[#111] border-2 border-[#333] focus:border-minecraft-green text-white pl-12 pr-4 py-4 outline-none font-minecraft transition-all"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-2 block font-minecraft">
              Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-[#111] border-2 border-[#333] focus:border-minecraft-green text-white pl-12 pr-4 py-4 outline-none font-minecraft transition-all"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-minecraft-red/20 border-2 border-minecraft-red text-minecraft-red text-sm font-minecraft flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={!email || !password || isLoading}
            className="w-full bg-minecraft-green text-black font-bold py-4 font-minecraft text-lg hover:bg-[#6aff6a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_4px_0_#00aa00] active:shadow-none active:translate-y-1"
          >
            {isLoading ? 'Authenticating...' : 'Access Dashboard'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs font-minecraft mt-6">
          Unauthorized access is prohibited
        </p>
      </motion.div>
    </div>
  );
}
