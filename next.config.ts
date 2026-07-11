import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Next infers it from the nearest
  // lockfile and can wander up to a stray lockfile in the home directory.
  turbopack: {
    root: import.meta.dirname,
  },
  // Transformers.js and its native ONNX runtime must load from node_modules at
  // runtime, not be bundled into the serverless function (the native binding
  // alone would blow the 250MB function size limit).
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // The query path runs the ONNX WASM backend on Vercel, so the native
  // onnxruntime-node binary is never loaded there. Dropping it from the traced
  // function bundle is what keeps the serverless function under the 250MB cap.
  outputFileTracingExcludes: {
    "*": ["node_modules/onnxruntime-node/**"],
  },
};

export default nextConfig;
