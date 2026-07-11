import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Per-IP rate limiting shared by both surfaces. Search is cheap (no LLM), so
// this is abuse/DoS protection for the free database tier rather than a cost
// control. When Upstash is not configured (local dev), it is disabled and every
// request is allowed.

const REQUESTS_PER_MINUTE = 30;

const createLimiter = (): Ratelimit | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(REQUESTS_PER_MINUTE, "1 m"),
    prefix: "concord-search",
  });
};

const limiter = createLimiter();

export const checkRateLimit = async (identifier: string): Promise<boolean> => {
  if (!limiter) {
    return true;
  }

  const { success } = await limiter.limit(identifier);

  return success;
};

export const clientIdentifier = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");

  return forwarded?.split(",")[0]?.trim() || "anonymous";
};
