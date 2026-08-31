import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server output tracing scoped to this app even when the checkout sits
  // below another directory containing an unrelated package-lock.json.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
