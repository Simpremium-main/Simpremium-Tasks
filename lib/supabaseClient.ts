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
    client = createClient(url, serviceKey, {
      auth: { persistSession: false },
      // The actual root cause of "have to purge Vercel's Runtime/Data Cache
      // to see changes" — export const dynamic = "force-dynamic" (already
      // set on every route in this app) only disables Next's Full Route
      // Cache, NOT its Data Cache for individual fetch() calls. The
      // Supabase client makes its own plain fetch() calls under the hood,
      // and Next's global fetch patch caches those by default unless each
      // call explicitly opts out — this is a documented gap (an open
      // Next.js PR: "'force-dynamic' does not opt out of the data cache"),
      // and this exact fix (a custom `fetch` forcing cache: "no-store") is
      // Supabase's own documented workaround for it. Without this, a run
      // that just wrote to the DB could still read back the pre-write
      // response from Next's cache on the very next request.
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}
