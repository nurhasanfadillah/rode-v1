import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["*.preview.emergentagent.com", "*.preview.emergentcf.cloud", "*.cluster-11.preview.emergentcf.cloud", "redone-rode.cluster-11.preview.emergentcf.cloud"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  turbopack: { root: __dirname },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
