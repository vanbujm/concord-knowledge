// Throwaway diagnostic: does the Concord wiki answer requests made from
// Vercel's egress, or does it refuse them the way it refuses GitHub Actions
// runners? Hits the same endpoint the ingest fetcher uses, under a few header
// variants, and reports what came back. Delete once the question is settled.

const WIKI_PROBE_URL =
  "https://wiki.concordlarp.com/api.php?action=query&list=allpages&apnamespace=0&apprefix=Winds+of+the+World&aplimit=5&format=json&formatversion=2";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BODY_SNIPPET_LENGTH = 300;

type ProbeVariant = {
  label: string;
  headers: Record<string, string>;
};

const variants: ProbeVariant[] = [
  {
    label: "fetcher-user-agent",
    headers: { "User-Agent": BROWSER_USER_AGENT },
  },
  {
    label: "no-user-agent",
    headers: {},
  },
  {
    label: "browser-like-headers",
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  },
];

const runVariant = async (variant: ProbeVariant) => {
  try {
    const response = await fetch(WIKI_PROBE_URL, { headers: variant.headers });
    const body = await response.text();

    return {
      label: variant.label,
      status: response.status,
      contentType: response.headers.get("content-type"),
      server: response.headers.get("server"),
      cfRay: response.headers.get("cf-ray"),
      bodySnippet: body.slice(0, BODY_SNIPPET_LENGTH),
    };
  } catch (probeError) {
    return {
      label: variant.label,
      error: probeError instanceof Error ? probeError.message : String(probeError),
    };
  }
};

const readEgressAddress = async (): Promise<string | null> => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const payload: unknown = await response.json();

    if (
      typeof payload === "object" &&
      payload !== null &&
      "ip" in payload &&
      typeof payload.ip === "string"
    ) {
      return payload.ip;
    }

    return null;
  } catch {
    return null;
  }
};

export const GET = async (): Promise<Response> => {
  const [egressAddress, results] = await Promise.all([
    readEgressAddress(),
    Promise.all(variants.map(runVariant)),
  ]);

  return Response.json({
    egressAddress,
    region: process.env.VERCEL_REGION ?? null,
    results,
  });
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
