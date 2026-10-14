import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // sharp is loaded at runtime (lib/clips/image-bytes.ts). Its native
  // libvips lives in a separate @img package that output tracing missed,
  // so on Vercel sharp failed to load with "libvips-cpp.so… cannot open
  // shared object file". Ship both with every server function.
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  // Security headers on every route (security review 2026-10-13, #4).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          dev: process.env.NODE_ENV !== "production",
        }),
      },
    ];
  },
};

export default nextConfig;
