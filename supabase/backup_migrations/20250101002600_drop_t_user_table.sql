-- Migration: Drop t_user table (no longer needed after auth migration)
-- Date: 2026-03-08
-- Description: Remove t_user table as authentication now uses auth.users + m_employees

-- Drop the table (this will also drop foreign key constraints)
DROP TABLE IF EXISTS public.t_user CASCADE;

-- Note: All authentication is now handled through:
-- 1. auth.users (Supabase Auth) - stores email, password, metadata (role)
-- 2. m_employees - stores employee data with user_id linking to auth.users
