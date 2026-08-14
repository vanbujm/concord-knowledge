// Throwaway diagnostic: reproduce the wiki's block from a datacentre IP and
// capture enough of the response to name which Cloudflare product is doing it.
// Cloudflare identifies itself in the response: `cf-mitigated: challenge` marks a
// challenge, and its block pages carry a four digit error code (1015 rate limited,
// 1020 firewall rule, 1010 browser integrity check). Delete once answered.

const WIKI_PROBE_URL =
  "https://wiki.concordlarp.com/api.php?action=query&meta=siteinfo&format=json&formatversion=2";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BODY_SNIPPET_LENGTH = 2500;
const CLOUDFLARE_ERROR_CODE = /Error\s*(\d{4})/i;

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
  const egressAddress = await readEgressAddress();

  try {
    const response = await fetch(WIKI_PROBE_URL, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });

    const body = await response.text();
    const errorCode = body.match(CLOUDFLARE_ERROR_CODE);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });

    return Response.json({
      egressAddress,
      region: process.env.VERCEL_REGION ?? null,
      status: response.status,
      statusText: response.statusText,
      cloudflareErrorCode: errorCode ? errorCode[1] : null,
      headers,
      bodySnippet: body.slice(0, BODY_SNIPPET_LENGTH),
    });
  } catch (probeError) {
    return Response.json({
      egressAddress,
      error: probeError instanceof Error ? probeError.message : String(probeError),
    });
  }
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
