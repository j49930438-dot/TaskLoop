import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only create client if credentials are provided
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Create a dummy client that won't crash the app
  console.warn('Supabase credentials not configured. Please update .env file.');
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export { supabase };

// Check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url';
};

// Types for our database
export interface VerificationSession {
  id: string;
  mc_name: string;
  email: string;
  code: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at: string;
  is_online: boolean;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender: 'user' | 'admin';
  message: string;
  created_at: string;
}

// Admin user type
export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}
