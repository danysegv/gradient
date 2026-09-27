import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is loaded at runtime (lib/clips/image-bytes.ts). Its native
  // libvips lives in a separate @img package that output tracing missed,
  // so on Vercel sharp failed to load with "libvips-cpp.so… cannot open
  // shared object file". Ship both with every server function.
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
};

export default nextConfig;
