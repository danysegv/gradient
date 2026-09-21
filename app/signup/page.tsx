import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign up — 04AM" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Get into the library."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="text-bone underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
