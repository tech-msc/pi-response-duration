const THRESHOLD_MS = 30_000;

/** Return a display label for an eligible completed response, or undefined. */
export function getResponseDuration(startedAt, endedAt, outcome, mode) {
  if (startedAt === undefined || outcome !== "completed" || mode !== "tui") return undefined;

  const elapsedMs = endedAt - startedAt;
  if (elapsedMs <= THRESHOLD_MS) return undefined;

  const totalSeconds = Math.ceil(elapsedMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${totalSeconds}s`;
}
