import { LoginForm } from "./login-form";

export default async function ClipLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-lg">Gradient Clipper</h1>
      {error === "magic-link" && (
        <p role="alert" className="text-sm text-red-600">
          That sign-in link is invalid or expired. Request a new one.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
