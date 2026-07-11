import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Next infers it from the nearest
  // lockfile and can wander up to a stray lockfile in the home directory.
  turbopack: {
    root: import.meta.dirname,
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
