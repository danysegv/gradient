import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Choose a new password — 04AM" };

// Reached from the reset email via /auth/callback, which has already signed
// the person in with the one-time code; this just sets the new password.
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
