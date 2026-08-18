import { LoginForm } from "./login-form";

export default function ClipLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-lg">Gradient Clipper</h1>
      <LoginForm />
    </main>
  );
}
