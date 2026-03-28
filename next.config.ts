import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "@radix-ui/react-icons"],
  },
};

export default nextConfig;
