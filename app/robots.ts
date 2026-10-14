import type { MetadataRoute } from "next";
import { configuredSiteOrigin } from "@/lib/site-url";

// robots.txt (2026-10-14). Everyone may read the public library; nobody is
// invited into the tools, account pages or the API. "/clip$" is the
// clipper itself only: /clip/<id> is each clip's public page and stays
// open (CLAUDE.md, 2026-09-11).
//
// This asks politely; it locks nothing. Every private page still checks
// who is signed in, whatever a crawler does.
export default function robots(): MetadataRoute.Robots {
  const base = configuredSiteOrigin(process.env);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/clip$",
        "/clip/team",
        "/clip-login",
        "/api/",
        "/auth/",
        "/notifications",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
