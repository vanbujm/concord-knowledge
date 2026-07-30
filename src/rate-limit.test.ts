import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, clientIdentifier } from "@/rate-limit";

// These exercise the in-memory fallback, which is what runs whenever Upstash is
// not configured. The module reads the Upstash env vars once at import time and
// the test environment sets none, so the fallback is the active backend here.

const REQUESTS_PER_MINUTE = 30;
const WINDOW_MS = 1000 * 60;

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit and refuses the next one", async () => {
    const identifier = "allows-up-to-the-limit";

    for (let attempt = 0; attempt < REQUESTS_PER_MINUTE; attempt += 1) {
      expect(await checkRateLimit(identifier)).toBe(true);
    }

    expect(await checkRateLimit(identifier)).toBe(false);
  });

  it("does not spend one identifier's budget on another", async () => {
    const identifier = "budget-is-per-identifier";

    for (let attempt = 0; attempt < REQUESTS_PER_MINUTE; attempt += 1) {
      await checkRateLimit(identifier);
    }

    expect(await checkRateLimit(identifier)).toBe(false);
    expect(await checkRateLimit("a-different-caller")).toBe(true);
  });

  it("allows again once the window elapses", async () => {
    const identifier = "window-elapses";

    for (let attempt = 0; attempt < REQUESTS_PER_MINUTE; attempt += 1) {
      await checkRateLimit(identifier);
    }

    expect(await checkRateLimit(identifier)).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1);

    expect(await checkRateLimit(identifier)).toBe(true);
  });
});

describe("clientIdentifier", () => {
  const withHeaders = (headers: Record<string, string>): Request =>
    new Request("https://example.test/api/search", { headers });

  it("takes the first entry of x-forwarded-for", () => {
    const request = withHeaders({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });

    expect(clientIdentifier(request)).toBe("203.0.113.9");
  });

  it("trims surrounding whitespace", () => {
    const request = withHeaders({ "x-forwarded-for": "  203.0.113.9  " });

    expect(clientIdentifier(request)).toBe("203.0.113.9");
  });

  it("falls back to a shared bucket when the header is absent", () => {
    expect(clientIdentifier(withHeaders({}))).toBe("anonymous");
  });
});
