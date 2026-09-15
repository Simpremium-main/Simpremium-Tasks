import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, using the service role key (bypasses Row
 * Level Security). Never import this from a "use client" component or
 * otherwise let the service role key reach the browser — every caller in
 * this codebase is a server component or API route.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceKey);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  if (!client) {
    // Temporary diagnostic: the dashboard has been showing data that
    // doesn't match what's actually in the `skills` table when checked
    // directly in Supabase, even against a confirmed-current deployment and
    // a confirmed-matching project URL. Logging exactly what this running
    // function connects to (safe to log — the URL is already a
    // NEXT_PUBLIC_ var, and only the key's length/last 4 chars are logged,
    // never the key itself) so it's checkable in Vercel's function logs
    // instead of guessing further. Remove once this is root-caused.
    console.log(
      `[supabaseClient] connecting to ${url} with service role key ` +
        `(len=${serviceKey.length}, ends "...${serviceKey.slice(-6)}")`
    );
    client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return client;
}
