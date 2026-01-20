-- BlockClash Verification System - Migration SQL
-- Run this in Supabase SQL Editor AFTER the original schema
-- This updates the verification flow:
--   1. User enters email → saved immediately
--   2. Admin sees email, sends code via external method (email)
--   3. Admin enters the code in dashboard → saved to DB
--   4. User enters code → verified
-- MC Name is frontend-only (for display purposes)

-- ============================================
-- DROP OLD TABLES (if you want fresh start)
-- ============================================
-- Uncomment these lines if you want to delete existing data and start fresh:

-- DROP TABLE IF EXISTS chat_messages CASCADE;
-- DROP TABLE IF EXISTS verification_sessions CASCADE;

-- ============================================
-- UPDATED VERIFICATION SESSIONS TABLE
-- ============================================
-- If table already exists, we'll alter it. If not, create new.

-- First, let's drop the old constraints and modify the table
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'verification_sessions') THEN
    -- Remove NOT NULL constraint from code (admin will add it later)
    ALTER TABLE verification_sessions ALTER COLUMN code DROP NOT NULL;
    ALTER TABLE verification_sessions ALTER COLUMN mc_name DROP NOT NULL;
    
    -- Set defaults
    ALTER TABLE verification_sessions ALTER COLUMN code SET DEFAULT '';
    ALTER TABLE verification_sessions ALTER COLUMN mc_name SET DEFAULT '';
    
    RAISE NOTICE 'verification_sessions table updated';
  ELSE
    -- Create the table fresh
    CREATE TABLE verification_sessions (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      code TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    RAISE NOTICE 'verification_sessions table created';
  END IF;
END $$;

-- ============================================
-- CHAT MESSAGES TABLE (if not exists)
-- ============================================
-- Drop and recreate to add message_type column
DROP TABLE IF EXISTS chat_messages CASCADE;

CREATE TABLE chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'admin', 'system')),
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'code_attempt')),
  is_correct BOOLEAN DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY - Allow all operations for now
-- ============================================
ALTER TABLE verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all for verification_sessions" ON verification_sessions;
DROP POLICY IF EXISTS "Allow all for chat_messages" ON chat_messages;

-- Create permissive policies (adjust for production)
CREATE POLICY "Allow all for verification_sessions" ON verification_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for chat_messages" ON chat_messages
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sessions_email ON verification_sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON verification_sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);

-- ============================================
-- ENABLE REALTIME (ignore errors if already enabled)
-- ============================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE verification_sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================
-- FLOW SUMMARY:
-- ============================================
-- 1. User enters MC name (frontend only, not saved to DB)
-- 2. User enters email → INSERT into verification_sessions (email only)
-- 3. Admin sees the email in dashboard
-- 4. Admin sends code to user via email (external)
-- 5. Admin enters the code in dashboard → UPDATE verification_sessions SET code = 'xxx'
-- 6. User enters the code they received
-- 7. If code matches → status = 'verified', show "Verified as [MC name]" (MC name from frontend)
