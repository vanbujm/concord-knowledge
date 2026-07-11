import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Next infers it from the nearest
  // lockfile and can wander up to a stray lockfile in the home directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
