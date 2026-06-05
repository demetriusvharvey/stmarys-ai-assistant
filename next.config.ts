import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow any machine on the St. Mary's LAN (10.10.x.x)
  allowedDevOrigins: ["10.10.*.*"],
};

export default nextConfig;
