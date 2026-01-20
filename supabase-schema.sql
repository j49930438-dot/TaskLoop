-- BlockClash Verification System - Supabase Schema
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ADMIN USERS TABLE (for role-based access)
-- ============================================
-- This table links to Supabase Auth users and assigns roles
-- You create users in Supabase Auth Dashboard, then add them here with their role

CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster role lookups
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- RLS for admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own role
CREATE POLICY "Users can read own data" ON admin_users
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- ============================================
-- VERIFICATION SESSIONS TABLE
-- ============================================
CREATE TABLE verification_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  mc_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  is_online BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Messages Table
CREATE TABLE chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_sessions_status ON verification_sessions(status);
CREATE INDEX idx_sessions_created_at ON verification_sessions(created_at DESC);
CREATE INDEX idx_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_messages_created_at ON chat_messages(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for verification_sessions
-- Allow anonymous users to insert and update their own sessions
CREATE POLICY "Allow anonymous insert" ON verification_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON verification_sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous update" ON verification_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Policies for chat_messages
-- Allow anonymous users to insert and read messages
CREATE POLICY "Allow anonymous insert messages" ON chat_messages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous select messages" ON chat_messages
  FOR SELECT TO anon USING (true);

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE verification_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_users;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on verification_sessions
CREATE TRIGGER update_verification_sessions_updated_at
  BEFORE UPDATE ON verification_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HOW TO ADD AN ADMIN USER:
-- ============================================
-- 1. Go to Supabase Dashboard -> Authentication -> Users
-- 2. Click "Add User" and create a user with email/password
-- 3. Copy the user's UUID from the Users table
-- 4. Run this SQL (replace the UUID and email):
--
-- INSERT INTO admin_users (id, email, role) 
-- VALUES ('paste-user-uuid-here', 'your-email@example.com', 'admin');
--
-- For regular users (who can't access admin dashboard):
-- INSERT INTO admin_users (id, email, role) 
-- VALUES ('paste-user-uuid-here', 'user@example.com', 'user');
