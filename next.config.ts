import type { NextConfig } from "next";

// Everything the pages need is same-origin: next/font self-hosts Geist into
// /_next at build time, Tailwind is compiled into our own stylesheet, and no
// image, script, or stylesheet is fetched from another host at runtime. So the
// policy can be 'self' throughout, and the one place we have to loosen it is
// inline content: Next serves its hydration payload as inline <script> and
// injects inline <style>, neither of which carries a nonce unless we add
// middleware to stamp one per request. 'unsafe-inline' therefore stays until
// that middleware exists. It still buys the main protection, which is that an
// injected <script src="..."> pointing at another host will not load.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The deployment sent no security headers beyond Vercel's default HSTS. There
  // is no login and no cookie here, so these are defence in depth rather than a
  // fix for a known hole.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        // frame-ancestors above already refuses framing; this repeats it for
        // browsers that predate CSP level 2.
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
  // Pin the workspace root. Without this, Next infers it from the nearest
  // lockfile and can wander up to a stray lockfile in the home directory.
  turbopack: {
    root: import.meta.dirname,
  },
  // Trim the client bundle by letting Next optimize named imports from these
  // large packages so only the pieces actually used are pulled in. (Next
  // already does this for lucide-react by default.)
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
  // Transformers.js and its native ONNX runtime load from node_modules at
  // runtime rather than being bundled into the serverless function.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // onnxruntime-node ships ~210MB of prebuilt binaries for every platform. The
  // Vercel runtime is Linux x64, so dropping the macOS, Windows, and Linux
  // arm64 binaries trims it to the ~26MB the function actually loads, keeping it
  // under the 250MB serverless size cap.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/bin/napi-v*/darwin/**",
      "node_modules/onnxruntime-node/bin/napi-v*/win32/**",
      "node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**",
      // Transformers.js pulls both the Node and WASM ONNX runtimes; the Node
      // build (transformers.node.mjs) imports onnxruntime-node, so the WASM
      // build and its dependencies never load at runtime here. (sharp is NOT
      // safe to exclude the same way: transformers.node.mjs imports it at module
      // load, so dropping it makes the whole package fail with ERR_MODULE_NOT_FOUND.)
      "node_modules/onnxruntime-web/**",
    ],
  },
  // The native binding dlopens libonnxruntime.so.1 at runtime. The file tracer
  // only sees the required .node binding, not that dlopen, so it never copies
  // the shared library. Force the whole Linux x64 binary directory into the two
  // routes that embed text, or the function loads the binding and then fails to
  // open its shared object.
  outputFileTracingIncludes: {
    "/api/**": ["node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**"],
  },
};

export default nextConfig;
