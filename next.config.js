/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every dynamic page/API route already opts out of Next's own Data/Full
  // Route Cache (`export const dynamic = "force-dynamic"`, confirmed set on
  // every route that reads from Supabase — see README's "stale data" note),
  // which should already stop Vercel's Edge Network from caching them too.
  // If staleness still shows up after that fix is live, the remaining
  // suspect is a layer downstream of this app entirely — the browser's own
  // HTTP cache, or an intermediate proxy — honoring whatever Cache-Control
  // Next happened to send rather than actually re-checking with the
  // server. This forces every non-static route to be explicitly
  // uncacheable at that layer too, belt-and-suspenders on top of
  // force-dynamic, not a replacement for it. Static assets under
  // /_next/static (immutable, content-hashed — caching those forever is
  // correct and desired) are deliberately excluded via the negative
  // lookahead, same matcher shape middleware.ts already uses.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
