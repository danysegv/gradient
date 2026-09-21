import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

// Curators sign in with their account now (/signin). The old per-curator
// password stays here as a fallback until every curator has linked an
// account on /clip/team, after which CLIP_CURATORS can be removed.
export default function ClipLoginPage() {
  return (
    <AuthShell
      title="Curator sign-in."
      footer={
        <Link href="/signin?next=/clip" className="text-bone underline underline-offset-4">
          Sign in with your account instead
        </Link>
      }
    >
      <p className="mb-6 text-center text-[14px] text-bone/60">Using your old curator password.</p>
      <LoginForm />
    </AuthShell>
  );
}
