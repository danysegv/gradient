import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/auth/next";

export const metadata = { title: "Sign in — 04AM" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string }>;
}) {
  const { next, link } = await searchParams;
  return (
    <AuthShell
      title="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-bone underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {(link === "expired" || link === "invalid") && (
        <p role="alert" className="mb-6 text-center text-[14px] text-bone">
          That link has expired or was already used. Sign in, or ask for a new one.
        </p>
      )}
      <SignInForm next={safeNext(next)} />
    </AuthShell>
  );
}
