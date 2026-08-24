import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
