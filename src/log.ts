// Minimal structured logging: one JSON object per line, so logs stay greppable
// in local runs, CI, and Vercel's log drain without pulling in a logging library.
export const logEvent = (event: string, data: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ event, ...data }));
};
