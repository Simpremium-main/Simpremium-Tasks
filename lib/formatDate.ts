// `toLocaleString("pt-BR")` with no explicit timeZone uses the runtime's own
// local zone — UTC on Vercel's server, but the user's browser zone (Brazil,
// UTC-3) on the client. Same timestamp, two different strings, which is a
// guaranteed React hydration mismatch (errors #425/#418/#423) on every page
// that renders one during SSR. Pinning a fixed zone here makes server and
// client agree; America/Sao_Paulo (not UTC) is chosen because this is a
// single-user internal tool for a Brazil-based user, so the displayed time
// should read as their own local time, not UTC.
const TIME_ZONE = "America/Sao_Paulo";

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("pt-BR", { timeZone: TIME_ZONE });
}
