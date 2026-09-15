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
    client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return client;
}
