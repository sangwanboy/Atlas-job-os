import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "@radix-ui/react-icons"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/pipeline",
        destination: "/jobs",
        permanent: false,
      },
      {
        source: "/saved",
        destination: "/jobs",
        permanent: false,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry build-time options — all optional, no-op without SENTRY_DSN
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,           // suppress build output noise
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
  // Don't upload source maps unless SENTRY_AUTH_TOKEN is set
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  telemetry: false,
});
