import { createBrowserClient } from '@supabase/ssr';

let supabase: ReturnType<typeof createBrowserClient>;

if (typeof window !== 'undefined') {
  // Only initialize Supabase on the client side
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // In production, we'll show a more user-friendly message
    if (process.env.NODE_ENV === 'production') {
      console.error('Supabase credentials are not properly configured');
    } else {
      console.error(`
        Error: Missing environment variables
        Required variables:
        - NEXT_PUBLIC_SUPABASE_URL
        - NEXT_PUBLIC_SUPABASE_ANON_KEY
        
        Make sure these are configured in your .env.local file for local development
        or in your Vercel project settings for production.
      `);
    }
  }

  supabase = createBrowserClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
  );
} else {
  // Provide a mock client for server-side rendering
  supabase = createBrowserClient(
    'https://placeholder.supabase.co',
    'placeholder'
  );
}

export { supabase };

export type Gender = 'male' | 'female';
export type EntryType = 'entry' | 'exit';

export interface Entry {
  id: string;
  gender: Gender;
  timestamp: string;
  type: EntryType;
}

export interface Admin {
  id: string;
  email: string;
  role: 'admin';
} 