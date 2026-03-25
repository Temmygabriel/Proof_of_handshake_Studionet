import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows genlayer-js to work properly in Next.js
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
