import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { logoutFromClipper } from "./logout-actions";

// A signed-in account that hasn't been approved as a curator. Clipping is
// invite-only until the legal consult (see the rights note in CLAUDE.md),
// so this is a plain statement, not an error.
export function NotACurator({ email }: { email: string }) {
  return (
    <AuthShell
      title="Not a curator yet."
      footer={
        <form action={logoutFromClipper}>
          <button type="submit" className="text-bone underline underline-offset-4">
            Sign out
          </button>
        </form>
      }
    >
      <p className="text-center text-[15px] leading-relaxed text-bone/75">
        You&rsquo;re signed in as <span className="text-bone">{email}</span>.
        Clipping is by invitation for now — once your account is approved, this
        page becomes your clipper.
      </p>
      <p className="mt-6 text-center">
        <Link href="/" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-bone hover:text-bone/70">
          Back to the library
        </Link>
      </p>
    </AuthShell>
  );
}
