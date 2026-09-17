/** How long an execution actually took, wall-clock — for a multi-chunk run,
 *  startedAt is the very first chunk and finishedAt is stamped only once
 *  the run reaches a terminal status (lib/data.ts's updateExecution), so
 *  this is the total across every chunk, not just the last one. Null while
 *  still running/pending — there's nothing to report yet. */
export function executionDurationMs(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  return new Date(finishedAt).getTime() - new Date(startedAt).getTime();
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}min ${seconds}s` : `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}
