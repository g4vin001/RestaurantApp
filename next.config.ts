import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server output tracing scoped to this app even when the checkout sits
  // below another directory containing an unrelated package-lock.json.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Restaurant photo uploads are resized in the browser and capped at 2 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
