import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SessionKeeper } from "@/components/session-keeper";
import { CookieNotice } from "@/components/cookie-notice";
import { SiteFooter } from "@/components/site-footer";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// Grotesk throughout, per CLAUDE.md — variable font covers the full
// weight range in one download (quiet regular for stats/labels, 600 for
// the wordmark and headlines, up to 700 for large display type).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "04AM — Signals Feed",
  description:
    "Real trend data paired with real visual inspiration — pulled live from the reference library.",
};

// The browser's own chrome (mobile address bar) follows the system setting.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a0e" },
    { media: "(prefers-color-scheme: light)", color: "#f3f1eb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme on <html>
    // before React hydrates, on purpose.
    <html lang="en" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* A chosen theme, applied before first paint (lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SessionKeeper />
        {children}
        <SiteFooter />
        <CookieNotice />
      </body>
    </html>
  );
}
