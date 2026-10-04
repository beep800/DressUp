import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when no project is configured; the app then runs on generated demo data. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const ANALYTICS_SCHEMA = 'analytics';
