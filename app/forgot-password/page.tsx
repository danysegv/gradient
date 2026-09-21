import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset your password — 04AM" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password."
      footer={
        <Link href="/signin" className="text-bone underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
