import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { logEvent } from "@/log";

// Per-IP rate limiting shared by both surfaces. Search is cheap (no LLM), so
// this is abuse/DoS protection for the free database tier rather than a cost
// control.
//
// Two backends. When Upstash is configured the limit is distributed, so it holds
// across every serverless instance at once. When it is not, we fall back to an
// in-process counter rather than allowing everything: a fallback that caps each
// instance individually is weaker than a shared one (a caller spread across N
// warm instances gets roughly N budgets), but it still bounds a single flood and
// it cannot be switched off by forgetting an environment variable.

const REQUESTS_PER_MINUTE = 30;
const WINDOW_MS = 1000 * 60;

// Cap how many identifiers the in-memory backend tracks, so the map cannot grow
// without bound across a long-lived instance.
const MAX_TRACKED_IDENTIFIERS = 10000;

// Two naming conventions reach the same Upstash database. Provisioning it
// through the Vercel marketplace injects KV_REST_API_URL and KV_REST_API_TOKEN;
// creating one directly on upstash.com gives the UPSTASH_REDIS_REST_ names
// instead. Read whichever pair is present so neither route needs the values
// copied into a second variable.
const createUpstashLimiter = (): Ratelimit | null => {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(REQUESTS_PER_MINUTE, "1 m"),
    prefix: "concord-search",
  });
};

const upstashLimiter = createUpstashLimiter();

logEvent("rate_limit_backend", {
  backend: upstashLimiter ? "upstash" : "in-memory",
  requestsPerMinute: REQUESTS_PER_MINUTE,
});

type WindowCounter = { count: number; resetAt: number };

const counters = new Map<string, WindowCounter>();

// Drop every window that has already elapsed. Called when the map hits its cap,
// which is the only moment the size actually matters.
const sweepExpired = (now: number): void => {
  for (const [identifier, counter] of counters) {
    if (counter.resetAt <= now) {
      counters.delete(identifier);
    }
  }
};

const checkInMemory = (identifier: string): boolean => {
  const now = Date.now();
  const existing = counters.get(identifier);

  if (!existing || existing.resetAt <= now) {
    if (counters.size >= MAX_TRACKED_IDENTIFIERS) {
      sweepExpired(now);
    }

    // Every window is still live, so evict the one that frees up soonest to
    // make room rather than letting the map grow past the cap.
    if (counters.size >= MAX_TRACKED_IDENTIFIERS) {
      const oldest = [...counters.entries()].reduce((earliest, entry) =>
        entry[1].resetAt < earliest[1].resetAt ? entry : earliest,
      );

      counters.delete(oldest[0]);
    }

    counters.set(identifier, { count: 1, resetAt: now + WINDOW_MS });

    return true;
  }

  if (existing.count >= REQUESTS_PER_MINUTE) {
    return false;
  }

  existing.count += 1;

  return true;
};

export const checkRateLimit = async (identifier: string): Promise<boolean> => {
  if (!upstashLimiter) {
    return checkInMemory(identifier);
  }

  const { success } = await upstashLimiter.limit(identifier);

  return success;
};

export const clientIdentifier = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");

  return forwarded?.split(",")[0]?.trim() || "anonymous";
};
