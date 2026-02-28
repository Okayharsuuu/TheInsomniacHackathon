// Supabase Credentials
// Replace these with your actual Supabase URL and Anon Key from your project dashboard
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize and expose globally for app.js
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
